const getPatientRecipientIds = async (tx, patientId) => {
  if (!patientId) return [];

  const patient = await tx.patient.findUnique({
    where: { patientId },
    select: {
      userId: true,
      accessGrants: {
        where: { status: "ACTIVE" },
        select: { userId: true },
      },
    },
  });

  return [...new Set([
    patient?.userId,
    ...(patient?.accessGrants || []).map(({ userId }) => userId),
  ].filter(Boolean))];
};

const recordRequestEvent = async (tx, {
  request,
  actorUserId,
  action,
  fromStatus = null,
  toStatus = request.status,
  details = {},
  title,
  message,
}) => {
  await tx.auditLog.create({
    data: {
      action,
      entityType: "EmergencyRequest",
      entityId: String(request.requestId),
      actorUserId,
      details: { fromStatus, toStatus, ...details },
    },
  });

  const recipientIds = await getPatientRecipientIds(tx, request.patientId);
  if (recipientIds.length && message) {
    await tx.notification.createMany({
      data: recipientIds.map((userId) => ({
        type: "EMERGENCY_REQUEST_UPDATE",
        channel: "IN_APP",
        title,
        message,
        status: "SENT",
        sentAt: new Date(),
        userId,
        requestId: request.requestId,
      })),
    });
  }
};

module.exports = { getPatientRecipientIds, recordRequestEvent };
