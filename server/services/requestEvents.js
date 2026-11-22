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

};

module.exports = { recordRequestEvent };
