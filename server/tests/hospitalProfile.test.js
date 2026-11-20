const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");

describe("Hospital staff operations and authorization", () => {
  let staffToken;
  let staffUser;
  let donorUser;

  beforeAll(async () => {
    [staffUser, donorUser] = await Promise.all([
      prisma.user.findUnique({
        where: { email: "staff1@hemoconnect.co.ke" },
        include: { hospitalStaff: true },
      }),
      prisma.user.findUnique({
        where: { email: "donor1@hemoconnect.co.ke" },
        include: { donor: true },
      }),
    ]);
    staffToken = jwt.sign(
      { userId: staffUser.userId, role: staffUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
  });

  it("returns hospital profile and inventory scoped to its hospital", async () => {
    const [profile, inventory] = await Promise.all([
      request(app).get("/api/hospital/profile").set("Authorization", `Bearer ${staffToken}`),
      request(app).get("/api/hospital/inventory").set("Authorization", `Bearer ${staffToken}`),
    ]);

    expect(profile.status).toBe(200);
    expect(profile.body.data.user.role).toBe("HOSPITAL_STAFF");
    expect(profile.body.data.metrics).toHaveProperty("unitsAvailable");
    expect(inventory.status).toBe(200);
    expect(inventory.body.data.inventory.length).toBeGreaterThan(0);
    expect(inventory.body.data.inventory.every(
      (item) => item.hospitalId === staffUser.hospitalStaff.hospitalId
    )).toBe(true);
  });

  it("adjusts stock and records the acting staff member", async () => {
    const original = await prisma.bloodInventory.findFirst({
      where: { hospitalId: staffUser.hospitalStaff.hospitalId },
    });
    const reason = `Hospital API test ${Date.now()}`;
    try {
      const response = await request(app)
        .patch("/api/hospital/inventory")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ bloodType: original.bloodType, unitsChange: 2, reason });
      expect(response.status).toBe(200);
      expect(response.body.data.inventory.unitsAvailable).toBe(original.unitsAvailable + 2);

      const transaction = await prisma.inventoryTransaction.findFirst({
        where: { inventoryId: original.inventoryId, reason },
      });
      expect(transaction.unitsChanged).toBe(2);
      expect(transaction.performedByUserId).toBe(staffUser.userId);
    } finally {
      await prisma.bloodInventory.update({
        where: { inventoryId: original.inventoryId },
        data: { unitsAvailable: original.unitsAvailable },
      });
      await prisma.inventoryTransaction.deleteMany({ where: { inventoryId: original.inventoryId, reason } });
    }
  });

  it("lets a hospital claim and release an open unassigned request", async () => {
    const emergencyRequest = await prisma.emergencyRequest.create({
      data: {
        bloodType: "O+",
        quantityRequired: 1,
        urgencyLevel: "HIGH",
        status: "OPEN",
        neededBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
    });
    try {
      const claimResponse = await request(app)
        .patch(`/api/hospital/requests/${emergencyRequest.requestId}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "IN_PROGRESS" });
      expect(claimResponse.status).toBe(200);
      expect(claimResponse.body.data.request.hospitalId).toBe(staffUser.hospitalStaff.hospitalId);

      const releaseResponse = await request(app)
        .patch(`/api/hospital/requests/${emergencyRequest.requestId}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "OPEN" });
      expect(releaseResponse.status).toBe(200);
      expect(releaseResponse.body.data.request.status).toBe("OPEN");
      expect(releaseResponse.body.data.request.hospitalId).toBeNull();
    } finally {
      await prisma.auditLog.deleteMany({
        where: { entityType: "EmergencyRequest", entityId: String(emergencyRequest.requestId) },
      });
      await prisma.emergencyRequest.delete({ where: { requestId: emergencyRequest.requestId } });
    }
  });

  it("creates an accountless patient's official request and records inventory-backed fulfillment", async () => {
    const hospitalId = staffUser.hospitalStaff.hospitalId;
    let inventory = await prisma.bloodInventory.findUnique({
      where: { hospitalId_bloodType: { hospitalId, bloodType: "O+" } },
    });
    const createdInventory = !inventory;
    if (!inventory) {
      inventory = await prisma.bloodInventory.create({
        data: { hospitalId, bloodType: "O+", unitsAvailable: 0 },
      });
    } else {
      await prisma.bloodInventory.update({
        where: { inventoryId: inventory.inventoryId },
        data: { unitsAvailable: 0 },
      });
    }

    let requestId;
    let patientId;
    try {
      const createResponse = await request(app)
        .post("/api/hospital/requests")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          patient: { firstName: "Accountless", lastName: `Patient ${Date.now()}`, phone: "07123456789" },
          bloodType: "O+",
          quantityRequired: 2,
          urgencyLevel: "HIGH",
          neededBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          latitude: -1.286389,
          longitude: 36.817223,
        });
      expect(createResponse.status).toBe(201);
      requestId = createResponse.body.data.request.requestId;
      patientId = createResponse.body.data.request.patientId;
      expect(createResponse.body.data.request).toEqual(expect.objectContaining({
        hospitalId,
        requestedByUserId: staffUser.userId,
        createdByStaffId: staffUser.hospitalStaff.staffId,
      }));
      expect(await prisma.patient.findUnique({ where: { patientId }, select: { userId: true } }))
        .toEqual({ userId: null });

      const insufficient = await request(app)
        .post(`/api/hospital/requests/${requestId}/fulfill`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ quantity: 1 });
      expect(insufficient.status).toBe(409);
      expect((await prisma.emergencyRequest.findUnique({ where: { requestId } })).status).toBe("OPEN");
      expect((await prisma.bloodInventory.findUnique({ where: { inventoryId: inventory.inventoryId } })).unitsAvailable).toBe(0);

      await prisma.bloodInventory.update({
        where: { inventoryId: inventory.inventoryId },
        data: { unitsAvailable: 4 },
      });
      const partialResponse = await request(app)
        .post(`/api/hospital/requests/${requestId}/fulfill`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ quantity: 1 });
      expect(partialResponse.status).toBe(200);
      expect(partialResponse.body.data.request.status).toBe("PARTIALLY_FULFILLED");
      expect(partialResponse.body.data.request.fulfilledQuantity).toBe(1);

      const fulfilledResponse = await request(app)
        .post(`/api/hospital/requests/${requestId}/fulfill`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ quantity: 1, outcomeNotes: "Fulfilled from hospital inventory." });
      expect(fulfilledResponse.status).toBe(200);
      expect(fulfilledResponse.body.data.request.status).toBe("FULFILLED");
      expect(fulfilledResponse.body.data.request.fulfilledQuantity).toBe(2);
      expect(fulfilledResponse.body.data.request.fulfilledAt).toBeTruthy();

      const [updatedInventory, transactions, history] = await Promise.all([
        prisma.bloodInventory.findUnique({ where: { inventoryId: inventory.inventoryId } }),
        prisma.inventoryTransaction.findMany({ where: { requestId } }),
        prisma.auditLog.findMany({ where: { entityType: "EmergencyRequest", entityId: String(requestId) } }),
      ]);
      expect(updatedInventory.unitsAvailable).toBe(2);
      expect(transactions).toHaveLength(2);
      expect(transactions.reduce((sum, item) => sum + item.unitsChanged, 0)).toBe(-2);
      expect(history.map(({ action }) => action)).toEqual(expect.arrayContaining([
        "OFFICIAL_REQUEST_CREATED",
        "REQUEST_FULFILLMENT_RECORDED",
      ]));
    } finally {
      if (requestId) {
        await prisma.notification.deleteMany({ where: { requestId } });
        await prisma.inventoryTransaction.deleteMany({ where: { requestId } });
        await prisma.auditLog.deleteMany({ where: { entityType: "EmergencyRequest", entityId: String(requestId) } });
        await prisma.emergencyRequest.delete({ where: { requestId } });
      }
      if (patientId) await prisma.patient.delete({ where: { patientId } });
      if (createdInventory) {
        await prisma.bloodInventory.delete({ where: { inventoryId: inventory.inventoryId } });
      } else {
        await prisma.bloodInventory.update({
          where: { inventoryId: inventory.inventoryId },
          data: { unitsAvailable: inventory.unitsAvailable },
        });
      }
    }
  });

  it("requires verification before converting an assistance enquiry to a matched request", async () => {
    const patient = await prisma.patient.create({
      data: {
        firstName: "Enquiry",
        lastName: `Conversion ${Date.now()}`,
        phone: "07123456789",
        bloodType: "A+",
        hospitalId: staffUser.hospitalStaff.hospitalId,
      },
    });
    const enquiry = await prisma.assistanceEnquiry.create({
      data: {
        description: "Please review this request for hospital verification.",
        patientId: patient.patientId,
        preferredHospitalId: staffUser.hospitalStaff.hospitalId,
        requestedBloodType: "A+",
        quantityRequired: 1,
        urgencyLevel: "HIGH",
        neededBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        latitude: 0,
        longitude: 0,
      },
    });
    let requestId;
    try {
      const verifyResponse = await request(app)
        .post(`/api/hospital/enquiries/${enquiry.enquiryId}/review`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ decision: "VERIFY", reviewNotes: "Verified with the care team." });
      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.data.enquiry.status).toBe("VERIFIED");
      expect(await prisma.emergencyRequest.count({ where: { patientId: patient.patientId } })).toBe(0);

      const convertResponse = await request(app)
        .post(`/api/hospital/enquiries/${enquiry.enquiryId}/convert`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({});
      expect(convertResponse.status).toBe(201);
      requestId = convertResponse.body.data.request.requestId;
      expect(convertResponse.body.data.matching.alertedDonors).toEqual(expect.any(Number));
      expect(convertResponse.body.data.request.createdByStaffId).toBe(staffUser.hospitalStaff.staffId);
      expect(convertResponse.body.data.request.currentWave).toBe(1);

      const converted = await prisma.assistanceEnquiry.findUnique({ where: { enquiryId: enquiry.enquiryId } });
      expect(converted.status).toBe("CONVERTED");
      expect(converted.resultingRequestId).toBe(requestId);
    } finally {
      if (requestId) {
        await prisma.notification.deleteMany({ where: { requestId } });
        await prisma.auditLog.deleteMany({ where: { entityType: "EmergencyRequest", entityId: String(requestId) } });
        await prisma.emergencyRequest.delete({ where: { requestId } });
      }
      await prisma.auditLog.deleteMany({ where: { entityType: "AssistanceEnquiry", entityId: String(enquiry.enquiryId) } });
      await prisma.assistanceEnquiry.delete({ where: { enquiryId: enquiry.enquiryId } });
      await prisma.patient.delete({ where: { patientId: patient.patientId } });
    }
  });

  it("grants family access and limits request tracking to authorized patient records", async () => {
    const representative = await prisma.user.findFirst({
      where: { role: "PATIENT", status: "ACTIVE" },
      select: { userId: true, role: true, email: true },
    });
    const representativeToken = jwt.sign(
      { userId: representative.userId, role: representative.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
    const patient = await prisma.patient.create({
      data: {
        firstName: "Authorized",
        lastName: `Patient ${Date.now()}`,
        phone: "07123456789",
        hospitalId: staffUser.hospitalStaff.hospitalId,
      },
    });
    const ungrantedPatient = await prisma.patient.create({
      data: {
        firstName: "Restricted",
        lastName: `Patient ${Date.now()}`,
        phone: "07123456788",
        hospitalId: staffUser.hospitalStaff.hospitalId,
      },
    });
    const grantedRequest = await prisma.emergencyRequest.create({
      data: {
        bloodType: "A+",
        quantityRequired: 1,
        urgencyLevel: "MEDIUM",
        status: "OPEN",
        neededBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        patientId: patient.patientId,
        hospitalId: staffUser.hospitalStaff.hospitalId,
      },
    });
    const ungrantedRequest = await prisma.emergencyRequest.create({
      data: {
        bloodType: "B+",
        quantityRequired: 1,
        urgencyLevel: "MEDIUM",
        status: "OPEN",
        neededBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        patientId: ungrantedPatient.patientId,
        hospitalId: staffUser.hospitalStaff.hospitalId,
      },
    });
    try {
      const grantResponse = await request(app)
        .post(`/api/hospital/patients/${patient.patientId}/access`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ email: representative.email, relationship: "Family representative" });
      expect(grantResponse.status).toBe(200);
      expect(grantResponse.body.data.access.status).toBe("ACTIVE");

      const listResponse = await request(app)
        .get("/api/patient/requests")
        .set("Authorization", `Bearer ${representativeToken}`);
      expect(listResponse.status).toBe(200);
      expect(listResponse.body.data.requests.map(({ requestId }) => requestId)).toContain(grantedRequest.requestId);
      expect(listResponse.body.data.requests.map(({ requestId }) => requestId)).not.toContain(ungrantedRequest.requestId);
    } finally {
      await prisma.notification.deleteMany({ where: { requestId: { in: [grantedRequest.requestId, ungrantedRequest.requestId] } } });
      await prisma.emergencyRequest.deleteMany({ where: { requestId: { in: [grantedRequest.requestId, ungrantedRequest.requestId] } } });
      await prisma.patientAccess.deleteMany({ where: { patientId: patient.patientId } });
      await prisma.auditLog.deleteMany({ where: { entityType: "Patient", entityId: String(patient.patientId) } });
      await prisma.patient.deleteMany({ where: { patientId: { in: [patient.patientId, ungrantedPatient.patientId] } } });
    }
  });

  it("prevents staff from viewing or changing another hospital's request", async () => {
    const otherHospital = await prisma.hospital.findFirst({
      where: { hospitalId: { not: staffUser.hospitalStaff.hospitalId } },
      select: { hospitalId: true },
    });
    const emergencyRequest = await prisma.emergencyRequest.create({
      data: {
        bloodType: "B+",
        quantityRequired: 1,
        urgencyLevel: "HIGH",
        status: "IN_PROGRESS",
        neededBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        hospitalId: otherHospital.hospitalId,
      },
    });
    try {
      const listResponse = await request(app)
        .get("/api/hospital/requests")
        .set("Authorization", `Bearer ${staffToken}`);
      expect(listResponse.status).toBe(200);
      expect(listResponse.body.data.requests.map(({ requestId }) => requestId)).not.toContain(emergencyRequest.requestId);

      const releaseResponse = await request(app)
        .patch(`/api/hospital/requests/${emergencyRequest.requestId}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "OPEN" });
      expect(releaseResponse.status).toBe(409);

      const fulfillResponse = await request(app)
        .post(`/api/hospital/requests/${emergencyRequest.requestId}/fulfill`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ quantity: 1 });
      expect(fulfillResponse.status).toBe(404);
      expect((await prisma.emergencyRequest.findUnique({ where: { requestId: emergencyRequest.requestId } })).hospitalId)
        .toBe(otherHospital.hospitalId);
    } finally {
      await prisma.emergencyRequest.delete({ where: { requestId: emergencyRequest.requestId } });
    }
  });

  it("publishes donation needs and sends partner NGOs coordination notices", async () => {
    const hospitalId = staffUser.hospitalStaff.hospitalId;
    const unitsNeeded = 1234;
    const neededBy = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const partnerNgoUsers = await prisma.nGOUser.findMany({
      where: { ngo: { isActive: true, hospitals: { some: { hospitalId } } } },
      select: { userId: true },
    });
    let needId;
    try {
      const createResponse = await request(app)
        .post("/api/hospital/donation-needs")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ bloodType: "AB+", unitsNeeded, neededBy: neededBy.toISOString(), notes: "Coordinate a partner blood drive." });
      expect(createResponse.status).toBe(201);
      needId = createResponse.body.data.need.needId;
      expect(createResponse.body.data.need).toEqual(expect.objectContaining({
        hospitalId,
        createdByStaffId: staffUser.hospitalStaff.staffId,
        unitsNeeded,
        status: "OPEN",
      }));

      const needsResponse = await request(app)
        .get("/api/hospital/donation-needs")
        .set("Authorization", `Bearer ${staffToken}`);
      expect(needsResponse.body.data.needs).toEqual(expect.arrayContaining([expect.objectContaining({ needId })]));

      const notifications = await prisma.notification.findMany({
        where: {
          type: "HOSPITAL_DONATION_NEED",
          userId: { in: partnerNgoUsers.map(({ userId }) => userId) },
          message: { contains: `${unitsNeeded} units` },
        },
      });
      expect(notifications).toHaveLength(partnerNgoUsers.length);

      const progressResponse = await request(app)
        .patch(`/api/hospital/donation-needs/${needId}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "IN_PROGRESS" });
      expect(progressResponse.status).toBe(200);
      const fulfilledResponse = await request(app)
        .patch(`/api/hospital/donation-needs/${needId}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "FULFILLED" });
      expect(fulfilledResponse.body.data.need.status).toBe("FULFILLED");
    } finally {
      if (needId) {
        await prisma.notification.deleteMany({
          where: {
            type: "HOSPITAL_DONATION_NEED",
            userId: { in: partnerNgoUsers.map(({ userId }) => userId) },
            message: { contains: `${unitsNeeded} units` },
          },
        });
        await prisma.auditLog.deleteMany({ where: { entityType: "HospitalDonationNeed", entityId: String(needId) } });
        await prisma.hospitalDonationNeed.delete({ where: { needId } });
      }
    }
  });

  it("lists and updates appointments for the hospital", async () => {
    const appointment = await prisma.appointment.create({
      data: {
        hospitalId: staffUser.hospitalStaff.hospitalId,
        donorId: donorUser.donor.donorId,
        date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        time: "10:30",
        purpose: "Blood Test",
        status: "SCHEDULED",
      },
    });
    try {
      const listResponse = await request(app)
        .get("/api/hospital/appointments")
        .set("Authorization", `Bearer ${staffToken}`);
      expect(listResponse.body.data.appointments).toEqual(
        expect.arrayContaining([expect.objectContaining({ appointmentId: appointment.appointmentId })])
      );
      const confirmed = await request(app)
        .patch(`/api/hospital/appointments/${appointment.appointmentId}/status`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "CONFIRMED" });
      expect(confirmed.status).toBe(200);
      const completed = await request(app)
        .patch(`/api/hospital/appointments/${appointment.appointmentId}/status`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "COMPLETED" });
      expect(completed.body.data.appointment.status).toBe("COMPLETED");
      const invalid = await request(app)
        .patch(`/api/hospital/appointments/${appointment.appointmentId}/status`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "CANCELLED" });
      expect(invalid.status).toBe(409);
    } finally {
      await prisma.appointment.delete({ where: { appointmentId: appointment.appointmentId } });
    }
  });

  it("manages capacity-limited slots using the hospital's permanent map pin", async () => {
    const hospitalId = staffUser.hospitalStaff.hospitalId;
    const hospital = await prisma.hospital.findUnique({
      where: { hospitalId },
      select: { latitude: true, longitude: true },
    });
    expect(Number.isFinite(hospital.latitude)).toBe(true);
    expect(Number.isFinite(hospital.longitude)).toBe(true);
    const date = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let slotId;
    let appointmentId;

    try {
      const createResponse = await request(app)
        .post("/api/hospital/appointments/slots")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ date, time: "11:20", capacity: 1 });
      expect(createResponse.status).toBe(201);
      slotId = createResponse.body.data.slot.slotId;

      const duplicateResponse = await request(app)
        .post("/api/hospital/appointments/slots")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ date, time: "11:20", capacity: 1 });
      expect(duplicateResponse.status).toBe(409);

      const listResponse = await request(app)
        .get("/api/hospital/appointments/slots")
        .set("Authorization", `Bearer ${staffToken}`);
      expect(listResponse.body.data.slots).toEqual(
        expect.arrayContaining([expect.objectContaining({ slotId, capacity: 1, bookedCount: 0 })])
      );

      const closeResponse = await request(app)
        .patch(`/api/hospital/appointments/slots/${slotId}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "CLOSED" });
      expect(closeResponse.body.data.slot.status).toBe("CLOSED");

      const reopenResponse = await request(app)
        .patch(`/api/hospital/appointments/slots/${slotId}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "OPEN" });
      expect(reopenResponse.body.data.slot.status).toBe("OPEN");

      const donorToken = jwt.sign(
        { userId: donorUser.userId, role: donorUser.role },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN }
      );
      const availabilityResponse = await request(app)
        .get("/api/donor/appointments/slots")
        .query({ hospitalId })
        .set("Authorization", `Bearer ${donorToken}`);
      expect(availabilityResponse.body.data.slots).toEqual(
        expect.arrayContaining([expect.objectContaining({ slotId, availableCount: 1 })])
      );

      await prisma.appointmentSlot.update({ where: { slotId }, data: { bookedCount: 1 } });
      const fullAvailability = await request(app)
        .get("/api/donor/appointments/slots")
        .query({ hospitalId })
        .set("Authorization", `Bearer ${donorToken}`);
      expect(fullAvailability.body.data.slots).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ slotId })])
      );

      const appointment = await prisma.appointment.create({
        data: {
          hospitalId,
          donorId: donorUser.donor.donorId,
          slotId,
          date: new Date(`${date}T00:00:00.000Z`),
          time: "11:20",
          purpose: "Blood donation",
          status: "SCHEDULED",
        },
      });
      appointmentId = appointment.appointmentId;
      const cancelResponse = await request(app)
        .patch(`/api/hospital/appointments/${appointmentId}/status`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "CANCELLED" });
      expect(cancelResponse.status).toBe(200);
      expect((await prisma.appointmentSlot.findUnique({ where: { slotId } })).bookedCount).toBe(0);
      const releasedAvailability = await request(app)
        .get("/api/donor/appointments/slots")
        .query({ hospitalId })
        .set("Authorization", `Bearer ${donorToken}`);
      expect(releasedAvailability.body.data.slots).toEqual(
        expect.arrayContaining([expect.objectContaining({ slotId, availableCount: 1 })])
      );
    } finally {
      if (appointmentId) await prisma.appointment.delete({ where: { appointmentId } });
      if (slotId) await prisma.appointmentSlot.delete({ where: { slotId } });
    }
  });

  it("records successful blood donations after staff clearance", async () => {
    const appointment = await prisma.appointment.create({
      data: {
        hospitalId: staffUser.hospitalStaff.hospitalId,
        donorId: donorUser.donor.donorId,
        date: new Date(Date.now() - 24 * 60 * 60 * 1000),
        time: "09:30",
        purpose: "Blood Donation",
        status: "CONFIRMED",
      },
    });
    const originalDonor = await prisma.donor.findUnique({
      where: { donorId: donorUser.donor.donorId },
      select: { lastDonationDate: true },
    });
    let donationId;

    try {
      const prematureCompletion = await request(app)
        .patch(`/api/hospital/appointments/${appointment.appointmentId}/status`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "COMPLETED" });
      expect(prematureCompletion.status).toBe(409);

      const response = await request(app)
        .post(`/api/hospital/appointments/${appointment.appointmentId}/donation`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ quantity: 450, notes: "Screened and cleared by hospital staff." });
      expect(response.status).toBe(201);
      donationId = response.body.data.donation.donationId;
      expect(response.body.data.donation).toEqual(expect.objectContaining({
        status: "AVAILABLE",
        quantity: 450,
        staffId: staffUser.hospitalStaff.staffId,
        hospitalId: staffUser.hospitalStaff.hospitalId,
        appointmentId: appointment.appointmentId,
      }));

      const updatedAppointment = await prisma.appointment.findUnique({
        where: { appointmentId: appointment.appointmentId },
        select: { status: true },
      });
      expect(updatedAppointment.status).toBe("COMPLETED");
      const updatedDonor = await prisma.donor.findUnique({
        where: { donorId: donorUser.donor.donorId },
        select: { lastDonationDate: true },
      });
      expect(updatedDonor.lastDonationDate).toEqual(expect.any(Date));

      const duplicateResponse = await request(app)
        .post(`/api/hospital/appointments/${appointment.appointmentId}/donation`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ quantity: 450 });
      expect(duplicateResponse.status).toBe(409);
    } finally {
      if (donationId) await prisma.donationRecord.delete({ where: { donationId } });
      await prisma.donor.update({
        where: { donorId: donorUser.donor.donorId },
        data: { lastDonationDate: originalDonor.lastDonationDate },
      });
      await prisma.appointment.delete({ where: { appointmentId: appointment.appointmentId } });
    }
  });

  it("lists only hospital staff and rejects patient access to hospital operations", async () => {
    const staffResponse = await request(app)
      .get("/api/hospital/staff")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(staffResponse.status).toBe(200);
    expect(staffResponse.body.data.staff.every((staff) =>
      staff.user.userId !== undefined && !Object.hasOwn(staff.user, "password")
    )).toBe(true);

    const patient = await prisma.user.findUnique({ where: { email: "patient1@hemoconnect.co.ke" } });
    const patientToken = jwt.sign(
      { userId: patient.userId, role: patient.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
    const denied = await request(app)
      .get("/api/hospital/inventory")
      .set("Authorization", `Bearer ${patientToken}`);
    expect(denied.status).toBe(403);
  });
});
