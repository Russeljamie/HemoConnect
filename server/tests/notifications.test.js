const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");

describe("Authenticated notifications", () => {
  let patientUser;
  let donorUser;
  let patientToken;
  let donorToken;

  beforeAll(async () => {
    [patientUser, donorUser] = await Promise.all([
      prisma.user.findUnique({ where: { email: "patient1@hemoconnect.co.ke" } }),
      prisma.user.findUnique({ where: { email: "donor1@hemoconnect.co.ke" } }),
    ]);
    patientToken = jwt.sign(
      { userId: patientUser.userId, role: patientUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
    donorToken = jwt.sign(
      { userId: donorUser.userId, role: donorUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
  });

  it("lists notifications only for the signed-in user and supports read actions", async () => {
    const notification = await prisma.notification.create({
      data: {
        type: "TEST_NOTIFICATION",
        channel: "IN_APP",
        title: "Test notification",
        message: "Private notification for this patient.",
        status: "SENT",
        userId: patientUser.userId,
      },
    });

    try {
      const [patientList, donorList] = await Promise.all([
        request(app).get("/api/notifications").set("Authorization", `Bearer ${patientToken}`),
        request(app).get("/api/notifications").set("Authorization", `Bearer ${donorToken}`),
      ]);
      expect(patientList.status).toBe(200);
      expect(patientList.body.data.notifications).toEqual(
        expect.arrayContaining([expect.objectContaining({ notificationId: notification.notificationId })])
      );
      expect(donorList.status).toBe(200);
      expect(donorList.body.data.notifications).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ notificationId: notification.notificationId })])
      );

      const markedRead = await request(app)
        .patch(`/api/notifications/${notification.notificationId}/read`)
        .set("Authorization", `Bearer ${patientToken}`);
      expect(markedRead.status).toBe(200);
      expect((await prisma.notification.findUnique({
        where: { notificationId: notification.notificationId },
      })).readAt).toBeInstanceOf(Date);

      const foreignRead = await request(app)
        .patch(`/api/notifications/${notification.notificationId}/read`)
        .set("Authorization", `Bearer ${donorToken}`);
      expect(foreignRead.status).toBe(404);
    } finally {
      await prisma.notification.delete({ where: { notificationId: notification.notificationId } });
    }
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/api/notifications");
    expect(response.status).toBe(401);
  });
});
