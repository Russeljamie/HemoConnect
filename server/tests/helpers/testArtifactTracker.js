const models = [
  { key: "notifications", model: "notification", id: "notificationId" },
  { key: "emails", model: "emailOutbox", id: "emailId" },
  { key: "sms", model: "smsOutbox", id: "smsId" },
  { key: "audits", model: "auditLog", id: "auditLogId" },
];

const combineScopes = (scopes) => {
  if (!scopes.length) return null;
  return scopes.length === 1 ? scopes[0] : { OR: scopes };
};

const createTestArtifactTracker = (prisma) => {
  let baselineIds;
  let scopes;
  let ownedIds;

  const reset = () => {
    baselineIds = null;
    scopes = Object.fromEntries(models.map(({ key }) => [key, []]));
    ownedIds = Object.fromEntries(models.map(({ key }) => [key, new Set()]));
  };

  const addScope = (key, where) => {
    if (!where || typeof where !== "object") throw new Error(`A ${key} cleanup scope is required.`);
    scopes[key].push(where);
  };

  const snapshotExisting = async () => {
    if (baselineIds) {
      throw new Error("Clean the previous test artifacts before taking another baseline snapshot.");
    }
    const rows = await Promise.all(models.map(({ model, id }) =>
      prisma[model].findMany({
        select: { [id]: true },
      })
    ));
    baselineIds = Object.fromEntries(models.map(({ key }, index) => [
      key,
      new Set(rows[index].map((row) => row[models[index].id])),
    ]));
  };

  const capture = async () => {
    if (!baselineIds) {
      if (Object.values(scopes).some((entries) => entries.length)) {
        throw new Error("Snapshot existing test artifacts before tracking or cleaning them.");
      }
      return;
    }
    for (const { key, model, id } of models) {
      const where = combineScopes(scopes[key]);
      if (!where) continue;
      const rows = await prisma[model].findMany({ where, select: { [id]: true } });
      for (const row of rows) {
        const rowId = row[id];
        if (!baselineIds[key].has(rowId)) ownedIds[key].add(rowId);
      }
    }
  };

  const cleanup = async () => {
    if (!baselineIds) {
      if (Object.values(scopes).some((entries) => entries.length)) {
        throw new Error("Cannot clean test artifacts before taking a baseline snapshot.");
      }
      return;
    }

    await capture();
    const ids = Object.fromEntries(models.map(({ key }) => [key, [...ownedIds[key]]]));
    await prisma.$transaction(async (tx) => {
      for (const { key, model, id } of models) {
        if (ids[key].length) {
          await tx[model].deleteMany({ where: { [id]: { in: ids[key] } } });
        }
      }
    });
    reset();
  };

  reset();
  return {
    snapshotExisting,
    capture,
    cleanup,
    trackNotification: (where) => addScope("notifications", where),
    trackEmail: (where) => addScope("emails", where),
    trackSms: (where) => addScope("sms", where),
    trackAudit: (where) => addScope("audits", where),
  };
};

module.exports = { createTestArtifactTracker };
