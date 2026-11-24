const crypto = require("crypto");
const prisma = require("./prisma");
const env = require("../config/env");

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

class SmsProviderError extends Error {
  constructor(message, { retryable = true, responseCode = null } = {}) {
    super(message);
    this.name = "SmsProviderError";
    this.retryable = retryable;
    this.responseCode = responseCode;
  }
}

const normalizeKenyanPhoneNumber = (value) => {
  if (typeof value !== "string") return null;
  const phone = value.trim().replace(/[\s()-]/g, "");
  const local = /^(?:\+?254|0)([17]\d{8})$/.exec(phone);
  return local ? `+254${local[1]}` : null;
};

const createMobileSasaProvider = ({
  token = env.MOBILESASA_API_TOKEN,
  senderId = env.MOBILESASA_SENDER_ID,
  endpoint = env.MOBILESASA_API_URL,
  callbackUrl = env.SMS_DELIVERY_REPORT_URL,
  fetchImpl = globalThis.fetch,
} = {}) => ({
  async send({ phone, message, trackingId }) {
    if (!token || !senderId) {
      throw new SmsProviderError("MobileSasa credentials are not configured.", { retryable: false });
    }
    if (typeof fetchImpl !== "function") {
      throw new SmsProviderError("This Node.js runtime does not provide fetch for SMS delivery.", { retryable: false });
    }
    if (new URL(endpoint).protocol !== "https:") {
      throw new SmsProviderError("MobileSasa API endpoint must use HTTPS.", { retryable: false });
    }

    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          senderID: senderId,
          phone,
          message,
          trackingId,
          ...(callbackUrl ? { callbackUrl } : {}),
        }),
      });
    } catch {
      throw new SmsProviderError("MobileSasa could not be reached.");
    }

    let result;
    try {
      result = await response.json();
    } catch {
      throw new SmsProviderError("MobileSasa returned an unreadable response.", {
        retryable: response.status >= 500 || response.status === 429,
      });
    }

    if (!response.ok || result.status !== true || result.responseCode !== "0200") {
      const responseCode = typeof result.responseCode === "string" ? result.responseCode : null;
      const retryable = response.status >= 500 || response.status === 429 ||
        responseCode === "0402" || responseCode === "0408";
      throw new SmsProviderError("MobileSasa did not accept the SMS.", { retryable, responseCode });
    }

    return {
      providerMessageId: typeof result.messageId === "string" ? result.messageId : null,
    };
  },
});

const isSmsConfigured = () =>
  env.SMS_PROVIDER === "mobilesasa" &&
  Boolean(env.MOBILESASA_API_TOKEN && env.MOBILESASA_SENDER_ID);

const enqueueSmsOnce = async (tx, recipientPhone, message, eventKey) => {
  if (!eventKey || typeof eventKey !== "string") throw new Error("SMS event key is required.");
  if (typeof message !== "string" || !message.trim()) throw new Error("SMS message is required.");

  const normalizedPhone = normalizeKenyanPhoneNumber(recipientPhone);
  const trackingId = `hc-${crypto.randomUUID()}`;
  const data = {
    recipientPhone: normalizedPhone,
    message: message.trim(),
    eventKey,
    trackingId,
    ...(!normalizedPhone ? {
      status: "FAILED",
      failedAt: new Date(),
      lastError: "No valid Kenyan mobile number is registered for this notification.",
    } : {}),
  };
  const result = await tx.smsOutbox.createMany({ data, skipDuplicates: true });
  const sms = await tx.smsOutbox.findUnique({ where: { eventKey } });
  return { sms, created: result.count === 1 };
};

const enqueueSms = async (tx, recipientPhone, message, eventKey) =>
  (await enqueueSmsOnce(tx, recipientPhone, message, eventKey)).sms;

const safeProviderError = (error) => {
  const responseCode = error.responseCode ? ` (${error.responseCode})` : "";
  return `${error instanceof SmsProviderError ? error.message : "SMS delivery attempt failed."}${responseCode}`.slice(0, 500);
};

const processSmsOutbox = async (now = new Date(), provider = null, options = {}) => {
  const smsProvider = provider || (isSmsConfigured() ? createMobileSasaProvider() : null);
  if (!smsProvider) return 0;

  await prisma.smsOutbox.updateMany({
    where: {
      status: "PROCESSING",
      processingAt: { lt: new Date(now.getTime() - PROCESSING_TIMEOUT_MS) },
    },
    data: {
      status: "FAILED",
      failedAt: now,
      processingAt: null,
      lastError: "Delivery outcome is unknown after a worker interruption; automatic resend was stopped to avoid duplicates.",
    },
  });

  const messages = await prisma.smsOutbox.findMany({
    where: {
      status: "QUEUED",
      nextAttemptAt: { lte: now },
      attempts: { lt: MAX_ATTEMPTS },
      ...(options.eventKey ? { eventKey: options.eventKey } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { smsId: "asc" }],
    take: BATCH_SIZE,
  });

  let accepted = 0;
  for (const sms of messages) {
    const claimed = await prisma.smsOutbox.updateMany({
      where: { smsId: sms.smsId, status: "QUEUED" },
      data: { status: "PROCESSING", processingAt: now },
    });
    if (!claimed.count) continue;

    let acceptedByProvider = false;
    try {
      const result = await smsProvider.send({
        phone: sms.recipientPhone,
        message: sms.message,
        trackingId: sms.trackingId,
      });
      acceptedByProvider = true;
      await prisma.smsOutbox.updateMany({
        where: { smsId: sms.smsId, status: "PROCESSING" },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          providerMessageId: result.providerMessageId,
          processingAt: null,
          lastError: null,
        },
      });
      accepted += 1;
    } catch (error) {
      if (acceptedByProvider) {
        console.error(
          `SMS outbox ${sms.smsId} was accepted by the provider but its outbox state could not be recorded; manual reconciliation is required.`
        );
        continue;
      }
      const attempts = sms.attempts + 1;
      const retryable = !(error instanceof SmsProviderError) || error.retryable;
      const failedPermanently = !retryable || attempts >= MAX_ATTEMPTS;
      const retryDelayMinutes = Math.min(60, 2 ** attempts);
      const updated = await prisma.smsOutbox.updateMany({
        where: { smsId: sms.smsId, status: "PROCESSING" },
        data: {
          status: failedPermanently ? "FAILED" : "QUEUED",
          attempts,
          nextAttemptAt: new Date(now.getTime() + retryDelayMinutes * 60 * 1000),
          processingAt: null,
          ...(failedPermanently ? { failedAt: new Date() } : {}),
          lastError: safeProviderError(error),
        },
      });
      if (updated.count) {
        console.error(
          `SMS outbox ${sms.smsId} attempt ${attempts}${failedPermanently ? " failed permanently" : " will retry"}: ${safeProviderError(error)}`
        );
      }
    }
  }
  return accepted;
};

const normalizeDeliveryStatus = (status) => {
  const statuses = {
    delivered: "DELIVERED",
    failed: "FAILED",
    rejected: "REJECTED",
    expired: "EXPIRED",
    unreachable: "UNREACHABLE",
    sent: "ACCEPTED",
  };
  return typeof status === "string" ? statuses[status.toLowerCase()] || null : null;
};

const updateSmsDeliveryReport = async (report) => {
  const status = normalizeDeliveryStatus(report.status);
  if (!status) return false;

  const sms = typeof report.trackingId === "string" && report.trackingId
    ? await prisma.smsOutbox.findUnique({ where: { trackingId: report.trackingId } })
    : typeof report.reference === "string" && report.reference
      ? await prisma.smsOutbox.findFirst({ where: { providerMessageId: report.reference } })
      : null;
  if (!sms) return false;
  if (["DELIVERED", "FAILED", "REJECTED", "EXPIRED", "UNREACHABLE"].includes(sms.status)) {
    return true;
  }

  const finalFailure = ["FAILED", "REJECTED", "EXPIRED", "UNREACHABLE"].includes(status);
  const updated = await prisma.smsOutbox.updateMany({
    where: { smsId: sms.smsId, status: { in: ["ACCEPTED", "PROCESSING"] } },
    data: {
      status,
      ...(typeof report.reference === "string" ? { providerMessageId: report.reference } : {}),
      ...(status === "ACCEPTED" ? { acceptedAt: new Date() } : {}),
      ...(status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
      ...(finalFailure ? {
        failedAt: new Date(),
        lastError: typeof report.deliveryStatus === "string"
          ? report.deliveryStatus.slice(0, 500)
          : `Provider delivery status: ${status}`,
      } : {}),
    },
  });
  return updated.count > 0;
};

const verifyMobileSasaWebhook = (rawBody, headers, secret = env.MOBILESASA_WEBHOOK_SECRET) => {
  if (!secret || !Buffer.isBuffer(rawBody)) return false;
  const header = headers["x-mobilesasa-signature"];
  if (typeof header !== "string") return false;
  const values = Object.fromEntries(header.split(",").map((part) => {
    const separator = part.indexOf("=");
    return separator < 0 ? ["", ""] : [part.slice(0, separator), part.slice(separator + 1)];
  }));
  const timestamp = Number(values.t);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300 || !/^[a-f0-9]{64}$/i.test(values.v1 || "")) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${values.t}.`)
    .update(rawBody)
    .digest();
  const actual = Buffer.from(values.v1, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

let workerTimer;
const startSmsWorker = () => {
  if (workerTimer) return workerTimer;
  if (!isSmsConfigured()) {
    console.warn("MobileSasa SMS delivery is not configured. SMS messages will remain queued.");
    return null;
  }

  const run = () => {
    processSmsOutbox().catch((error) => {
      console.error("SMS delivery worker failed:", error.message);
    });
  };
  run();
  workerTimer = setInterval(run, env.SMS_WORKER_INTERVAL_MS);
  workerTimer.unref();
  return workerTimer;
};

module.exports = {
  SmsProviderError,
  normalizeKenyanPhoneNumber,
  createMobileSasaProvider,
  isSmsConfigured,
  enqueueSmsOnce,
  enqueueSms,
  processSmsOutbox,
  normalizeDeliveryStatus,
  updateSmsDeliveryReport,
  verifyMobileSasaWebhook,
  startSmsWorker,
};
