CREATE TABLE "SmsOutbox" (
    "smsId" SERIAL NOT NULL,
    "recipientPhone" TEXT,
    "message" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "SmsOutbox_pkey" PRIMARY KEY ("smsId")
);

CREATE UNIQUE INDEX "SmsOutbox_eventKey_key" ON "SmsOutbox"("eventKey");
CREATE UNIQUE INDEX "SmsOutbox_trackingId_key" ON "SmsOutbox"("trackingId");
CREATE INDEX "SmsOutbox_status_nextAttemptAt_idx" ON "SmsOutbox"("status", "nextAttemptAt");
CREATE INDEX "SmsOutbox_providerMessageId_idx" ON "SmsOutbox"("providerMessageId");
