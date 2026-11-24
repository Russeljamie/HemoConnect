const prisma = require("../services/prisma");
const { isValidDonorDateOfBirth, parseDateOfBirth } = require("../utils/dateOfBirth");
const {
  getDonationEligibility,
  isEligibleForDonationOn,
  startOfUtcDay,
  startOfNairobiDay,
} = require("../utils/donationEligibility");
const { getLatestQualifyingDonation } = require("../services/qualifyingDonation");
const {
  getDatabaseNow,
  lockActiveApprovalForBooking,
  cancelAppointmentWithApproval,
} = require("../services/approvalBookingService");
const { notifyAppointment } = require("../services/notificationDelivery");

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENDERS = ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"];
const OPEN_REQUEST_STATUSES = ["PENDING", "OPEN", "URGENT"];
const NEARBY_HOSPITAL_LIMIT = 3;
const EARTH_RADIUS_KM = 6371;

const distanceBetweenCoordinatesKm = (latitudeA, longitudeA, latitudeB, longitudeB) => {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
};

const getDonorId = async (userId) => {
  const donor = await prisma.donor.findUnique({
    where: { userId },
    select: { donorId: true },
  });

  return donor?.donorId;
};

const isValidPagination = (page, pageSize) =>
  Number.isInteger(page) && page >= 1 &&
  Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100;

const getDonorProfile = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      include: {
        donor: {
          include: {
            donationRecords: {
              orderBy: { donationDate: "desc" },
              take: 4,
                include: {
                  hospital: { select: { name: true } },
                  hospitalStaff: { include: { hospital: { select: { name: true } } } },
                },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Donor profile not found.",
      });
    }

    if (!user.donor) {
      return res.status(404).json({
        success: false,
        message: "This user does not have a donor profile.",
      });
    }

    const today = startOfNairobiDay(new Date());

    const [totalDonations, appointmentRecords, latestSuccessfulDonation] = await Promise.all([
      prisma.donationRecord.count({ where: { donorId: user.donor.donorId } }),
      prisma.appointment.findMany({
        where: {
          donorId: user.donor.donorId,
          date: { gte: today },
          status: { in: ["SCHEDULED", "CONFIRMED"] },
        },
        orderBy: [{ date: "asc" }, { time: "asc" }],
        take: 3,
        select: {
          appointmentId: true,
          date: true,
          time: true,
          purpose: true,
          status: true,
        },
      }),
      getLatestQualifyingDonation(prisma, user.donor.donorId),
    ]);
    const lastSuccessfulDonationDate = latestSuccessfulDonation?.donationDate || null;
    const donationEligibility = getDonationEligibility({ lastSuccessfulDonationDate });

    const upcomingAppointments = appointmentRecords.map((appointment) => ({
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

    const donationHistory = user.donor.donationRecords.map((record) => ({
      donationId: record.donationId,
      date: new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(record.donationDate)),
      bloodType: record.bloodType,
      quantity: `${record.quantity} ml`,
      status: record.status === "AVAILABLE" ? "Completed" : record.status,
      hospital:
        record.hospital?.name || record.hospitalStaff?.hospital?.name || "Not recorded",
    }));

    const nextAppointment = upcomingAppointments[0]
      ? `${upcomingAppointments[0].date} • ${upcomingAppointments[0].time}`
      : "Not Scheduled";

    return res.status(200).json({
      success: true,
      message: "Donor profile retrieved successfully",
      data: {
        user: {
          userId: user.userId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          bloodType: user.donor.bloodType,
          birthDate: user.donor.birthDate,
          gender: user.donor.gender,
          address: user.donor.address,
          latitude: user.donor.latitude,
          longitude: user.donor.longitude,
          eligibility: user.donor.isEligible,
          lastDonationDate: lastSuccessfulDonationDate,
          lastSuccessfulDonationDate: donationEligibility.lastSuccessfulDonationDate,
          nextEligibleDonationDate: donationEligibility.nextEligibleDonationDate,
          canScheduleDonation: donationEligibility.canScheduleDonation,
        },
        metrics: {
          totalDonations,
          nextAppointment,
        },
        donationHistory,
        upcomingAppointments,
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "The appointment or approval booking state changed concurrently. Please retry.",
        code: "BOOKING_CONFLICT",
      });
    }
    next(error);
  }
};

const updateDonorProfile = async (req, res, next) => {
  try {
    const firstName = typeof req.body.firstName === "string" ? req.body.firstName.trim() : "";
    const lastName = typeof req.body.lastName === "string" ? req.body.lastName.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    const bloodType = typeof req.body.bloodType === "string" ? req.body.bloodType : "";
    const birthDate = parseDateOfBirth(req.body.birthDate);
    const gender = typeof req.body.gender === "string" ? req.body.gender.trim().toUpperCase() : "";
    const address = typeof req.body.address === "string" ? req.body.address.trim() : "";
    const latitude = req.body.latitude === undefined
      ? undefined
      : req.body.latitude === null || req.body.latitude === "" ? null : Number(req.body.latitude);
    const longitude = req.body.longitude === undefined
      ? undefined
      : req.body.longitude === null || req.body.longitude === "" ? null : Number(req.body.longitude);

    if (
      firstName.length < 2 || firstName.length > 50 ||
      lastName.length < 2 || lastName.length > 50 ||
      !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 ||
      phone.length < 10 || phone.length > 20 ||
      !BLOOD_TYPES.includes(bloodType) ||
      !birthDate || !isValidDonorDateOfBirth(birthDate) ||
      !GENDERS.includes(gender) ||
      !address || address.length > 255 ||
      (latitude !== undefined && latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== undefined && longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) ||
      ((latitude === undefined) !== (longitude === undefined)) ||
      ((latitude === null) !== (longitude === null))
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid donor profile details.",
      });
    }

    const donor = await prisma.donor.findUnique({
      where: { userId: req.user.userId },
      select: { donorId: true },
    });

    if (!donor) {
      return res.status(404).json({ success: false, message: "Donor profile not found." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { userId: req.user.userId },
        data: { firstName, lastName, email, phone },
        select: { userId: true, firstName: true, lastName: true, email: true, phone: true },
      });
      const profile = await tx.donor.update({
        where: { donorId: donor.donorId },
        data: { firstName, lastName, bloodType, birthDate, gender, address, latitude, longitude },
        select: { bloodType: true, birthDate: true, gender: true, address: true, latitude: true, longitude: true },
      });

      return { ...user, ...profile };
    });

    return res.status(200).json({
      success: true,
      message: "Donor profile updated successfully.",
      data: { user: result },
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ success: false, message: "That email is already in use." });
    }
    next(error);
  }
};

const listDonorDonations = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 20);

    if (!isValidPagination(page, pageSize)) {
      return res.status(400).json({ success: false, message: "Invalid donation history page." });
    }

    const donorId = await getDonorId(req.user.userId);
    if (!donorId) {
      return res.status(404).json({ success: false, message: "Donor profile not found." });
    }

    const where = { donorId };
    const [total, donations] = await Promise.all([
      prisma.donationRecord.count({ where }),
      prisma.donationRecord.findMany({
        where,
        include: {
          hospital: { select: { name: true } },
          hospitalStaff: { include: { hospital: { select: { name: true } } } },
        },
        orderBy: [{ donationDate: "desc" }, { donationId: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        donations: donations.map((donation) => ({
          donationId: donation.donationId,
          donationDate: donation.donationDate,
          bloodType: donation.bloodType,
          quantity: donation.quantity,
          status: donation.status,
          notes: donation.notes,
          hospital: donation.hospital?.name || donation.hospitalStaff?.hospital?.name || null,
        })),
        pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      },
    });
  } catch (error) {
    next(error);
  }
};

const getDonorDonation = async (req, res, next) => {
  try {
    const donationId = Number(req.params.donationId);
    if (!Number.isSafeInteger(donationId) || donationId < 1) {
      return res.status(400).json({ success: false, message: "Invalid donation ID." });
    }

    const donorId = await getDonorId(req.user.userId);
    if (!donorId) {
      return res.status(404).json({ success: false, message: "Donor profile not found." });
    }

    const donation = await prisma.donationRecord.findFirst({
      where: { donationId, donorId },
      include: {
        hospital: { select: { name: true, location: true } },
        hospitalStaff: { include: { hospital: { select: { name: true, location: true } } } },
      },
    });

    if (!donation) {
      return res.status(404).json({ success: false, message: "Donation record not found." });
    }

    const hospital = donation.hospital || donation.hospitalStaff?.hospital;
    return res.status(200).json({
      success: true,
      data: {
        donation: {
          donationId: donation.donationId,
          donationDate: donation.donationDate,
          bloodType: donation.bloodType,
          quantity: donation.quantity,
          status: donation.status,
          notes: donation.notes,
          hospital: hospital?.name || null,
          hospitalLocation: hospital?.location || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const listDonorAppointments = async (req, res, next) => {
  try {
    const donorId = await getDonorId(req.user.userId);
    if (!donorId) {
      return res.status(404).json({ success: false, message: "Donor profile not found." });
    }

    const [appointments, hospitals, donorLocation] = await Promise.all([
      prisma.appointment.findMany({
        where: { donorId },
        include: { hospital: { select: { name: true, location: true } } },
        orderBy: [{ date: "desc" }, { time: "desc" }],
      }),
      prisma.hospital.findMany({
        where: {
          isActive: true,
          institutionType: "HOSPITAL",
          latitude: { not: null },
          longitude: { not: null },
        },
        select: { hospitalId: true, name: true, location: true },
        orderBy: { name: "asc" },
      }),
      prisma.donor.findUnique({
        where: { donorId },
        select: { latitude: true, longitude: true },
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        appointments: appointments.map((appointment) => ({
          appointmentId: appointment.appointmentId,
          date: appointment.date,
          time: appointment.time,
          purpose: appointment.purpose,
          status: appointment.status,
          hospital: appointment.hospital,
        })),
        hospitals,
        donorLocation,
      },
    });
  } catch (error) {
    next(error);
  }
};

const listNearbyDonorHospitals = async (req, res, next) => {
  try {
    if (typeof req.query.latitude !== "string" || typeof req.query.longitude !== "string") {
      return res.status(400).json({
        success: false,
        message: "A valid user latitude and longitude are required.",
      });
    }

    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);
    if (
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid user latitude and longitude are required.",
      });
    }

    const hospitals = await prisma.hospital.findMany({
      where: {
        isActive: true,
        institutionType: "HOSPITAL",
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        hospitalId: true,
        name: true,
        location: true,
        latitude: true,
        longitude: true,
      },
    });

    const nearbyHospitals = hospitals
      .map((hospital) => ({
        ...hospital,
        distanceKm: distanceBetweenCoordinatesKm(
          latitude,
          longitude,
          hospital.latitude,
          hospital.longitude
        ),
      }))
      .sort((hospitalA, hospitalB) =>
        hospitalA.distanceKm - hospitalB.distanceKm ||
        hospitalA.hospitalId - hospitalB.hospitalId
      )
      .slice(0, NEARBY_HOSPITAL_LIMIT);

    return res.status(200).json({
      success: true,
      data: { hospitals: nearbyHospitals },
    });
  } catch (error) {
    next(error);
  }
};

const listDonorAppointmentSlots = async (req, res, next) => {
  try {
    const hospitalId = Number(req.query.hospitalId);
    if (!Number.isSafeInteger(hospitalId) || hospitalId < 1) {
      return res.status(400).json({ success: false, message: "Choose a valid hospital." });
    }
    const today = startOfNairobiDay(new Date());
    const slots = await prisma.appointmentSlot.findMany({
      where: {
        hospitalId,
        status: "OPEN",
        slotDate: { gte: today },
        hospital: {
          isActive: true,
          institutionType: "HOSPITAL",
          latitude: { not: null },
          longitude: { not: null },
        },
      },
      select: {
        slotId: true,
        slotDate: true,
        time: true,
        capacity: true,
        bookedCount: true,
      },
      orderBy: [{ slotDate: "asc" }, { time: "asc" }],
    });
    return res.status(200).json({
      success: true,
      data: {
        slots: slots
          .filter((slot) => slot.bookedCount < slot.capacity)
          .map((slot) => ({ ...slot, availableCount: slot.capacity - slot.bookedCount })),
      },
    });
  } catch (error) {
    next(error);
  }
};

const createDonorAppointment = async (req, res, next) => {
  try {
    const donorId = await getDonorId(req.user.userId);
    if (!donorId) {
      return res.status(404).json({ success: false, message: "Donor profile not found." });
    }

    const purpose = typeof req.body.purpose === "string" ? req.body.purpose.trim() : "";
    const hospitalId = Number(req.body.hospitalId);
    const slotId = Number(req.body.slotId);
    const locationLatitude = Number(req.body.locationLatitude);
    const locationLongitude = Number(req.body.locationLongitude);

    if (
      purpose.length < 3 || purpose.length > 80 ||
      !Number.isSafeInteger(hospitalId) || hospitalId < 1 ||
      !Number.isSafeInteger(slotId) || slotId < 1 ||
      !Number.isFinite(locationLatitude) || locationLatitude < -90 || locationLatitude > 90 ||
      !Number.isFinite(locationLongitude) || locationLongitude < -180 || locationLongitude > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide a valid future appointment and location.",
      });
    }

    const [donor, hospitals] = await Promise.all([
      prisma.donor.findUnique({
        where: { donorId },
        select: {
          isEligible: true,
          birthDate: true,
          firstName: true,
          lastName: true,
          user: { select: { userId: true, email: true, phone: true } },
        },
      }),
      prisma.hospital.findMany({
        where: {
          isActive: true,
          institutionType: "HOSPITAL",
          latitude: { not: null },
          longitude: { not: null },
        },
        select: {
          hospitalId: true,
          name: true,
          location: true,
          latitude: true,
          longitude: true,
        },
      }),
    ]);

    if (!donor) {
      return res.status(404).json({ success: false, message: "Donor profile not found." });
    }
    if (!donor.isEligible) {
      return res.status(409).json({ success: false, message: "Your donor profile is not currently eligible to book." });
    }
    const nearestHospitalIds = hospitals
      .map((hospital) => ({
        hospitalId: hospital.hospitalId,
        distanceKm: distanceBetweenCoordinatesKm(
          locationLatitude,
          locationLongitude,
          hospital.latitude,
          hospital.longitude
        ),
      }))
      .sort((hospitalA, hospitalB) =>
        hospitalA.distanceKm - hospitalB.distanceKm ||
        hospitalA.hospitalId - hospitalB.hospitalId
      )
      .slice(0, NEARBY_HOSPITAL_LIMIT)
      .map((hospital) => hospital.hospitalId);
    const hospital = hospitals.find((candidate) => candidate.hospitalId === hospitalId);

    if (!hospital || !nearestHospitalIds.includes(hospitalId)) {
      return res.status(400).json({
        success: false,
        message: "Choose one of the three closest active hospitals for your selected location.",
      });
    }

    const bookingOutcome = await prisma.$transaction(async (tx) => {
      const donorRows = await tx.$queryRaw`
        SELECT "donorId", "birthDate", NOW() AS "databaseNow"
        FROM "Donor"
        WHERE "donorId" = ${donorId}
        FOR UPDATE
      `;
      const lockedDonor = donorRows[0];
      if (!lockedDonor) return { error: "DONOR_NOT_FOUND" };

      const bookingNow = lockedDonor.databaseNow instanceof Date
        ? lockedDonor.databaseNow
        : new Date(lockedDonor.databaseNow);
      if (!Number.isFinite(bookingNow.getTime())) return { error: "DATABASE_CLOCK_UNAVAILABLE" };

      if (!lockedDonor.birthDate || !isValidDonorDateOfBirth(lockedDonor.birthDate, bookingNow)) {
        return { error: "AGE_INELIGIBLE" };
      }

      let selectedApproval = null;
      if (purpose.toLowerCase() === "blood donation") {
        const approvalOutcome = await lockActiveApprovalForBooking(tx, donorId, bookingNow);
        if (approvalOutcome.error) return approvalOutcome;
        selectedApproval = approvalOutcome.approval;
      }

      const currentNairobiDay = startOfNairobiDay(bookingNow);
      await tx.$queryRaw`
        SELECT "slotId"
        FROM "AppointmentSlot"
        WHERE "slotId" = ${slotId}
          AND "hospitalId" = ${hospitalId}
        FOR UPDATE
      `;
      const slot = await tx.appointmentSlot.findFirst({
        where: {
          slotId,
          hospitalId,
          status: "OPEN",
          slotDate: { gte: currentNairobiDay },
          hospital: {
            isActive: true,
            institutionType: "HOSPITAL",
            latitude: { not: null },
            longitude: { not: null },
          },
        },
        select: { slotDate: true },
      });
      if (!slot) return { error: "SLOT_UNAVAILABLE" };

      if (purpose.toLowerCase() === "blood donation") {
        const latestSuccessfulDonation = await getLatestQualifyingDonation(tx, donorId);
        const lastSuccessfulDonationDate = latestSuccessfulDonation?.donationDate || null;
        if (!isEligibleForDonationOn(lastSuccessfulDonationDate, slot.slotDate, undefined)) {
          const { nextEligibleDonationDate } = getDonationEligibility({
            lastSuccessfulDonationDate,
            today: bookingNow,
          });
          return { error: "DONATION_COOLDOWN", nextEligibleDonationDate };
        }
      }

      const currentDay = currentNairobiDay;
      currentDay.setUTCHours(0, 0, 0, 0);
      const reserved = await tx.$executeRaw`
        UPDATE "AppointmentSlot"
        SET "bookedCount" = "bookedCount" + 1, "updatedAt" = NOW()
        WHERE "slotId" = ${slotId}
          AND "hospitalId" = ${hospitalId}
          AND "status" = 'OPEN'
          AND "slotDate" >= ${currentDay}
          AND "bookedCount" < "capacity"
      `;
      if (!reserved) return { error: "SLOT_UNAVAILABLE" };
      const fullSlot = await tx.appointmentSlot.findUnique({ where: { slotId } });
      if (!fullSlot) return { error: "SLOT_UNAVAILABLE" };
      const appointment = await tx.appointment.create({
        data: {
          date: fullSlot.slotDate,
          time: fullSlot.time,
          purpose,
          status: "SCHEDULED",
          donorId,
          hospitalId,
          slotId,
        },
        include: {
          hospital: { select: { name: true, location: true } },
          slot: true,
          donor: {
            select: {
              firstName: true,
              lastName: true,
              user: { select: { userId: true, email: true, phone: true } },
            },
          },
        },
      });
      if (selectedApproval) {
        await tx.questionnaireBookingAssociation.create({
          data: {
            approvalId: selectedApproval.approvalId,
            appointmentId: appointment.appointmentId,
            authorizedAt: bookingNow,
            status: "ACTIVE",
          },
        });
      }
      await tx.auditLog.create({
        data: {
          action: "DONOR_APPOINTMENT_BOOKED",
          entityType: "Appointment",
          entityId: String(appointment.appointmentId),
          actorUserId: req.user.userId,
          details: {
            donorId,
            hospitalId,
            slotId,
            purpose,
            ...(selectedApproval ? { approvalId: selectedApproval.approvalId } : {}),
          },
        },
      });
      await notifyAppointment(tx, appointment, "BOOKED");
      return { appointment };
    });
    if (bookingOutcome.error === "DONOR_NOT_FOUND") {
      return res.status(404).json({ success: false, message: "Donor profile not found." });
    }
    if (bookingOutcome.error === "DATABASE_CLOCK_UNAVAILABLE") {
      return res.status(503).json({ success: false, message: "Booking time could not be verified. Please retry." });
    }
    if (bookingOutcome.error === "AGE_INELIGIBLE") {
      return res.status(409).json({ success: false, message: "You must be older than 18 years to book a blood donation." });
    }
    if (bookingOutcome.error === "NO_VALID_APPROVAL") {
      return res.status(409).json({
        success: false,
        message: "A valid active KNBTS questionnaire approval is required to book a blood donation.",
        code: "VALID_APPROVAL_REQUIRED",
      });
    }
    if (bookingOutcome.error === "ACTIVE_APPROVAL_BOOKING_EXISTS") {
      return res.status(409).json({
        success: false,
        message: "This approval already has an unresolved active appointment.",
        code: "ACTIVE_APPROVAL_BOOKING_EXISTS",
      });
    }
    if (bookingOutcome.error === "DONATION_COOLDOWN") {
      return res.status(409).json({
        success: false,
        message: `You can schedule another blood donation from ${bookingOutcome.nextEligibleDonationDate.toISOString().slice(0, 10)}. Hospital staff will make the final medical clearance decision.`,
        data: { nextEligibleDonationDate: bookingOutcome.nextEligibleDonationDate },
      });
    }
    if (bookingOutcome.error === "SLOT_UNAVAILABLE") {
      return res.status(409).json({
        success: false,
        message: "That appointment slot is no longer available. Choose another slot.",
      });
    }
    const appointment = bookingOutcome.appointment;

    return res.status(201).json({
      success: true,
      message: "Appointment booked successfully.",
      data: { appointment },
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "The appointment or approval booking state changed concurrently. Please retry.",
        code: "BOOKING_CONFLICT",
      });
    }
    next(error);
  }
};

const cancelDonorAppointment = async (req, res, next) => {
  try {
    const appointmentId = Number(req.params.appointmentId);
    if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) {
      return res.status(400).json({ success: false, message: "Invalid appointment ID." });
    }

    const donorId = await getDonorId(req.user.userId);
    if (!donorId) {
      return res.status(404).json({ success: false, message: "Donor profile not found." });
    }

    const outcome = await prisma.$transaction(async (tx) =>
      cancelAppointmentWithApproval(tx, {
        appointmentId,
        donorId,
        actorUserId: req.user.userId,
      })
    );

    if (!outcome.cancelled) {
      const ownedAppointment = await prisma.appointment.findFirst({
        where: { appointmentId, donorId },
        select: { appointmentId: true },
      });
      const statusCode = outcome.error === "NOT_FOUND" || !ownedAppointment ? 404 : 409;
      return res.status(statusCode).json({
        success: false,
        message: ownedAppointment
          ? "This appointment can no longer be cancelled."
          : "Appointment not found.",
        code: outcome.error,
      });
    }

    return res.status(200).json({ success: true, message: "Appointment cancelled." });
  } catch (error) {
    next(error);
  }
};

const listDonorEmergencyAlerts = async (req, res, next) => {
  try {
    const donor = await prisma.donor.findUnique({
      where: { userId: req.user.userId },
      select: { donorId: true },
    });
    if (!donor) {
      return res.status(404).json({ success: false, message: "Donor profile not found." });
    }

    const matches = await prisma.requestMatch.findMany({
      where: {
        donorId: donor.donorId,
        status: { in: ["NOTIFIED", "ACCEPTED", "DECLINED"] },
      },
      include: {
        request: {
          select: {
            requestId: true,
            bloodType: true,
            quantityRequired: true,
            urgencyLevel: true,
            status: true,
            neededBy: true,
            currentWave: true,
            hospital: { select: { name: true, location: true } },
          },
        },
      },
      orderBy: [{ notifiedAt: "desc" }, { matchId: "desc" }],
    });

    return res.status(200).json({
      success: true,
      data: {
        alerts: matches.map((match) => ({
          ...match.request,
          matchStatus: match.status,
          wave: match.wave,
          distanceKm: match.distanceKm,
          notifiedAt: match.notifiedAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

const respondToDonorAlert = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const responseStatus = req.body.response === "ACCEPT" ? "ACCEPTED"
      : req.body.response === "DECLINE" ? "DECLINED"
        : null;

    if (!Number.isSafeInteger(requestId) || requestId < 1 || !responseStatus) {
      return res.status(400).json({ success: false, message: "Choose whether to accept or decline this alert." });
    }

    const donor = await prisma.donor.findUnique({
      where: { userId: req.user.userId },
      select: { donorId: true },
    });
    if (!donor) {
      return res.status(404).json({ success: false, message: "Donor profile not found." });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const result = await prisma.$transaction(async (tx) => {
      const updatedMatch = await tx.requestMatch.updateMany({
        where: {
          requestId,
          donorId: donor.donorId,
          status: "NOTIFIED",
          request: {
            is: {
              status: { in: OPEN_REQUEST_STATUSES },
              neededBy: { gte: today },
            },
          },
        },
        data: { status: responseStatus, responseAt: new Date() },
      });

      if (updatedMatch.count && responseStatus === "ACCEPTED") {
        const emergencyRequest = await tx.emergencyRequest.findUnique({
          where: { requestId },
          select: {
            bloodType: true,
            requestedByUserId: true,
            hospital: { select: { staff: { select: { userId: true } } } },
          },
        });
        const recipientUserIds = new Set([
          emergencyRequest?.requestedByUserId,
          ...(emergencyRequest?.hospital?.staff || []).map(({ userId }) => userId),
        ].filter(Boolean));

        if (recipientUserIds.size) {
          await tx.notification.createMany({
            data: [...recipientUserIds].map((userId) => ({
              type: "DONOR_RESPONSE",
              channel: "IN_APP",
              title: "A donor accepted a blood request",
              message: `A donor accepted the ${emergencyRequest.bloodType} blood request.`,
              status: "SENT",
              sentAt: new Date(),
              userId,
              requestId,
            })),
          });
        }
      }

      return updatedMatch;
    });

    if (!result.count) {
      const match = await prisma.requestMatch.findUnique({
        where: { requestId_donorId: { requestId, donorId: donor.donorId } },
        select: { matchId: true, status: true },
      });
      return res.status(match ? 409 : 404).json({
        success: false,
        message: match
          ? match.status === "NOTIFIED"
            ? "This blood request is no longer active."
            : "You have already responded to this alert."
          : "Alert not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: responseStatus === "ACCEPTED" ? "You accepted this blood request." : "You declined this blood request.",
      data: { requestId, matchStatus: responseStatus },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDonorProfile,
  updateDonorProfile,
  listDonorDonations,
  getDonorDonation,
  listDonorAppointments,
  listNearbyDonorHospitals,
  listDonorAppointmentSlots,
  createDonorAppointment,
  cancelDonorAppointment,
  listDonorEmergencyAlerts,
  respondToDonorAlert,
};
