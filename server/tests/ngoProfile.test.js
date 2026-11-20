const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");

describe("NGO profile API", () => {
  let ngoToken;
  let otherNgoToken;
  let donorToken;
  let ngoUser;

  beforeAll(async () => {
    ngoUser = await prisma.user.findUnique({
      where: { email: "ngo1@hemoconnect.co.ke" },
      include: { ngoUser: true },
    });
    const otherNgoUser = await prisma.user.findUnique({
      where: { email: "ngo2@hemoconnect.co.ke" },
    });
    const donorUser = await prisma.user.findUnique({
      where: { email: "donor1@hemoconnect.co.ke" },
    });

    ngoToken = jwt.sign(
      { userId: ngoUser.userId, role: ngoUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
    otherNgoToken = jwt.sign(
      { userId: otherNgoUser.userId, role: otherNgoUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
    donorToken = jwt.sign(
      { userId: donorUser.userId, role: donorUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
  });

  it("returns the NGO summary and campaign metrics for the authenticated user", async () => {
    const response = await request(app)
      .get("/api/ngo/profile")
      .set("Authorization", `Bearer ${ngoToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.role).toBe("NGO");
    expect(response.body.data.metrics).toHaveProperty("campaigns");
    expect(Array.isArray(response.body.data.campaigns)).toBe(true);
  });

  it("creates, lists, and activates a campaign owned by the authenticated NGO", async () => {
    const partnerHospital = await prisma.hospital.findFirst({
      where: { ngos: { some: { ngoId: ngoUser.ngoUser.ngoId } }, isActive: true },
      select: { hospitalId: true },
    });
    const hospitalStaff = await prisma.hospitalStaff.findFirst({
      where: { hospitalId: partnerHospital.hospitalId },
      select: { staffId: true },
    });
    const donationNeed = await prisma.hospitalDonationNeed.create({
      data: {
        bloodType: "O+",
        unitsNeeded: 13,
        neededBy: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        hospitalId: partnerHospital.hospitalId,
        createdByStaffId: hospitalStaff.staffId,
      },
    });
    const startDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const endDate = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
    const campaignData = {
      name: `NGO workflow ${Date.now()}`,
      description: "A test campaign created through the NGO management workflow.",
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      location: "Nairobi",
      hospitalId: partnerHospital.hospitalId,
      hospitalNeedId: donationNeed.needId,
    };
    const response = await request(app)
      .post("/api/ngo/campaigns")
      .set("Authorization", `Bearer ${ngoToken}`)
      .send(campaignData);

    expect(response.status).toBe(201);
    const campaignId = response.body.data.campaign.campaignId;

    try {
      expect(response.body.data.campaign.ngoId).toBe(ngoUser.ngoUser.ngoId);
      expect(response.body.data.campaign.createdByNgoUserId).toBe(ngoUser.ngoUser.ngoUserId);
      expect(response.body.data.campaign.hospitalId).toBe(partnerHospital.hospitalId);
      expect(response.body.data.campaign.hospitalNeedId).toBe(donationNeed.needId);
      const donorAnnouncements = await prisma.notification.findMany({
        where: { campaignId, type: "CAMPAIGN_ANNOUNCEMENT" },
        include: { user: { select: { role: true, donor: { select: { bloodType: true } } } } },
      });
      expect(donorAnnouncements.length).toBeGreaterThan(0);
      expect(donorAnnouncements.every(({ user }) =>
        user.role === "DONOR" && user.donor?.bloodType === donationNeed.bloodType
      )).toBe(true);

      const listResponse = await request(app)
        .get("/api/ngo/campaigns")
        .set("Authorization", `Bearer ${ngoToken}`);
      expect(listResponse.status).toBe(200);
      expect(listResponse.body.data.campaigns).toEqual(
        expect.arrayContaining([expect.objectContaining({ campaignId })])
      );
      expect(listResponse.body.data.hospitals.length).toBeGreaterThan(0);
      const needsResponse = await request(app)
        .get("/api/ngo/donation-needs")
        .set("Authorization", `Bearer ${ngoToken}`);
      expect(needsResponse.status).toBe(200);
      expect(needsResponse.body.data.needs).toEqual(
        expect.arrayContaining([expect.objectContaining({ needId: donationNeed.needId, hospitalId: partnerHospital.hospitalId })])
      );
      expect(needsResponse.body.data.needs.find(({ needId }) => needId === donationNeed.needId)).not.toHaveProperty("patient");

      const activationResponse = await request(app)
        .patch(`/api/ngo/campaigns/${campaignId}`)
        .set("Authorization", `Bearer ${ngoToken}`)
        .send({ status: "ACTIVE" });
      expect(activationResponse.status).toBe(200);
      expect(activationResponse.body.data.campaign.status).toBe("ACTIVE");

      const registrationResponse = await request(app)
        .post(`/api/donor/campaigns/${campaignId}/register`)
        .set("Authorization", `Bearer ${donorToken}`);
      expect(registrationResponse.status).toBe(201);

      const duplicateRegistration = await request(app)
        .post(`/api/donor/campaigns/${campaignId}/register`)
        .set("Authorization", `Bearer ${donorToken}`);
      expect(duplicateRegistration.status).toBe(409);

      const notificationResponse = await request(app)
        .get("/api/ngo/notifications")
        .set("Authorization", `Bearer ${ngoToken}`);
      expect(notificationResponse.status).toBe(200);
      const notification = notificationResponse.body.data.notifications.find(
        (item) => item.campaignId === campaignId
      );
      expect(notification).toEqual(expect.objectContaining({
        type: "CAMPAIGN_REGISTRATION",
        readAt: null,
      }));
      expect(notificationResponse.body.data.unreadCount).toBeGreaterThan(0);

      const otherNgoNotifications = await request(app)
        .get("/api/ngo/notifications")
        .set("Authorization", `Bearer ${otherNgoToken}`);
      expect(otherNgoNotifications.body.data.notifications).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ notificationId: notification.notificationId })])
      );

      const markReadResponse = await request(app)
        .patch(`/api/ngo/notifications/${notification.notificationId}/read`)
        .set("Authorization", `Bearer ${ngoToken}`);
      expect(markReadResponse.status).toBe(200);

      const foreignReadResponse = await request(app)
        .patch(`/api/ngo/notifications/${notification.notificationId}/read`)
        .set("Authorization", `Bearer ${otherNgoToken}`);
      expect(foreignReadResponse.status).toBe(404);

      const markAllResponse = await request(app)
        .patch("/api/ngo/notifications/read-all")
        .set("Authorization", `Bearer ${ngoToken}`);
      expect(markAllResponse.status).toBe(200);
      expect(markAllResponse.body.data.updatedCount).toEqual(expect.any(Number));

      const crossNgoResponse = await request(app)
        .patch(`/api/ngo/campaigns/${campaignId}`)
        .set("Authorization", `Bearer ${otherNgoToken}`)
        .send({ name: "Unauthorized edit" });
      expect(crossNgoResponse.status).toBe(404);
    } finally {
      await prisma.notification.deleteMany({ where: { campaignId } });
      await prisma.campaign.delete({ where: { campaignId } });
      await prisma.hospitalDonationNeed.delete({ where: { needId: donationNeed.needId } });
    }
  });

  it("rejects campaign dates where the end precedes the start", async () => {
    const response = await request(app)
      .post("/api/ngo/campaigns")
      .set("Authorization", `Bearer ${ngoToken}`)
      .send({
        name: "Invalid dates campaign",
        description: "A campaign with an invalid date range for validation.",
        startDate: "2026-11-20T00:00:00.000Z",
        endDate: "2026-11-10T00:00:00.000Z",
        location: "Nairobi",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("announces a general campaign to all active donor accounts", async () => {
    const activeDonors = await prisma.donor.findMany({
      where: { user: { status: "ACTIVE" } },
      select: { userId: true },
    });
    const startDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const response = await request(app)
      .post("/api/ngo/campaigns")
      .set("Authorization", `Bearer ${ngoToken}`)
      .send({
        name: `General campaign ${Date.now()}`,
        description: "A general community blood donation campaign.",
        startDate: startDate.toISOString(),
        endDate: new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        location: "Nairobi",
      });

    expect(response.status).toBe(201);
    const campaignId = response.body.data.campaign.campaignId;
    try {
      const announcements = await prisma.notification.findMany({
        where: { campaignId, type: "CAMPAIGN_ANNOUNCEMENT" },
        select: { userId: true },
      });
      expect(announcements.map(({ userId }) => userId).sort()).toEqual(
        activeDonors.map(({ userId }) => userId).sort()
      );
    } finally {
      await prisma.notification.deleteMany({ where: { campaignId } });
      await prisma.campaign.delete({ where: { campaignId } });
    }
  });

  it("returns date-filtered campaign and outreach reports scoped to the NGO", async () => {
    const donor = await prisma.donor.findFirst({ select: { donorId: true } });
    const now = new Date();
    const campaign = await prisma.campaign.create({
      data: {
        name: `Report test campaign ${Date.now()}`,
        description: "Temporary campaign for NGO report aggregation tests.",
        startDate: now,
        endDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
        location: "Nairobi",
        status: "ACTIVE",
        ngoId: ngoUser.ngoUser.ngoId,
        createdByNgoUserId: ngoUser.ngoUser.ngoUserId,
      },
    });
    let activityId;

    try {
      await prisma.campaignRegistration.create({
        data: { campaignId: campaign.campaignId, donorId: donor.donorId },
      });
      const activity = await prisma.outreachActivity.create({
        data: {
          title: "Report test outreach",
          activityType: "AWARENESS",
          description: "Temporary outreach record for NGO report aggregation tests.",
          location: "Nairobi",
          scheduledAt: now,
          peopleReached: 18,
          ngoId: ngoUser.ngoUser.ngoId,
          campaignId: campaign.campaignId,
          createdByNgoUserId: ngoUser.ngoUser.ngoUserId,
        },
      });
      activityId = activity.activityId;

      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const response = await request(app)
        .get(`/api/ngo/reports?from=${from}&to=${to}`)
        .set("Authorization", `Bearer ${ngoToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.metrics).toEqual(expect.objectContaining({
        campaigns: expect.any(Number),
        registeredDonors: expect.any(Number),
        outreachActivities: expect.any(Number),
        peopleReached: expect.any(Number),
      }));
      expect(response.body.data.campaigns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            campaignId: campaign.campaignId,
            registeredDonors: 1,
            outreachActivities: 1,
            peopleReached: 18,
          }),
        ])
      );
      expect(response.body.data.metrics.peopleReached).toBeGreaterThanOrEqual(18);

      const otherNgoResponse = await request(app)
        .get(`/api/ngo/reports?from=${from}&to=${to}`)
        .set("Authorization", `Bearer ${otherNgoToken}`);
      expect(otherNgoResponse.status).toBe(200);
      expect(otherNgoResponse.body.data.campaigns).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ campaignId: campaign.campaignId })])
      );
    } finally {
      if (activityId) {
        await prisma.outreachActivity.delete({ where: { activityId } });
      }
      await prisma.campaign.delete({ where: { campaignId: campaign.campaignId } });
    }
  });

  it("creates, lists, and completes an NGO-owned outreach activity", async () => {
    const startDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const campaign = await prisma.campaign.create({
      data: {
        name: `Outreach test campaign ${Date.now()}`,
        description: "Campaign linked to an outreach activity integration test.",
        startDate,
        endDate: new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000),
        location: "Nairobi",
        ngoId: ngoUser.ngoUser.ngoId,
        createdByNgoUserId: ngoUser.ngoUser.ngoUserId,
      },
    });
    let activityId;
    try {
      const response = await request(app)
        .post("/api/ngo/outreach")
        .set("Authorization", `Bearer ${ngoToken}`)
        .send({
          title: "Community donor awareness visit",
          activityType: "COMMUNITY_VISIT",
          description: "Meet residents and share local blood donation information.",
          location: "Westlands, Nairobi",
          scheduledAt: startDate.toISOString(),
          campaignId: campaign.campaignId,
        });

      expect(response.status).toBe(201);
      activityId = response.body.data.activity.activityId;
      expect(response.body.data.activity.ngoId).toBe(ngoUser.ngoUser.ngoId);
      expect(response.body.data.activity.createdByNgoUserId).toBe(ngoUser.ngoUser.ngoUserId);
      expect(response.body.data.activity.campaign.campaignId).toBe(campaign.campaignId);

      const listResponse = await request(app)
        .get("/api/ngo/outreach")
        .set("Authorization", `Bearer ${ngoToken}`);
      expect(listResponse.status).toBe(200);
      expect(listResponse.body.data.activities).toEqual(
        expect.arrayContaining([expect.objectContaining({ activityId })])
      );

      const updateResponse = await request(app)
        .patch(`/api/ngo/outreach/${activityId}`)
        .set("Authorization", `Bearer ${ngoToken}`)
        .send({ status: "IN_PROGRESS", peopleReached: 24 });
      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.data.activity.peopleReached).toBe(24);

      const completeResponse = await request(app)
        .patch(`/api/ngo/outreach/${activityId}`)
        .set("Authorization", `Bearer ${ngoToken}`)
        .send({ status: "COMPLETED" });
      expect(completeResponse.status).toBe(200);
      expect(completeResponse.body.data.activity.status).toBe("COMPLETED");

      const crossNgoResponse = await request(app)
        .patch(`/api/ngo/outreach/${activityId}`)
        .set("Authorization", `Bearer ${otherNgoToken}`)
        .send({ title: "Unauthorized activity edit" });
      expect(crossNgoResponse.status).toBe(404);
    } finally {
      if (activityId) {
        await prisma.outreachActivity.deleteMany({ where: { activityId } });
      }
      await prisma.campaign.delete({ where: { campaignId: campaign.campaignId } });
    }
  });
});
