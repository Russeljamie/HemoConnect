const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");

describe("Patient request tracking and assistance enquiries", () => {
  let patientToken;
  let patientUser;

  beforeAll(async () => {
    patientUser = await prisma.user.findUnique({
      where: { email: "patient1@hemoconnect.co.ke" },
      include: { patient: true },
    });
    patientToken = jwt.sign(
      { userId: patientUser.userId, role: patientUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
  });

  it("returns an authenticated patient's profile and authorized request tracking", async () => {
    const [profile, requests] = await Promise.all([
      request(app).get("/api/patient/profile").set("Authorization", `Bearer ${patientToken}`),
      request(app).get("/api/patient/requests").set("Authorization", `Bearer ${patientToken}`),
    ]);

    expect(profile.status).toBe(200);
    expect(profile.body.data.user.role).toBe("PATIENT");
    expect(requests.status).toBe(200);
    expect(Array.isArray(requests.body.data.requests)).toBe(true);
    expect(requests.body.data.patients).toEqual(
      expect.arrayContaining([expect.objectContaining({ patientId: patientUser.patient.patientId })])
    );
  });

  it("exposes only active hospital choices for public assistance enquiries", async () => {
    const response = await request(app).get("/api/patient/hospitals");
    expect(response.status).toBe(200);
    expect(response.body.data.hospitals.length).toBeGreaterThan(0);
    expect(response.body.data.hospitals.every((hospital) =>
      Number.isInteger(hospital.hospitalId) && hospital.name && hospital.location
    )).toBe(true);
    expect(response.body.data.hospitals[0]).not.toHaveProperty("latitude");
  });

  it("returns only authorized patient appointments and their recorded notes", async () => {
    const appointment = await prisma.appointment.create({
      data: {
        date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        time: "10:30",
        purpose: "Patient follow-up",
        notes: "Follow-up note for the patient.",
        patientId: patientUser.patient.patientId,
      },
    });
    const unrelatedPatient = await prisma.patient.create({
      data: { firstName: "Unrelated", lastName: "Patient", phone: "07911111111" },
    });
    const unrelatedAppointment = await prisma.appointment.create({
      data: {
        date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        time: "11:30",
        purpose: "Private follow-up",
        notes: "This note must not be visible.",
        patientId: unrelatedPatient.patientId,
      },
    });

    try {
      const [appointments, medicalNotes] = await Promise.all([
        request(app).get("/api/patient/appointments").set("Authorization", `Bearer ${patientToken}`),
        request(app).get("/api/patient/medical-notes").set("Authorization", `Bearer ${patientToken}`),
      ]);
      expect(appointments.status).toBe(200);
      expect(appointments.body.data.appointments).toEqual(
        expect.arrayContaining([expect.objectContaining({ appointmentId: appointment.appointmentId })])
      );
      expect(appointments.body.data.appointments).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ appointmentId: unrelatedAppointment.appointmentId })])
      );
      expect(medicalNotes.status).toBe(200);
      expect(medicalNotes.body.data.notes).toEqual(
        expect.arrayContaining([expect.objectContaining({ text: "Follow-up note for the patient." })])
      );
      expect(medicalNotes.body.data.notes).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ text: "This note must not be visible." })])
      );
    } finally {
      await prisma.appointment.deleteMany({
        where: { appointmentId: { in: [appointment.appointmentId, unrelatedAppointment.appointmentId] } },
      });
      await prisma.patient.delete({ where: { patientId: unrelatedPatient.patientId } });
    }
  });

  it("creates a pending enquiry without creating a request or triggering matching", async () => {
    const neededBy = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const requestCount = await prisma.emergencyRequest.count();
    const response = await request(app)
      .post("/api/patient/enquiries")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({
        patientId: patientUser.patient.patientId,
        bloodType: "O+",
        quantityRequired: 2,
        urgencyLevel: "HIGH",
        neededBy,
        description: "Please help us contact the hospital blood bank.",
      });

    expect(response.status).toBe(201);
    const enquiryId = response.body.data.enquiry.enquiryId;
    try {
      expect(response.body.data.enquiry.status).toBe("PENDING_HOSPITAL_VERIFICATION");
      expect(await prisma.emergencyRequest.count()).toBe(requestCount);
      const listed = await request(app)
        .get("/api/patient/requests")
        .set("Authorization", `Bearer ${patientToken}`);
      expect(listed.body.data.enquiries).toEqual(
        expect.arrayContaining([expect.objectContaining({ enquiryId, status: "PENDING_HOSPITAL_VERIFICATION" })])
      );
    } finally {
      await prisma.assistanceEnquiry.delete({ where: { enquiryId } });
    }
  });

  it("allows a public requester without a patient account to submit an enquiry", async () => {
    const response = await request(app)
      .post("/api/patient/enquiries")
      .send({
        firstName: "Public",
        lastName: `Enquiry ${Date.now()}`,
        phone: "07123456789",
        submitterName: "Family representative",
        submitterEmail: "family@example.test",
        bloodType: "A+",
        quantityRequired: 1,
        urgencyLevel: "MEDIUM",
        neededBy: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        description: "We need help reaching an authorized hospital team.",
      });

    expect(response.status).toBe(201);
    const enquiryId = response.body.data.enquiry.enquiryId;
    const patientId = response.body.data.enquiry.patientId;
    try {
      const [enquiry, patient] = await Promise.all([
        prisma.assistanceEnquiry.findUnique({ where: { enquiryId } }),
        prisma.patient.findUnique({ where: { patientId } }),
      ]);
      expect(enquiry.status).toBe("PENDING_HOSPITAL_VERIFICATION");
      expect(enquiry.submittingUserId).toBeNull();
      expect(patient.userId).toBeNull();
    } finally {
      await prisma.assistanceEnquiry.delete({ where: { enquiryId } });
      await prisma.patient.delete({ where: { patientId } });
    }
  });

  it("rejects an enquiry for an unrelated patient's record", async () => {
    const patient = await prisma.patient.create({
      data: { firstName: "Unrelated", lastName: "Record", phone: "07111111111" },
    });
    try {
      const response = await request(app)
        .post("/api/patient/enquiries")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          patientId: patient.patientId,
          bloodType: "A+",
          quantityRequired: 1,
          urgencyLevel: "MEDIUM",
          neededBy: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          description: "Attempt to submit for an unrelated patient.",
        });
      expect(response.status).toBe(403);
      expect(await prisma.assistanceEnquiry.count({ where: { patientId: patient.patientId } })).toBe(0);
    } finally {
      await prisma.patient.delete({ where: { patientId: patient.patientId } });
    }
  });

  it("does not allow patients to create official requests", async () => {
    const response = await request(app)
      .post("/api/patient/requests")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ bloodType: "O+", quantityRequired: 1 });
    expect(response.status).toBe(404);
  });

  it("validates enquiry details and GPS coordinates", async () => {
    const invalidRequest = await request(app)
      .post("/api/patient/enquiries")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({
        patientId: patientUser.patient.patientId,
        bloodType: "INVALID",
        quantityRequired: 0,
        urgencyLevel: "ASAP",
        neededBy: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        description: "Invalid request payload for testing.",
      });
    expect(invalidRequest.status).toBe(400);

    const invalidCoordinates = await request(app)
      .post("/api/patient/enquiries")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({
        patientId: patientUser.patient.patientId,
        bloodType: "A+",
        quantityRequired: 1,
        urgencyLevel: "MEDIUM",
        neededBy: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        latitude: 91,
        longitude: 36.817223,
        description: "Valid text with an invalid coordinate.",
      });
    expect(invalidCoordinates.status).toBe(400);
  });
});
