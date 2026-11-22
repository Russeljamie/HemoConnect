const nodemailer = require("nodemailer");
const prisma = require("./prisma");
const env = require("../config/env");

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;
const WORKER_INTERVAL_MS = 30 * 1000;

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const formatDate = (value) => {
  if (!value) return "Not specified";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
};

const templates = {
  WELCOME: ({ name, role }) => ({
    subject: "Welcome to HemoConnect",
    text: `Hello ${name},\n\nWelcome to HemoConnect. Your ${role} account is ready. Sign in at ${env.CLIENT_URL}/login to continue.\n\nHemoConnect`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>Welcome to HemoConnect. Your ${escapeHtml(role)} account is ready.</p><p><a href="${escapeHtml(env.CLIENT_URL)}/login">Sign in to HemoConnect</a></p>`,
  }),
  PASSWORD_RESET: ({ name, resetUrl, expiresInMinutes }) => ({
    subject: "Reset your HemoConnect password",
    text: `Hello ${name},\n\nWe received a request to reset your HemoConnect password. Use this link within ${expiresInMinutes} minutes:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>We received a request to reset your HemoConnect password. This link expires in ${escapeHtml(expiresInMinutes)} minutes.</p><p><a href="${escapeHtml(resetUrl)}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
  }),
  PASSWORD_CHANGED: ({ name }) => ({
    subject: "Your HemoConnect password was changed",
    text: `Hello ${name},\n\nYour HemoConnect password was changed. If you did not make this change, reset your password immediately at ${env.CLIENT_URL}/forgot-password.`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>Your HemoConnect password was changed.</p><p>If you did not make this change, <a href="${escapeHtml(env.CLIENT_URL)}/forgot-password">reset your password immediately</a>.</p>`,
  }),
  EMAIL_CHANGED: ({ name, newEmail }) => ({
    subject: "Your HemoConnect email address was changed",
    text: `Hello ${name},\n\nThe email address on your HemoConnect account was changed to ${newEmail}. If you did not make this change, contact support.`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>The email address on your HemoConnect account was changed to ${escapeHtml(newEmail)}.</p><p>If you did not make this change, contact support.</p>`,
  }),
  APPOINTMENT_BOOKED: ({ name, date, time, hospital, purpose }) => ({
    subject: "Your HemoConnect appointment was booked",
    text: `Hello ${name},\n\nYour ${purpose} appointment is scheduled for ${formatDate(date)} at ${time} with ${hospital}. The hospital will confirm it.`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>Your ${escapeHtml(purpose)} appointment is scheduled for ${escapeHtml(formatDate(date))} at ${escapeHtml(time)} with ${escapeHtml(hospital)}. The hospital will confirm it.</p>`,
  }),
  APPOINTMENT_CONFIRMED: ({ name, date, time, hospital, purpose }) => ({
    subject: "Your HemoConnect appointment is confirmed",
    text: `Hello ${name},\n\nYour ${purpose} appointment at ${hospital} is confirmed for ${formatDate(date)} at ${time}.`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>Your ${escapeHtml(purpose)} appointment at ${escapeHtml(hospital)} is confirmed for ${escapeHtml(formatDate(date))} at ${escapeHtml(time)}.</p>`,
  }),
  APPOINTMENT_CANCELLED: ({ name, date, time, hospital, purpose }) => ({
    subject: "Your HemoConnect appointment was cancelled",
    text: `Hello ${name},\n\nYour ${purpose} appointment at ${hospital} on ${formatDate(date)} at ${time} was cancelled.`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>Your ${escapeHtml(purpose)} appointment at ${escapeHtml(hospital)} on ${escapeHtml(formatDate(date))} at ${escapeHtml(time)} was cancelled.</p>`,
  }),
  APPOINTMENT_RESCHEDULED: ({ name, date, time, hospital, purpose }) => ({
    subject: "Your HemoConnect appointment was rescheduled",
    text: `Hello ${name},\n\nYour ${purpose} appointment at ${hospital} has been rescheduled to ${formatDate(date)} at ${time}.`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>Your ${escapeHtml(purpose)} appointment at ${escapeHtml(hospital)} has been rescheduled to ${escapeHtml(formatDate(date))} at ${escapeHtml(time)}.</p>`,
  }),
  EMERGENCY_REQUEST_CREATED: ({ name, requestId, bloodType, status, hospital }) => ({
    subject: "An official HemoConnect blood request was created",
    text: `Hello ${name},\n\nHospital staff created official request #${requestId} for ${bloodType} blood at ${hospital}. Current status: ${status}.`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>Hospital staff created official request #${escapeHtml(requestId)} for ${escapeHtml(bloodType)} blood at ${escapeHtml(hospital)}. Current status: ${escapeHtml(status)}.</p>`,
  }),
  EMERGENCY_REQUEST_UPDATED: ({ name, requestId, bloodType, status, hospital, update }) => ({
    subject: `HemoConnect request #${requestId} update`,
    text: `Hello ${name},\n\nThere is an update to official request #${requestId} for ${bloodType} blood at ${hospital}. ${update}\nCurrent status: ${status}.`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>There is an update to official request #${escapeHtml(requestId)} for ${escapeHtml(bloodType)} blood at ${escapeHtml(hospital)}. ${escapeHtml(update)}</p><p>Current status: ${escapeHtml(status)}.</p>`,
  }),
  DONOR_EMERGENCY_ALERT: ({ name, requestId, bloodType, urgency, distanceKm, neededBy, hospital }) => ({
    subject: `${urgency} HemoConnect blood donation request nearby`,
    text: `Hello ${name},\n\nYour donor profile matched official request #${requestId}: ${bloodType} blood is needed (${urgency.toLowerCase()}) about ${distanceKm} km away${hospital ? ` at ${hospital}` : ""}. Needed by ${formatDate(neededBy)}.\n\nSign in to review and respond: ${env.CLIENT_URL}/donor/alerts`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>Your donor profile matched an official request: <strong>${escapeHtml(bloodType)}</strong> blood is needed (${escapeHtml(String(urgency).toLowerCase())}) about ${escapeHtml(distanceKm)} km away${hospital ? ` at ${escapeHtml(hospital)}` : ""}. Needed by ${escapeHtml(formatDate(neededBy))}.</p><p><a href="${escapeHtml(env.CLIENT_URL)}/donor/alerts">Sign in to review and respond</a></p>`,
  }),
};

let transport;
let workerTimer;

const getTransport = () => {
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.EMAIL_FROM) return null;
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must either both be set or both be empty.");
  }
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
    });
  }
  return transport;
};

const isEmailConfigured = () =>
  Boolean(env.SMTP_HOST && env.SMTP_PORT && env.EMAIL_FROM) &&
  Boolean(env.SMTP_USER) === Boolean(env.SMTP_PASSWORD);

const enqueueEmail = async (tx, recipientEmail, template, payload) => {
  if (!recipientEmail) return null;
  if (!templates[template]) throw new Error(`Unknown email template: ${template}`);

  return tx.emailOutbox.create({
    data: {
      recipientEmail: recipientEmail.trim().toLowerCase(),
      template,
      payload,
    },
    select: { emailId: true },
  });
};

const deliverOutboxEmail = async (email) => {
  const mailTransport = getTransport();
  if (!mailTransport) throw new Error("SMTP is not configured; email remains queued.");
  const render = templates[email.template];
  if (!render) throw new Error(`Unknown email template in outbox: ${email.template}`);
  const rendered = render(email.payload);
  await mailTransport.sendMail({
    from: env.EMAIL_FROM,
    to: email.recipientEmail,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  });
};

const processEmailOutbox = async (now = new Date()) => {
  const mailTransport = getTransport();
  if (!mailTransport) return 0;

  await prisma.emailOutbox.updateMany({
    where: {
      status: "PROCESSING",
      processingAt: { lt: new Date(now.getTime() - 10 * 60 * 1000) },
    },
    data: { status: "QUEUED", processingAt: null },
  });

  const emails = await prisma.emailOutbox.findMany({
    where: {
      status: "QUEUED",
      nextAttemptAt: { lte: now },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: [{ createdAt: "asc" }, { emailId: "asc" }],
    take: BATCH_SIZE,
  });

  let delivered = 0;
  for (const email of emails) {
    const claimed = await prisma.emailOutbox.updateMany({
      where: { emailId: email.emailId, status: "QUEUED" },
      data: { status: "PROCESSING", processingAt: now },
    });
    if (!claimed.count) continue;

    try {
      await deliverOutboxEmail(email);
      await prisma.emailOutbox.update({
        where: { emailId: email.emailId },
        data: { status: "SENT", sentAt: new Date(), processingAt: null, lastError: null },
      });
      delivered += 1;
    } catch (error) {
      const attempts = email.attempts + 1;
      const failedPermanently = attempts >= MAX_ATTEMPTS;
      const retryDelayMinutes = Math.min(60, 2 ** attempts);
      await prisma.emailOutbox.update({
        where: { emailId: email.emailId },
        data: {
          status: failedPermanently ? "FAILED" : "QUEUED",
          attempts,
          nextAttemptAt: new Date(now.getTime() + retryDelayMinutes * 60 * 1000),
          processingAt: null,
          lastError: String(error.message || error).slice(0, 1000),
        },
      });
      console.error(
        `Transactional email ${email.emailId} (${email.template}) to ${email.recipientEmail} failed on attempt ${attempts}${failedPermanently ? " (no more retries)" : ""}:`,
        error
      );
    }
  }
  return delivered;
};

const startEmailWorker = () => {
  if (workerTimer) return workerTimer;
  if (!getTransport()) {
    console.warn("SMTP is not configured. Transactional emails will remain queued until SMTP settings are added.");
    return null;
  }

  const run = () => {
    processEmailOutbox().catch((error) => {
      console.error("Transactional email worker failed:", error);
    });
  };
  run();
  workerTimer = setInterval(run, env.EMAIL_WORKER_INTERVAL_MS);
  workerTimer.unref();
  return workerTimer;
};

module.exports = {
  enqueueEmail,
  isEmailConfigured,
  processEmailOutbox,
  startEmailWorker,
  renderEmailTemplate: (template, payload) => {
    const render = templates[template];
    if (!render) throw new Error(`Unknown email template: ${template}`);
    return render(payload);
  },
};
