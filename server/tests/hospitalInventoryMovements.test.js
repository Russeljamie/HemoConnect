const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");

describe("hospital inventory API", () => {
  let staff;
  let staffUserId;
  let staffToken;
  let donorToken;

  beforeAll(async () => {
    const [staffUser, donor] = await Promise.all([
      prisma.user.findUnique({ where: { email: "staff1@hemoconnect.co.ke" }, include: { hospitalStaff: true } }),
      prisma.user.findUnique({ where: { email: "donor1@hemoconnect.co.ke" } }),
    ]);
    staff = staffUser.hospitalStaff;
    staffUserId = staffUser.userId;
    staffToken = jwt.sign({ userId: staffUser.userId, role: staffUser.role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
    donorToken = jwt.sign({ userId: donor.userId, role: donor.role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
  });

  it("updates minimum stock only for the staff member's hospital and audits the change", async () => {
    const inventory = await prisma.bloodInventory.findUnique({
      where: { hospitalId_bloodType: { hospitalId: staff.hospitalId, bloodType: "O+" } },
    });
    const originalMinimum = inventory.minimumUnits;
    const originalUpdatedAt = inventory.updatedAt;
    const startedAt = new Date();
    let anotherHospitalInventory;
    try {
      const invalid = await request(app)
        .patch(`/api/hospital/inventory/${inventory.inventoryId}/minimum`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ minimumUnits: -1 });
      expect(invalid.status).toBe(400);

      const updated = await request(app)
        .patch(`/api/hospital/inventory/${inventory.inventoryId}/minimum`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ minimumUnits: 13 });
      expect(updated.status).toBe(200);
      expect(updated.body.data.inventory.minimumUnits).toBe(13);

      anotherHospitalInventory = await prisma.bloodInventory.findFirst({
        where: { hospitalId: { not: staff.hospitalId } },
        select: { inventoryId: true },
      });
      if (anotherHospitalInventory) {
        const outOfScope = await request(app)
          .patch(`/api/hospital/inventory/${anotherHospitalInventory.inventoryId}/minimum`)
          .set("Authorization", `Bearer ${staffToken}`)
          .send({ minimumUnits: 99 });
        expect(outOfScope.status).toBe(404);
      }

      const audit = await prisma.auditLog.findFirst({
        where: {
          entityType: "BloodInventory",
          entityId: String(inventory.inventoryId),
          action: "HOSPITAL_INVENTORY_MINIMUM_UPDATED",
          createdAt: { gte: startedAt },
        },
      });
      expect(audit.details).toMatchObject({
        hospitalId: staff.hospitalId,
        bloodType: "O+",
        previousMinimumUnits: originalMinimum,
        newMinimumUnits: 13,
      });
    } finally {
      await prisma.bloodInventory.update({
        where: { inventoryId: inventory.inventoryId },
        data: { minimumUnits: originalMinimum, updatedAt: originalUpdatedAt },
      });
      await prisma.auditLog.deleteMany({
        where: {
          entityType: "BloodInventory",
          entityId: String(inventory.inventoryId),
          action: "HOSPITAL_INVENTORY_MINIMUM_UPDATED",
          createdAt: { gte: startedAt },
        },
      });
    }
  });

  it("reports additions, fulfilled requests, and manual removals distinctly with filters", async () => {
    let inventory = await prisma.bloodInventory.findUnique({
      where: { hospitalId_bloodType: { hospitalId: staff.hospitalId, bloodType: "O+" } },
    });
    const createdInventory = !inventory;
    if (!inventory) {
      inventory = await prisma.bloodInventory.create({
        data: { hospitalId: staff.hospitalId, bloodType: "O+", unitsAvailable: 0 },
      });
    }

    const marker = `inventory movements test ${Date.now()}`;
    const createdTransactions = [];
    try {
      for (const [transactionType, unitsChanged] of [
        ["STOCK_ADDITION", 5],
        ["REQUEST_FULFILLMENT", -3],
        ["STOCK_REMOVAL", -2],
      ]) {
        createdTransactions.push(await prisma.inventoryTransaction.create({
          data: {
            inventoryId: inventory.inventoryId,
            transactionType,
            unitsChanged,
            reason: marker,
            performedByUserId: staffUserId,
            createdAt: new Date("2020-03-01T10:00:00.000Z"),
          },
        }));
      }

      const response = await request(app)
        .get("/api/hospital/inventory/transactions?from=2020-03-01&to=2020-03-01&bloodType=O%2B")
        .set("Authorization", `Bearer ${staffToken}`);
      expect(response.status).toBe(200);
      expect(response.body.data.summary).toMatchObject({
        unitsAdded: 5,
        unitsFulfilled: 3,
        unitsManuallyRemoved: 2,
        totalUnitsOut: 5,
      });
      expect(response.body.data.transactions).toEqual(expect.arrayContaining([
        expect.objectContaining({ transactionType: "STOCK_ADDITION", unitsChanged: 5, bloodType: "O+" }),
        expect.objectContaining({ transactionType: "REQUEST_FULFILLMENT", unitsChanged: -3, bloodType: "O+" }),
        expect.objectContaining({ transactionType: "STOCK_REMOVAL", unitsChanged: -2, bloodType: "O+" }),
      ]));
      expect(response.body.data.transactions).toHaveLength(3);

      const donorResponse = await request(app)
        .get("/api/hospital/inventory/transactions")
        .set("Authorization", `Bearer ${donorToken}`);
      expect(donorResponse.status).toBe(403);
    } finally {
      await prisma.inventoryTransaction.deleteMany({
        where: { transactionId: { in: createdTransactions.map(({ transactionId }) => transactionId) } },
      });
      if (createdInventory) {
        await prisma.bloodInventory.delete({ where: { inventoryId: inventory.inventoryId } });
      }
    }
  });
});
