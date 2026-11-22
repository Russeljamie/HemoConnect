const prisma = require("../services/prisma");
const { processEmergencyRequest } = require("../services/donorMatching");
const { recordRequestEvent } = require("../services/requestEvents");
const { latestDate } = require("../utils/donationEligibility");

const getHospitalStaff = async (userId) => prisma.hospitalStaff.findUnique({
  where: { userId },
  select: { staffId: true, hospitalId: true },
});

const createHospitalRequest = async (req, res, next) => {
  try {
    const staff = await getHospitalStaff(req.user.userId);
    if (!staff) {
      return res.status(404).json({ success: false, message: "Hospital staff profile not found." });
    }

    const hospital = await prisma.hospital.findUnique({
      where: { hospitalId: staff.hospitalId },
      select: { hospitalId: true, latitude: true, longitude: true },
    });
    const latitude = req.body.latitude ?? hospital.latitude;
    const longitude = req.body.longitude ?? hospital.longitude;
    if (latitude === null || longitude === null || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: "Add a request location or configure your hospital coordinates before creating a request for donor matching.",
      });
    }
    let emergencyRequest;
    try {
      emergencyRequest = await prisma.$transaction(async (tx) => {
        const created = await tx.emergencyRequest.create({
          data: {
            bloodType: req.body.bloodType,
            quantityRequired: req.body.quantityRequired,
            urgencyLevel: req.body.urgencyLevel,
            status: "OPEN",
            latitude,
            longitude,
            neededBy: req.body.neededBy,
            notes: req.body.notes || null,
            patientReference: req.body.patientReference?.trim() || null,
            hospitalId: staff.hospitalId,
            requestedByUserId: req.user.userId,
            createdByStaffId: staff.staffId,
          },
        });

        await recordRequestEvent(tx, {
          request: created,
          actorUserId: req.user.userId,
          action: "OFFICIAL_REQUEST_CREATED",
          toStatus: "OPEN",
          details: { hospitalId: staff.hospitalId },
          title: "Official blood request created",
          message: "Your hospital has verified and created an official blood request.",
        });
        return created;
      });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      throw error;
    }

    let matching = { alertedDonors: 0 };
    if (emergencyRequest.latitude !== null && emergencyRequest.longitude !== null) {
      try {
        matching = { alertedDonors: await processEmergencyRequest(emergencyRequest.requestId) };
      } catch (error) {
        console.error(`Initial donor alert dispatch failed for official request ${emergencyRequest.requestId}:`, error);
        matching = { alertedDonors: 0, pending: true };
      }
    }

    const requestWithMatchingState = await prisma.emergencyRequest.findUnique({
      where: { requestId: emergencyRequest.requestId },
    });
    return res.status(201).json({
      success: true,
      message: matching.pending
        ? "Official request created; donor alerts will be retried."
        : "Official blood request created.",
      data: { request: requestWithMatchingState, matching },
    });
  } catch (error) {
    next(error);
  }
};

const getHospitalStaffProfile = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      include: {
        hospitalStaff: {
          include: {
            hospital: true,
            donationRecords: {
              orderBy: { donationDate: "desc" },
              take: 6,
            },
            medicalCheckups: {
              orderBy: { checkupDate: "desc" },
              take: 4,
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Hospital staff profile not found.",
      });
    }

    if (!user.hospitalStaff) {
      return res.status(404).json({
        success: false,
        message: "This user does not have a hospital staff profile.",
      });
    }

    const hospitalId = user.hospitalStaff.hospitalId;
    const hospital = user.hospitalStaff.hospital;

    const [inventory, pendingRequests, upcomingAppointments] = await Promise.all([
      prisma.bloodInventory.findMany({
        where: { hospitalId },
        orderBy: { bloodType: "asc" },
      }),
      prisma.emergencyRequest.findMany({
        where: { hospitalId },
        orderBy: { neededBy: "asc" },
        take: 5,
      }),
      prisma.appointment.findMany({
        where: {
          hospitalId,
          date: {
            gte: new Date(),
          },
        },
        orderBy: { date: "asc" },
        take: 5,
      }),
    ]);

    const summaryFromRecords = user.hospitalStaff.donationRecords.reduce((acc, record) => {
      const current = acc[record.bloodType] || { bloodType: record.bloodType, units: 0 };
      current.units += record.status === "AVAILABLE" ? record.quantity : 0;
      acc[record.bloodType] = current;
      return acc;
    }, {});

    const inventorySummary = (inventory.length ? inventory : Object.values(summaryFromRecords)).map((item) => ({
      bloodType: item.bloodType,
      units: item.unitsAvailable ?? item.units ?? 0,
      minimumUnits: item.minimumUnits ?? 5,
      status: (item.unitsAvailable ?? item.units ?? 0) <= (item.minimumUnits ?? 5) ? "Low" : "Stable",
    }));

    const totalUnitsAvailable = inventorySummary.reduce((sum, item) => sum + item.units, 0);
    const lowStockCount = inventorySummary.filter((item) => item.units <= item.minimumUnits).length;

    const urgentRequests = pendingRequests.map((request) => ({
      title: `${request.bloodType} Request`,
      meta: request.urgencyLevel === "CRITICAL" ? "Critical case" : "Priority request",
      sub: `${request.quantityRequired} units needed • ${request.status}`,
      status: request.status,
      neededBy: new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(request.neededBy)),
    }));

    const upcomingAppointmentsList = upcomingAppointments.map((appointment) => ({
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

    return res.status(200).json({
      success: true,
      message: "Hospital staff profile retrieved successfully",
      data: {
        user: {
          userId: user.userId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          designation: user.hospitalStaff.designation,
          hospitalName: hospital?.name || null,
          hospitalLocation: hospital?.location || null,
        },
        metrics: {
          unitsAvailable: totalUnitsAvailable,
          lowStock: lowStockCount,
          scheduledDonations: upcomingAppointmentsList.length,
          pendingRequests: pendingRequests.filter((request) =>
            ["PENDING", "OPEN", "URGENT"].includes(request.status)
          ).length,
        },
        inventorySummary,
        urgentRequests,
        upcomingAppointments: upcomingAppointmentsList,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getHospitalInventory = async (req, res, next) => {
  try {
    const staff = await getHospitalStaff(req.user.userId);
    if (!staff) {
      return res.status(404).json({ success: false, message: "Hospital staff profile not found." });
    }

    const inventory = await prisma.bloodInventory.findMany({
      where: { hospitalId: staff.hospitalId },
      orderBy: { bloodType: "asc" },
    });

    return res.status(200).json({ success: true, data: { inventory } });
  } catch (error) {
    next(error);
  }
};

const updateHospitalInventoryMinimum = async (req, res, next) => {
  try {
    const staff = await getHospitalStaff(req.user.userId);
    if (!staff) return res.status(404).json({ success: false, message: "Hospital staff profile not found." });
    const inventoryId = Number(req.params.inventoryId);
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.bloodInventory.findFirst({
        where: { inventoryId, hospitalId: staff.hospitalId },
      });
      if (!current) return null;

      const changed = await tx.bloodInventory.updateMany({
        where: { inventoryId, hospitalId: staff.hospitalId, minimumUnits: current.minimumUnits },
        data: { minimumUnits: req.body.minimumUnits },
      });
      if (!changed.count) {
        throw Object.assign(new Error("Inventory minimum changed concurrently."), {
          workflowError: "INVENTORY_MINIMUM_CHANGED",
        });
      }

      const updated = await tx.bloodInventory.findFirst({
        where: { inventoryId, hospitalId: staff.hospitalId },
      });
      await tx.auditLog.create({
        data: {
          action: "HOSPITAL_INVENTORY_MINIMUM_UPDATED",
          entityType: "BloodInventory",
          entityId: String(inventoryId),
          actorUserId: req.user.userId,
          details: {
            hospitalId: staff.hospitalId,
            bloodType: current.bloodType,
            previousMinimumUnits: current.minimumUnits,
            newMinimumUnits: updated.minimumUnits,
          },
        },
      });
      return updated;
    });

    if (!result) {
      return res.status(404).json({ success: false, message: "Inventory record not found." });
    }
    return res.status(200).json({
      success: true,
      message: "Minimum stock level updated.",
      data: { inventory: result },
    });
  } catch (error) {
    if (error.workflowError === "INVENTORY_MINIMUM_CHANGED") {
      return res.status(409).json({ success: false, message: "Inventory minimum changed. Refresh and retry." });
    }
    next(error);
  }
};

const getHospitalInventoryTransactions = async (req, res, next) => {
  try {
    const staff = await getHospitalStaff(req.user.userId);
    if (!staff) return res.status(404).json({ success: false, message: "Hospital staff profile not found." });

    const from = req.query.from
      ? new Date(`${String(req.query.from).slice(0, 10)}T00:00:00.000Z`)
      : new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const to = req.query.to
      ? new Date(`${String(req.query.to).slice(0, 10)}T23:59:59.999Z`)
      : new Date();
    const inventory = await prisma.bloodInventory.findMany({
      where: {
        hospitalId: staff.hospitalId,
        ...(req.query.bloodType ? { bloodType: req.query.bloodType } : {}),
      },
      select: { inventoryId: true },
    });
    const transactions = inventory.length ? await prisma.inventoryTransaction.findMany({
      where: {
        inventoryId: { in: inventory.map(({ inventoryId }) => inventoryId) },
        createdAt: { gte: from, lte: to },
      },
      select: {
        transactionId: true,
        transactionType: true,
        unitsChanged: true,
        reason: true,
        createdAt: true,
        inventory: { select: { bloodType: true } },
      },
      orderBy: [{ createdAt: "desc" }, { transactionId: "desc" }],
    }) : [];

    const summary = transactions.reduce((totals, transaction) => {
      if (transaction.transactionType === "STOCK_ADDITION" && transaction.unitsChanged > 0) {
        totals.unitsAdded += transaction.unitsChanged;
      } else if (transaction.transactionType === "REQUEST_FULFILLMENT" && transaction.unitsChanged < 0) {
        totals.unitsFulfilled += Math.abs(transaction.unitsChanged);
      } else if (transaction.transactionType === "STOCK_REMOVAL" && transaction.unitsChanged < 0) {
        totals.unitsManuallyRemoved += Math.abs(transaction.unitsChanged);
      }
      return totals;
    }, { unitsAdded: 0, unitsFulfilled: 0, unitsManuallyRemoved: 0 });
    summary.totalUnitsOut = summary.unitsFulfilled + summary.unitsManuallyRemoved;

    return res.status(200).json({
      success: true,
      data: {
        from,
        to,
        summary,
        transactions: transactions.map(({ inventory: item, ...transaction }) => ({
          ...transaction,
          bloodType: item.bloodType,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

const adjustHospitalInventory = async (req, res, next) => {
  try {
    const staff = await getHospitalStaff(req.user.userId);
    if (!staff) {
      return res.status(404).json({ success: false, message: "Hospital staff profile not found." });
    }

    const { bloodType, unitsChange, reason } = req.body;
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.bloodInventory.findUnique({
        where: { hospitalId_bloodType: { hospitalId: staff.hospitalId, bloodType } },
      });

      let inventory;
      if (!existing) {
        if (unitsChange < 0) return { insufficientStock: true };
        inventory = await tx.bloodInventory.create({
          data: { hospitalId: staff.hospitalId, bloodType, unitsAvailable: unitsChange },
        });
      } else {
        const update = await tx.bloodInventory.updateMany({
          where: {
            inventoryId: existing.inventoryId,
            unitsAvailable: { gte: Math.max(0, -unitsChange) },
          },
          data: { unitsAvailable: { increment: unitsChange } },
        });
        if (!update.count) return { insufficientStock: true };
        inventory = await tx.bloodInventory.findUnique({
          where: { inventoryId: existing.inventoryId },
        });
      }

      await tx.inventoryTransaction.create({
        data: {
          transactionType: unitsChange > 0 ? "STOCK_ADDITION" : "STOCK_REMOVAL",
          unitsChanged: unitsChange,
          reason: reason || null,
          inventoryId: inventory.inventoryId,
          performedByUserId: req.user.userId,
        },
      });
      return { inventory };
    });

    if (result.insufficientStock) {
      return res.status(409).json({
        success: false,
        message: "The adjustment would reduce available stock below zero.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Inventory updated.",
      data: { inventory: result.inventory },
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ success: false, message: "Inventory changed concurrently. Refresh and retry." });
    }
    next(error);
  }
};

const listHospitalRequests = async (req, res, next) => {
  try {
    const staff = await getHospitalStaff(req.user.userId);
    if (!staff) {
      return res.status(404).json({ success: false, message: "Hospital staff profile not found." });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const requests = await prisma.emergencyRequest.findMany({
      where: {
        OR: [
          { hospitalId: staff.hospitalId },
          {
            hospitalId: null,
            status: { in: ["OPEN", "PENDING", "URGENT"] },
            neededBy: { gte: today },
          },
        ],
      },
      include: {
        hospital: { select: { hospitalId: true, name: true } },
        matches: { select: { status: true } },
        inventoryTransactions: {
          select: { transactionId: true, transactionType: true, unitsChanged: true, createdAt: true },
        },
      },
      orderBy: [{ neededBy: "asc" }, { requestDate: "desc" }],
    });
    const requestIds = requests.map(({ requestId }) => String(requestId));
    const auditHistory = requestIds.length ? await prisma.auditLog.findMany({
      where: { entityType: "EmergencyRequest", entityId: { in: requestIds } },
      orderBy: { createdAt: "asc" },
      select: { auditLogId: true, entityId: true, action: true, details: true, createdAt: true },
    }) : [];

    return res.status(200).json({
      success: true,
      data: {
        requests: requests.map((request) => ({
          ...request,
          history: auditHistory.filter((event) => event.entityId === String(request.requestId)),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateHospitalRequest = async (req, res, next) => {
  try {
    const staff = await getHospitalStaff(req.user.userId);
    if (!staff) {
      return res.status(404).json({ success: false, message: "Hospital staff profile not found." });
    }

    const requestId = Number(req.params.requestId);
    const nextStatus = req.body.status;
    const isClaiming = nextStatus === "IN_PROGRESS";
    const outcome = await prisma.$transaction(async (tx) => {
      const current = await tx.emergencyRequest.findFirst({
        where: {
          requestId,
          ...(isClaiming
            ? {
              status: { in: ["OPEN", "PENDING", "URGENT"] },
              OR: [{ hospitalId: null }, { hospitalId: staff.hospitalId }],
            }
            : { status: "IN_PROGRESS", hospitalId: staff.hospitalId }),
        },
      });
      if (!current) return null;

      const data = isClaiming
        ? { status: "IN_PROGRESS", hospitalId: staff.hospitalId }
        : {
          status: "OPEN",
          ...(current.createdByStaffId ? {} : { hospitalId: null }),
        };
      const result = await tx.emergencyRequest.updateMany({
        where: { requestId, status: current.status, hospitalId: current.hospitalId },
        data,
      });
      if (!result.count) return null;

      const updatedRequest = { ...current, ...data };
      await recordRequestEvent(tx, {
        request: updatedRequest,
        actorUserId: req.user.userId,
        action: isClaiming ? "REQUEST_CLAIMED" : "REQUEST_RELEASED",
        fromStatus: current.status,
        toStatus: updatedRequest.status,
        details: { hospitalId: staff.hospitalId },
        title: "Blood request status updated",
        message: isClaiming
          ? "A hospital blood bank team is coordinating your request."
          : current.createdByStaffId
            ? "Your request has been returned to your hospital's open list."
            : "Your request has been returned to the open hospital queue.",
      });
      return updatedRequest;
    });

    if (!outcome) {
      const exists = await prisma.emergencyRequest.findUnique({ where: { requestId }, select: { requestId: true } });
      return res.status(exists ? 409 : 404).json({
        success: false,
        message: exists ? "This request is no longer available for that action." : "Request not found.",
      });
    }

    const emergencyRequest = await prisma.emergencyRequest.findUnique({
      where: { requestId },
      include: { hospital: { select: { hospitalId: true, name: true } } },
    });
    return res.status(200).json({
      success: true,
      message: isClaiming
        ? "Request assigned to your hospital."
        : outcome.createdByStaffId
          ? "Request returned to your hospital's open list."
          : "Request released to the open queue.",
      data: { request: emergencyRequest },
    });
  } catch (error) {
    next(error);
  }
};

const fulfillHospitalRequest = async (req, res, next) => {
  try {
    const staff = await getHospitalStaff(req.user.userId);
    if (!staff) return res.status(404).json({ success: false, message: "Hospital staff profile not found." });

    const requestId = Number(req.params.requestId);
    const fulfilled = await prisma.$transaction(async (tx) => {
      const emergencyRequest = await tx.emergencyRequest.findFirst({
        where: {
          requestId,
          hospitalId: staff.hospitalId,
          status: { in: ["OPEN", "IN_PROGRESS", "PARTIALLY_FULFILLED"] },
        },
      });
      if (!emergencyRequest) return { error: "NOT_FOUND" };

      const cumulativeQuantity = (emergencyRequest.fulfilledQuantity || 0) + req.body.quantity;
      if (cumulativeQuantity > emergencyRequest.quantityRequired) return { error: "OVER_FULFILLMENT" };

      const inventory = await tx.bloodInventory.findUnique({
        where: {
          hospitalId_bloodType: {
            hospitalId: staff.hospitalId,
            bloodType: emergencyRequest.bloodType,
          },
        },
      });
      if (!inventory || inventory.unitsAvailable < req.body.quantity) return { error: "INSUFFICIENT_STOCK" };

      const stockUpdate = await tx.bloodInventory.updateMany({
        where: { inventoryId: inventory.inventoryId, unitsAvailable: { gte: req.body.quantity } },
        data: { unitsAvailable: { decrement: req.body.quantity } },
      });
      if (!stockUpdate.count) return { error: "INSUFFICIENT_STOCK" };

      const nextStatus = cumulativeQuantity >= emergencyRequest.quantityRequired
        ? "FULFILLED"
        : "PARTIALLY_FULFILLED";
      const requestUpdate = await tx.emergencyRequest.updateMany({
        where: {
          requestId,
          hospitalId: staff.hospitalId,
          status: emergencyRequest.status,
          fulfilledQuantity: emergencyRequest.fulfilledQuantity,
        },
        data: {
          fulfilledQuantity: cumulativeQuantity,
          fulfilledAt: nextStatus === "FULFILLED" ? new Date() : null,
          status: nextStatus,
          outcomeNotes: req.body.outcomeNotes || emergencyRequest.outcomeNotes,
        },
      });
      if (!requestUpdate.count) {
        throw Object.assign(new Error("Request fulfillment changed concurrently."), { workflowError: "REQUEST_CHANGED" });
      }

      await tx.inventoryTransaction.create({
        data: {
          transactionType: "REQUEST_FULFILLMENT",
          unitsChanged: -req.body.quantity,
          reason: `Fulfillment for emergency request ${requestId}`,
          inventoryId: inventory.inventoryId,
          performedByUserId: req.user.userId,
          requestId,
        },
      });

      const updatedRequest = await tx.emergencyRequest.findUnique({ where: { requestId } });
      await recordRequestEvent(tx, {
        request: updatedRequest,
        actorUserId: req.user.userId,
        action: "REQUEST_FULFILLMENT_RECORDED",
        fromStatus: emergencyRequest.status,
        toStatus: nextStatus,
        details: { quantityThisTransaction: req.body.quantity, fulfilledQuantity: cumulativeQuantity },
        title: nextStatus === "FULFILLED" ? "Request fulfilled" : "Request partially fulfilled",
        message: nextStatus === "FULFILLED"
          ? "The hospital recorded fulfillment of your blood request."
          : "The hospital recorded a partial fulfillment of your blood request.",
      });
      return { request: updatedRequest };
    });

    if (fulfilled.error) {
      const messages = {
        NOT_FOUND: [404, "Request not found in your hospital or it is not fulfillable."],
        OVER_FULFILLMENT: [409, "Fulfillment quantity exceeds the remaining request."],
        INSUFFICIENT_STOCK: [409, "Your hospital does not have enough available inventory to fulfill this quantity."],
      };
      const [statusCode, message] = messages[fulfilled.error];
      return res.status(statusCode).json({ success: false, message });
    }
    return res.status(200).json({
      success: true,
      message: `Recorded fulfillment. Request status: ${fulfilled.request.status}.`,
      data: { request: fulfilled.request },
    });
  } catch (error) {
    if (error.workflowError === "REQUEST_CHANGED") {
      return res.status(409).json({ success: false, message: "Request fulfillment changed concurrently. Refresh and retry." });
    }
    next(error);
  }
};

const getAppointmentDetails = {
  include: {
    donor: {
      select: {
        firstName: true,
        lastName: true,
        bloodType: true,
        user: { select: { email: true, phone: true } },
      },
    },
  },
};

const listHospitalAppointments = async (req, res, next) => {
  try {
    const staff = await getHospitalStaff(req.user.userId);
    if (!staff) {
      return res.status(404).json({ success: false, message: "Hospital staff profile not found." });
    }

    const appointments = await prisma.appointment.findMany({
      where: { hospitalId: staff.hospitalId },
      ...getAppointmentDetails,
      orderBy: [{ date: "asc" }, { time: "asc" }],
    });

    return res.status(200).json({ success: true, data: { appointments } });
  } catch (error) {
    next(error);
  }
};

const listHospitalAppointmentSlots = async (req, res, next) => {
  try {
    const staff = await getHospitalStaff(req.user.userId);
    if (!staff) {
      return res.status(404).json({ success: false, message: "Hospital staff profile not found." });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const slots = await prisma.appointmentSlot.findMany({
      where: { hospitalId: staff.hospitalId, slotDate: { gte: today } },
      orderBy: [{ slotDate: "asc" }, { time: "asc" }],
    });
    return res.status(200).json({ success: true, data: { slots } });
  } catch (error) {
    next(error);
  }
};

const createHospitalAppointmentSlot = async (req, res, next) => {
  try {
    const staff = await getHospitalStaff(req.user.userId);
    if (!staff) {
      return res.status(404).json({ success: false, message: "Hospital staff profile not found." });
    }
    const hospital = await prisma.hospital.findUnique({
      where: { hospitalId: staff.hospitalId },
      select: { latitude: true, longitude: true },
    });
    if (!hospital || hospital.latitude === null || hospital.longitude === null) {
      return res.status(409).json({
        success: false,
        message: "This hospital has no saved map location. Contact a system administrator to add its permanent pin before publishing availability.",
      });
    }

    const slotDate = new Date(`${req.body.date}T00:00:00.000Z`);
    const slot = await prisma.appointmentSlot.create({
      data: {
        hospitalId: staff.hospitalId,
        createdByStaffId: staff.staffId,
        slotDate,
        time: req.body.time,
        capacity: req.body.capacity,
      },
    });
    return res.status(201).json({ success: true, message: "Appointment slot published.", data: { slot } });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ success: false, message: "A slot already exists for that date and time." });
    }
    next(error);
  }
};

const updateHospitalAppointmentSlot = async (req, res, next) => {
  try {
    const staff = await getHospitalStaff(req.user.userId);
    if (!staff) {
      return res.status(404).json({ success: false, message: "Hospital staff profile not found." });
    }
    const result = await prisma.appointmentSlot.updateMany({
      where: { slotId: Number(req.params.slotId), hospitalId: staff.hospitalId },
      data: { status: req.body.status },
    });
    if (!result.count) {
      return res.status(404).json({ success: false, message: "Appointment slot not found." });
    }
    const slot = await prisma.appointmentSlot.findUnique({ where: { slotId: Number(req.params.slotId) } });
    return res.status(200).json({ success: true, message: "Appointment slot updated.", data: { slot } });
  } catch (error) {
    next(error);
  }
};

const updateHospitalAppointment = async (req, res, next) => {
  try {
    const staff = await getHospitalStaff(req.user.userId);
    if (!staff) {
      return res.status(404).json({ success: false, message: "Hospital staff profile not found." });
    }

    const appointmentId = Number(req.params.appointmentId);
    const appointment = await prisma.appointment.findFirst({
      where: { appointmentId, hospitalId: staff.hospitalId },
      select: { appointmentId: true, status: true, purpose: true },
    });
    if (!appointment) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }

    const allowedTransitions = {
      SCHEDULED: ["CONFIRMED", "CANCELLED"],
      CONFIRMED: ["COMPLETED", "CANCELLED"],
    };
    const nextStatus = req.body.status;
    if (
      nextStatus === "COMPLETED" &&
      appointment.purpose.toLowerCase() === "blood donation"
    ) {
      return res.status(409).json({
        success: false,
        message: "Record the successful donation after hospital clearance to complete this donation appointment.",
      });
    }
    if (!allowedTransitions[appointment.status]?.includes(nextStatus)) {
      return res.status(409).json({
        success: false,
        message: `Cannot change an appointment from ${appointment.status} to ${nextStatus}.`,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.appointment.findFirst({
        where: { appointmentId, hospitalId: staff.hospitalId, status: appointment.status },
        select: { appointmentId: true, slotId: true },
      });
      if (!current) return 0;
      const updated = await tx.appointment.updateMany({
        where: { appointmentId, hospitalId: staff.hospitalId, status: appointment.status },
        data: { status: nextStatus },
      });
      if (updated.count && nextStatus === "CANCELLED" && current.slotId) {
        await tx.appointmentSlot.updateMany({
          where: { slotId: current.slotId, bookedCount: { gt: 0 } },
          data: { bookedCount: { decrement: 1 } },
        });
      }
      return updated.count;
    });
    if (!result) {
      return res.status(409).json({ success: false, message: "Appointment status changed. Refresh and retry." });
    }

    const updatedAppointment = await prisma.appointment.findUnique({
      where: { appointmentId },
      ...getAppointmentDetails,
    });
    return res.status(200).json({
      success: true,
      message: "Appointment status updated.",
      data: { appointment: updatedAppointment },
    });
  } catch (error) {
    next(error);
  }
};

const recordHospitalAppointmentDonation = async (req, res, next) => {
  try {
    const staff = await getHospitalStaff(req.user.userId);
    if (!staff) {
      return res.status(404).json({ success: false, message: "Hospital staff profile not found." });
    }

    const appointmentId = Number(req.params.appointmentId);
    const outcome = await prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findFirst({
        where: {
          appointmentId,
          hospitalId: staff.hospitalId,
          status: "CONFIRMED",
          purpose: { equals: "Blood Donation", mode: "insensitive" },
          date: { lte: new Date() },
          donorId: { not: null },
        },
        select: {
          appointmentId: true,
          donorId: true,
          donor: { select: { bloodType: true, lastDonationDate: true } },
        },
      });
      if (!appointment) return { error: "APPOINTMENT_NOT_ELIGIBLE" };
      if (!appointment.donor?.bloodType) return { error: "MISSING_BLOOD_TYPE" };

      const completed = await tx.appointment.updateMany({
        where: { appointmentId, hospitalId: staff.hospitalId, status: "CONFIRMED" },
        data: { status: "COMPLETED" },
      });
      if (!completed.count) {
        throw Object.assign(new Error("Appointment status changed while recording donation."), {
          workflowError: "APPOINTMENT_CHANGED",
        });
      }

      const donation = await tx.donationRecord.create({
        data: {
          donationDate: new Date(),
          bloodType: appointment.donor.bloodType,
          quantity: req.body.quantity,
          status: "AVAILABLE",
          notes: req.body.notes || null,
          donorId: appointment.donorId,
          appointmentId,
          staffId: staff.staffId,
          hospitalId: staff.hospitalId,
        },
      });
      await tx.donor.update({
        where: { donorId: appointment.donorId },
        data: {
          lastDonationDate: latestDate(
            appointment.donor.lastDonationDate,
            donation.donationDate
          ),
        },
      });
      return { donation };
    });

    if (outcome.error === "APPOINTMENT_NOT_ELIGIBLE") {
      return res.status(409).json({
        success: false,
        message: "Only a confirmed, due blood donation appointment at your hospital can be recorded.",
      });
    }
    if (outcome.error === "MISSING_BLOOD_TYPE") {
      return res.status(409).json({
        success: false,
        message: "The donor profile needs a blood type before a successful donation can be recorded.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Successful donation recorded after hospital clearance.",
      data: { donation: outcome.donation },
    });
  } catch (error) {
    if (error.workflowError === "APPOINTMENT_CHANGED" || error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "A donation has already been recorded for this appointment or its status changed.",
      });
    }
    next(error);
  }
};

const listHospitalStaff = async (req, res, next) => {
  try {
    const staffMember = await getHospitalStaff(req.user.userId);
    if (!staffMember) {
      return res.status(404).json({ success: false, message: "Hospital staff profile not found." });
    }

    const staff = await prisma.hospitalStaff.findMany({
      where: { hospitalId: staffMember.hospitalId },
      select: {
        staffId: true,
        designation: true,
        createdAt: true,
        user: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
          },
        },
      },
      orderBy: [{ user: { firstName: "asc" } }, { user: { lastName: "asc" } }],
    });

    return res.status(200).json({ success: true, data: { staff } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getHospitalStaffProfile,
  getHospitalInventory,
  getHospitalInventoryTransactions,
  updateHospitalInventoryMinimum,
  adjustHospitalInventory,
  createHospitalRequest,
  listHospitalRequests,
  updateHospitalRequest,
  fulfillHospitalRequest,
  listHospitalAppointments,
  listHospitalAppointmentSlots,
  createHospitalAppointmentSlot,
  updateHospitalAppointmentSlot,
  recordHospitalAppointmentDonation,
  updateHospitalAppointment,
  listHospitalStaff,
};
