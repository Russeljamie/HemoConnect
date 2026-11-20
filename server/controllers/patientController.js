const prisma = require("../services/prisma");

const getPatientProfile = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      include: {
        patient: {
          include: {
            emergencyRequests: {
              orderBy: { requestDate: "desc" },
              take: 5,
            },
            appointments: {
              where: { date: { gte: new Date() } },
              orderBy: { date: "asc" },
              take: 3,
            },
            hospital: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Patient profile not found.",
      });
    }

    if (!user.patient) {
      return res.status(404).json({
        success: false,
        message: "This user does not have a patient profile.",
      });
    }

    const upcomingAppointments = user.patient.appointments
      .filter((appointment) => new Date(appointment.date) >= new Date())
      .map((appointment) => ({
        appointmentId: appointment.appointmentId,
        date: new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(new Date(appointment.date)),
        time: appointment.time,
        purpose: appointment.purpose,
        status: appointment.status,
      }));

    const requestHistory = user.patient.emergencyRequests.map((request) => ({
      title: `${request.bloodType} Request`,
      meta: request.urgencyLevel === "CRITICAL" ? "Critical case" : "Emergency request",
      sub: `${request.quantityRequired} units needed • ${request.status}`,
      status: request.status,
    }));

    const unreadNotifications = await prisma.notification.count({
      where: { userId: req.user.userId, readAt: null },
    });
    const metrics = {
      openRequests: user.patient.emergencyRequests.filter((request) =>
        ["OPEN", "URGENT", "PENDING"].includes(request.status)
      ).length,
      urgentNeeds: user.patient.emergencyRequests.filter((request) =>
        ["HIGH", "CRITICAL"].includes(request.urgencyLevel)
      ).length,
      upcomingVisits: upcomingAppointments.length,
      notifications: unreadNotifications,
    };

    return res.status(200).json({
      success: true,
      message: "Patient profile retrieved successfully",
      data: {
        user: {
          userId: user.userId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          bloodType: user.patient.bloodType,
          address: user.patient.address,
          hospitalName: user.patient.hospital?.name || null,
          gender: user.patient.gender,
        },
        metrics,
        requestHistory,
        upcomingAppointments,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getPatientIdsForUser = async (userId) => {
  const [patient, accessGrants] = await Promise.all([
    prisma.patient.findUnique({ where: { userId }, select: { patientId: true } }),
    prisma.patientAccess.findMany({
      where: { userId, status: "ACTIVE" },
      select: { patientId: true },
    }),
  ]);
  return [...new Set([patient?.patientId, ...accessGrants.map(({ patientId }) => patientId)].filter(Boolean))];
};

const listPatientAppointments = async (req, res, next) => {
  try {
    const patientIds = await getPatientIdsForUser(req.user.userId);
    const appointments = patientIds.length
      ? await prisma.appointment.findMany({
        where: { patientId: { in: patientIds } },
        include: { hospital: { select: { name: true, location: true } } },
        orderBy: [{ date: "asc" }, { time: "asc" }],
      })
      : [];

    return res.status(200).json({
      success: true,
      data: {
        appointments: appointments.map((appointment) => ({
          appointmentId: appointment.appointmentId,
          date: appointment.date,
          time: appointment.time,
          purpose: appointment.purpose,
          status: appointment.status,
          notes: appointment.notes,
          hospital: appointment.hospital,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

const listPatientMedicalNotes = async (req, res, next) => {
  try {
    const patientIds = await getPatientIdsForUser(req.user.userId);
    if (!patientIds.length) {
      return res.status(200).json({ success: true, data: { notes: [] } });
    }

    const [appointments, requests] = await Promise.all([
      prisma.appointment.findMany({
        where: { patientId: { in: patientIds }, notes: { not: null } },
        select: {
          appointmentId: true,
          date: true,
          purpose: true,
          notes: true,
          hospital: { select: { name: true } },
        },
        orderBy: [{ date: "desc" }, { appointmentId: "desc" }],
      }),
      prisma.emergencyRequest.findMany({
        where: {
          patientId: { in: patientIds },
          outcomeNotes: { not: null },
        },
        select: {
          requestId: true,
          requestDate: true,
          bloodType: true,
          outcomeNotes: true,
          hospital: { select: { name: true } },
        },
        orderBy: [{ requestDate: "desc" }, { requestId: "desc" }],
      }),
    ]);

    const notes = [
      ...appointments
        .filter((appointment) => appointment.notes?.trim())
        .map((appointment) => ({
          id: `appointment-${appointment.appointmentId}`,
          date: appointment.date,
          title: appointment.purpose,
          author: appointment.hospital?.name || "Care team",
          text: appointment.notes,
        })),
      ...requests.flatMap((request) => [
        request.outcomeNotes?.trim() && {
          id: `request-outcome-${request.requestId}`,
          date: request.requestDate,
          title: `${request.bloodType} request outcome`,
          author: request.hospital?.name || "Care team",
          text: request.outcomeNotes,
        },
      ].filter(Boolean)),
    ].sort((left, right) => new Date(right.date) - new Date(left.date));

    return res.status(200).json({ success: true, data: { notes } });
  } catch (error) {
    next(error);
  }
};

const listPatientRequests = async (req, res, next) => {
  try {
    const [patient, accessGrants] = await Promise.all([
      prisma.patient.findUnique({
        where: { userId: req.user.userId },
        select: { patientId: true },
      }),
      prisma.patientAccess.findMany({
        where: { userId: req.user.userId, status: "ACTIVE" },
        select: { patientId: true },
      }),
    ]);
    const patientIds = [...new Set([
      patient?.patientId,
      ...accessGrants.map(({ patientId }) => patientId),
    ].filter(Boolean))];
    const requests = patientIds.length
      ? await prisma.emergencyRequest.findMany({
        where: { patientId: { in: patientIds } },
        include: {
          hospital: { select: { hospitalId: true, name: true, location: true } },
          matches: { select: { status: true } },
        },
        orderBy: { requestDate: "desc" },
      })
      : [];
    const requestIds = requests.map(({ requestId }) => String(requestId));
    const [hospitals, patients, enquiries, notifications, auditHistory] = await Promise.all([
      prisma.hospital.findMany({
        where: { isActive: true },
        select: { hospitalId: true, name: true, location: true },
        orderBy: { name: "asc" },
      }),
      patientIds.length ? prisma.patient.findMany({
        where: { patientId: { in: patientIds } },
        select: { patientId: true, firstName: true, lastName: true, bloodType: true, hospital: { select: { name: true } } },
        orderBy: { firstName: "asc" },
      }) : [],
      prisma.assistanceEnquiry.findMany({
        where: {
          OR: [
            { submittingUserId: req.user.userId },
            ...(patientIds.length ? [{ patientId: { in: patientIds } }] : []),
          ],
        },
        include: {
          preferredHospital: { select: { name: true } },
          resultingRequest: { select: { requestId: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.notification.findMany({
        where: { userId: req.user.userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      requestIds.length ? prisma.auditLog.findMany({
        where: { entityType: "EmergencyRequest", entityId: { in: requestIds } },
        orderBy: { createdAt: "asc" },
        select: { auditLogId: true, entityId: true, action: true, details: true, createdAt: true },
      }) : [],
    ]);

    return res.status(200).json({
      success: true,
      data: {
        requests: requests.map(({ matches, ...request }) => ({
          ...request,
          history: auditHistory.filter((event) => event.entityId === String(request.requestId)),
          matching: {
            currentWave: request.currentWave,
            alertedDonors: matches.length,
            responses: matches.filter((match) => ["ACCEPTED", "DECLINED"].includes(match.status)).length,
            accepted: matches.filter((match) => match.status === "ACCEPTED").length,
          },
        })),
        hospitals,
        patients,
        enquiries,
        notifications,
      },
    });
  } catch (error) {
    next(error);
  }
};

const markPatientNotificationRead = async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { notificationId: Number(req.params.notificationId), userId: req.user.userId },
      data: { status: "READ", readAt: new Date() },
    });
    if (!result.count) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }
    return res.status(200).json({ success: true, message: "Notification marked as read." });
  } catch (error) {
    next(error);
  }
};

const listPublicHospitals = async (req, res, next) => {
  try {
    const hospitals = await prisma.hospital.findMany({
      where: { isActive: true },
      select: { hospitalId: true, name: true, location: true },
      orderBy: { name: "asc" },
    });
    return res.status(200).json({ success: true, data: { hospitals } });
  } catch (error) {
    next(error);
  }
};

const createAssistanceEnquiry = async (req, res, next) => {
  try {
    if (req.user && req.user.role !== "PATIENT") {
      return res.status(403).json({ success: false, message: "Only patients or family representatives can submit an assistance enquiry." });
    }

    const preferredHospitalId = req.body.preferredHospitalId || null;
    if (preferredHospitalId) {
      const hospital = await prisma.hospital.findFirst({
        where: { hospitalId: preferredHospitalId, isActive: true },
        select: { hospitalId: true },
      });
      if (!hospital) {
        return res.status(400).json({ success: false, message: "Select an active hospital." });
      }
    }

    const savedEnquiry = await prisma.$transaction(async (tx) => {
      let patient;
      if (req.user) {
        const requestedPatientId = req.body.patientId ? Number(req.body.patientId) : null;
        if (requestedPatientId) {
          patient = await tx.patient.findFirst({
            where: {
              patientId: requestedPatientId,
              OR: [
                { userId: req.user.userId },
                { accessGrants: { some: { userId: req.user.userId, status: "ACTIVE" } } },
              ],
            },
            select: { patientId: true },
          });
          if (!patient) {
            throw Object.assign(new Error("Patient record not found or you are not authorized to use it."), { status: 403 });
          }
        } else {
          patient = await tx.patient.findUnique({
            where: { userId: req.user.userId },
            select: { patientId: true },
          });
          if (!patient) {
            const user = await tx.user.findUnique({
              where: { userId: req.user.userId },
              select: { firstName: true, lastName: true, phone: true },
            });
            patient = await tx.patient.create({
              data: {
                firstName: user.firstName,
                lastName: user.lastName,
                phone: user.phone,
                bloodType: req.body.bloodType,
                hospitalId: preferredHospitalId,
                userId: req.user.userId,
              },
              select: { patientId: true },
            });
          }
        }
      } else {
        patient = await tx.patient.create({
          data: {
            firstName: req.body.firstName.trim(),
            lastName: req.body.lastName.trim(),
            phone: req.body.phone.trim(),
            bloodType: req.body.bloodType,
            hospitalId: preferredHospitalId,
          },
          select: { patientId: true },
        });
      }

      const enquiry = await tx.assistanceEnquiry.create({
        data: {
          description: req.body.description.trim(),
          submitterName: req.user ? undefined : req.body.submitterName.trim(),
          submitterEmail: req.user ? undefined : (req.body.submitterEmail || null),
          submitterPhone: req.user ? undefined : req.body.phone.trim(),
          requestedBloodType: req.body.bloodType,
          quantityRequired: req.body.quantityRequired,
          urgencyLevel: req.body.urgencyLevel,
          neededBy: req.body.neededBy,
          latitude: req.body.latitude ?? null,
          longitude: req.body.longitude ?? null,
          submittingUserId: req.user?.userId,
          patientId: patient.patientId,
          preferredHospitalId,
        },
      });

      if (preferredHospitalId) {
        const staff = await tx.hospitalStaff.findMany({
          where: { hospitalId: preferredHospitalId },
          select: { userId: true },
        });
        if (staff.length) {
          await tx.notification.createMany({
            data: staff.map(({ userId }) => ({
              type: "ASSISTANCE_ENQUIRY",
              channel: "IN_APP",
              title: "New assistance enquiry",
              message: "A patient assistance enquiry is awaiting hospital verification.",
              status: "SENT",
              sentAt: new Date(),
              userId,
            })),
          });
        }
      }

      if (req.user) {
        await tx.auditLog.create({
          data: {
            action: "ASSISTANCE_ENQUIRY_SUBMITTED",
            entityType: "AssistanceEnquiry",
            entityId: String(enquiry.enquiryId),
            actorUserId: req.user.userId,
            details: { status: enquiry.status, patientId: patient.patientId },
          },
        });
      }
      return enquiry;
    });

    return res.status(201).json({
      success: true,
      message: "Assistance enquiry submitted for hospital verification.",
      data: { enquiry: savedEnquiry },
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  }
};

module.exports = {
  getPatientProfile,
  listPatientAppointments,
  listPatientMedicalNotes,
  listPatientRequests,
  listPublicHospitals,
  createAssistanceEnquiry,
  markPatientNotificationRead,
};
