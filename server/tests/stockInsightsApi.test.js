const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");

describe("hospital stock insight API", () => {
  let staff;
  let staffToken;
  let donorToken;

  beforeAll(async () => {
    const [staffUser, donor] = await Promise.all([
      prisma.user.findUnique({ where: { email: "staff1@hemoconnect.co.ke" }, include: { hospitalStaff: true } }),
      prisma.user.findUnique({ where: { email: "donor1@hemoconnect.co.ke" } }),
    ]);
    staff = staffUser.hospitalStaff;
    staffToken = jwt.sign({ userId: staffUser.userId, role: staffUser.role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
    donorToken = jwt.sign({ userId: donor.userId, role: donor.role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
  });

  it("isolates insights, validates settings, audits threshold decisions, and filters reports", async () => {
    const inventory = await prisma.bloodInventory.findUnique({
      where: { hospitalId_bloodType: { hospitalId: staff.hospitalId, bloodType: "O+" } },
    });
    const originalThreshold = inventory.minimumUnits;
    const originalSettings = await prisma.hospitalStockSettings.findUnique({ where: { hospitalId: staff.hospitalId } });
    const startedAt = new Date();
    const marker = `Stock insights API test ${Date.now()}`;
    const createdTransactions = [];
    try {
      const denied = await request(app).get("/api/hospital/stock-insights").set("Authorization", `Bearer ${donorToken}`);
      expect(denied.status).toBe(403);

      const invalidSettings = await request(app)
        .patch("/api/hospital/stock-insights/settings")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ historicalWindowDays: 2, replenishmentLeadTimeDays: -1, safetyBufferDays: 1 });
      expect(invalidSettings.status).toBe(400);

      const settingsResponse = await request(app)
        .patch("/api/hospital/stock-insights/settings")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ historicalWindowDays: 30, replenishmentLeadTimeDays: 2, safetyBufferDays: 1 });
      expect(settingsResponse.status).toBe(200);

      for (const daysAgo of [2, 8, 32, 38]) {
        createdTransactions.push(await prisma.inventoryTransaction.create({
          data: {
            inventoryId: inventory.inventoryId,
            transactionType: "REQUEST_FULFILLMENT",
            unitsChanged: -2,
            reason: marker,
            performedByUserId: (await prisma.user.findUnique({ where: { email: "staff1@hemoconnect.co.ke" }, select: { userId: true } })).userId,
            createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
          },
        }));
      }

      const insights = await request(app).get("/api/hospital/stock-insights").set("Authorization", `Bearer ${staffToken}`);
      expect(insights.status).toBe(200);
      expect(insights.body.data.recommendations.every((row) => row.inventoryId && row.bloodType)).toBe(true);
      const oPositive = insights.body.data.recommendations.find((row) => row.bloodType === "O+");
      expect(oPositive.currentUnitsIssued).toBeGreaterThanOrEqual(2);
      expect(oPositive.recommendedThreshold).not.toBeNull();

      const accepted = await request(app)
        .post(`/api/hospital/stock-insights/${inventory.inventoryId}/decision`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ decision: "ACCEPT_RECOMMENDED" });
      expect(accepted.status).toBe(200);
      const acceptedThreshold = accepted.body.data.inventory.minimumUnits;

      const retained = await request(app)
        .post(`/api/hospital/stock-insights/${inventory.inventoryId}/decision`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ decision: "RETAIN_CURRENT", reason: "Current threshold remains appropriate." });
      expect(retained.status).toBe(200);

      const overridden = await request(app)
        .post(`/api/hospital/stock-insights/${inventory.inventoryId}/decision`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ decision: "OVERRIDE", minimumUnits: acceptedThreshold + 2, reason: "Local replenishment route takes longer." });
      expect(overridden.status).toBe(200);
      expect(overridden.body.data.inventory.minimumUnits).toBe(acceptedThreshold + 2);

      const from = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const to = new Date().toISOString().slice(0, 10);
      const report = await request(app)
        .get(`/api/hospital/stock-insights/reports?from=${from}&to=${to}&bloodType=O%2B`)
        .set("Authorization", `Bearer ${staffToken}`);
      expect(report.status).toBe(200);
      expect(report.body.data.usage.every((row) => row.bloodType === "O+")).toBe(true);
      expect(report.body.data.thresholdDecisions.length).toBeGreaterThanOrEqual(3);

      const unfilteredReport = await request(app)
        .get(`/api/hospital/stock-insights/reports?from=${from}&to=${to}&bloodType=`)
        .set("Authorization", `Bearer ${staffToken}`);
      expect(unfilteredReport.status).toBe(200);

      const decisions = await prisma.auditLog.findMany({
        where: { entityType: "BloodInventory", entityId: String(inventory.inventoryId), action: "STOCK_THRESHOLD_DECISION", createdAt: { gte: startedAt } },
      });
      expect(decisions).toHaveLength(3);
      expect(decisions.every((entry) => entry.actorUserId !== null && entry.details.hospitalId === staff.hospitalId)).toBe(true);
      expect(decisions.every((entry) => Array.isArray(entry.details.sourceTransactionIds) && entry.details.sourceTransactionIds.length >= 2)).toBe(true);
    } finally {
      await prisma.auditLog.deleteMany({
        where: {
          createdAt: { gte: startedAt },
          OR: [
            { entityType: "BloodInventory", entityId: String(inventory.inventoryId), action: "STOCK_THRESHOLD_DECISION" },
            { entityType: "HospitalStockSettings", action: "HOSPITAL_STOCK_SETTINGS_UPDATED" },
          ],
        },
      });
      await prisma.inventoryTransaction.deleteMany({ where: { reason: marker } });
      await prisma.bloodInventory.update({ where: { inventoryId: inventory.inventoryId }, data: { minimumUnits: originalThreshold } });
      if (originalSettings) {
        await prisma.hospitalStockSettings.update({
          where: { hospitalId: staff.hospitalId },
          data: {
            historicalWindowDays: originalSettings.historicalWindowDays,
            replenishmentLeadTimeDays: originalSettings.replenishmentLeadTimeDays,
            safetyBufferDays: originalSettings.safetyBufferDays,
          },
        });
      } else {
        await prisma.hospitalStockSettings.deleteMany({ where: { hospitalId: staff.hospitalId } });
      }
    }
  });
});
