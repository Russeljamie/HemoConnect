const bcrypt = require("bcryptjs");
const prisma = require("../services/prisma");

const OPEN_REQUEST_STATUSES = ["PENDING", "OPEN", "URGENT"];
const USER_ROLES = ["DONOR", "HOSPITAL_STAFF", "KNBTS_STAFF", "ADMIN"];
const USER_STATUSES = ["ACTIVE", "INACTIVE"];
const HOSPITAL_STATUSES = ["ACTIVE", "INACTIVE"];
const INSTITUTION_TYPES = ["HOSPITAL", "KNBTS_CENTRE"];
const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const getAdminDashboard = async (req, res, next) => {
  try {
    const [activeUsers, activeHospitals, inventory, openIssues, recentRequests] =
      await Promise.all([
        prisma.user.count({ where: { status: "ACTIVE" } }),
        prisma.hospital.count({ where: { isActive: true, institutionType: "HOSPITAL" } }),
        prisma.bloodInventory.findMany({
          where: { hospital: { is: { isActive: true } } },
          select: {
            bloodType: true,
            unitsAvailable: true,
            minimumUnits: true,
            hospital: { select: { name: true } },
          },
          orderBy: { unitsAvailable: "asc" },
        }),
        prisma.emergencyRequest.count({
          where: { status: { in: OPEN_REQUEST_STATUSES } },
        }),
        prisma.emergencyRequest.findMany({
          where: { status: { in: OPEN_REQUEST_STATUSES } },
          select: {
            bloodType: true,
            quantityRequired: true,
            urgencyLevel: true,
            status: true,
            hospital: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
      ]);

    const lowInventory = inventory.filter(
      (item) => item.unitsAvailable <= item.minimumUnits
    );
    const totalUnits = inventory.reduce(
      (sum, item) => sum + item.unitsAvailable,
      0
    );

    const overview = [
      {
        title: "Active user accounts",
        meta: "Platform users",
        sub: `${activeUsers} accounts currently active`,
        status: "Live",
      },
      {
        title: "Active hospitals",
        meta: "Hospital network",
        sub: `${activeHospitals} hospitals currently active`,
        status: "Live",
      },
      {
        title: "Blood inventory",
        meta: "Active hospital stock",
        sub: `${totalUnits} units across ${inventory.length} stock records`,
        status: lowInventory.length ? "Needs review" : "On track",
      },
      {
        title: "Emergency requests",
        meta: "Pending, open, or urgent",
        sub: `${openIssues} requests need follow-up`,
        status: openIssues ? "Needs review" : "Clear",
      },
    ];

    const alerts = [
      ...lowInventory.slice(0, 3).map((item) => ({
        title: `${item.bloodType} stock below minimum`,
        meta: item.hospital.name,
        sub: `${item.unitsAvailable} units available; minimum ${item.minimumUnits}`,
        action: "Review",
      })),
      ...recentRequests.slice(0, 3).map((request) => ({
        title: `${request.urgencyLevel} ${request.bloodType} request`,
        meta: request.hospital?.name || "Hospital not assigned",
        sub: `${request.quantityRequired} units needed; ${request.status.toLowerCase()}`,
        action: "Review",
      })),
    ];

    return res.status(200).json({
      success: true,
      message: "Admin dashboard summary retrieved successfully.",
      data: {
        metrics: {
          activeUsers,
          hospitals: activeHospitals,
          inventoryAlerts: lowInventory.length,
          openIssues,
        },
        overview,
        alerts,
      },
    });
  } catch (error) {
    next(error);
  }
};

const listAdminUsers = async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const role = typeof req.query.role === "string" ? req.query.role : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 20);

    if (
      search.length > 100 ||
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      (role && !USER_ROLES.includes(role)) ||
      (status && !USER_STATUSES.includes(status))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid user directory filters.",
      });
    }

    const where = {};

    if (role) where.role = role;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          userId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          mustChangePassword: true,
          hospitalStaff: {
            select: {
              designation: true,
              hospital: { select: { hospitalId: true, name: true, institutionType: true } },
            },
          },
          knbtsStaff: {
            select: {
              designation: true,
              centre: { select: { hospitalId: true, name: true, institutionType: true } },
            },
          },
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { userId: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: "User accounts retrieved successfully.",
      data: {
        users,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateAdminUserStatus = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const { status } = req.body;

    if (!Number.isSafeInteger(userId) || userId < 1 || !USER_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "A valid user ID and account status are required.",
      });
    }

    if (userId === req.user.userId && status === "INACTIVE") {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate your own administrator account.",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { userId },
      select: { userId: true, role: true, status: true },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    if (existingUser.role === "ADMIN" && existingUser.status === "ACTIVE" && status === "INACTIVE") {
      const otherActiveAdmins = await prisma.user.count({
        where: {
          role: "ADMIN",
          status: "ACTIVE",
          userId: { not: userId },
        },
      });

      if (otherActiveAdmins === 0) {
        return res.status(409).json({
          success: false,
          message: "The last active administrator cannot be deactivated.",
        });
      }
    }

    const user = await prisma.user.update({
      where: { userId },
      data: { status },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "User account status updated successfully.",
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

const createAdminHospitalStaff = async (req, res, next) => {
  try {
    const firstName = req.body.firstName.trim();
    const lastName = req.body.lastName.trim();
    const email = req.body.email.trim().toLowerCase();
    const phone = req.body.phone.trim();
    const designation = req.body.designation.trim();
    const hospitalId = Number(req.body.hospitalId);
    const password = await bcrypt.hash(req.body.temporaryPassword, 12);

    let staff;
    try {
      staff = await prisma.$transaction(async (tx) => {
        const hospital = await tx.hospital.findFirst({
          where: { hospitalId, isActive: true, institutionType: "HOSPITAL" },
          select: { hospitalId: true, name: true, institutionType: true },
        });
        if (!hospital) {
          throw Object.assign(
            new Error("Select an active HOSPITAL institution; KNBTS centres cannot be assigned hospital staff."),
            { status: 400 }
          );
        }

        const user = await tx.user.create({
          data: {
            firstName,
            lastName,
            email,
            phone,
            password,
            role: "HOSPITAL_STAFF",
            status: "ACTIVE",
            mustChangePassword: true,
          },
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            mustChangePassword: true,
            createdAt: true,
          },
        });
        const hospitalStaff = await tx.hospitalStaff.create({
          data: { userId: user.userId, hospitalId, designation },
          select: { staffId: true, designation: true, createdAt: true },
        });
        await tx.auditLog.create({
          data: {
            action: "HOSPITAL_STAFF_ACCOUNT_CREATED",
            entityType: "HospitalStaff",
            entityId: String(hospitalStaff.staffId),
            actorUserId: req.user.userId,
            details: { userId: user.userId, hospitalId, email },
          },
        });
        return { ...hospitalStaff, hospital, user };
      });
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ success: false, message: error.message });
      }
      if (error.code === "P2002") {
        return res.status(409).json({ success: false, message: "An account with this email already exists." });
      }
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: `Hospital staff account created for ${staff.hospital.name}. The staff member must change the temporary password at first login.`,
      data: { staff },
    });
  } catch (error) {
    next(error);
  }
};

const listAdminHospitals = async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const institutionType = typeof req.query.institutionType === "string" ? req.query.institutionType : "";
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 20);

    if (
      search.length > 100 ||
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      (status && !HOSPITAL_STATUSES.includes(status)) ||
      (institutionType && !INSTITUTION_TYPES.includes(institutionType))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid institution directory filters.",
      });
    }

    const where = {};

    if (status) where.isActive = status === "ACTIVE";
    if (institutionType) where.institutionType = institutionType;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
        { contactInfo: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, hospitals] = await Promise.all([
      prisma.hospital.count({ where }),
      prisma.hospital.findMany({
        where,
        select: {
          hospitalId: true,
          name: true,
          location: true,
          contactInfo: true,
          institutionType: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { hospitalId: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Institutions retrieved successfully.",
      data: {
        hospitals,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateAdminHospitalStatus = async (req, res, next) => {
  try {
    const hospitalId = Number(req.params.hospitalId);
    const { status } = req.body;

    if (!Number.isSafeInteger(hospitalId) || hospitalId < 1 || !HOSPITAL_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "A valid institution ID and status are required.",
      });
    }

    const existingHospital = await prisma.hospital.findUnique({
      where: { hospitalId },
      select: { hospitalId: true },
    });

    if (!existingHospital) {
      return res.status(404).json({
        success: false,
        message: "Institution not found.",
      });
    }

    const hospital = await prisma.hospital.update({
      where: { hospitalId },
      data: { isActive: status === "ACTIVE" },
      select: {
        hospitalId: true,
        name: true,
        location: true,
        contactInfo: true,
        institutionType: true,
        isActive: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Institution status updated successfully.",
      data: { hospital },
    });
  } catch (error) {
    next(error);
  }
};

const createAdminHospital = async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const location = typeof req.body.location === "string" ? req.body.location.trim() : "";
    const contactInfo = typeof req.body.contactInfo === "string" ? req.body.contactInfo.trim() : "";
    const institutionType = req.body.institutionType || "HOSPITAL";
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);

    if (
      !name ||
      !location ||
      !contactInfo ||
      !INSTITUTION_TYPES.includes(institutionType) ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide an institution name, address, contact details, and valid map coordinates.",
      });
    }

    const duplicate = await prisma.hospital.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        location: { equals: location, mode: "insensitive" },
      },
      select: { hospitalId: true },
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "An institution with this name and location is already registered.",
      });
    }

    const hospital = await prisma.hospital.create({
      data: { name, location, contactInfo, latitude, longitude, institutionType },
      select: {
        hospitalId: true,
        name: true,
        location: true,
        contactInfo: true,
        latitude: true,
        longitude: true,
        institutionType: true,
        isActive: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Institution added to the directory.",
      data: { hospital },
    });
  } catch (error) {
    next(error);
  }
};

const listAdminInventory = async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const bloodType = typeof req.query.bloodType === "string" ? req.query.bloodType : "";
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 20);

    if (
      search.length > 100 ||
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      (bloodType && !BLOOD_TYPES.includes(bloodType))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid inventory filters.",
      });
    }

    const [stockRecords, availableDonations] = await Promise.all([
      prisma.bloodInventory.findMany({
        select: {
          inventoryId: true,
          bloodType: true,
          unitsAvailable: true,
          minimumUnits: true,
          updatedAt: true,
          hospital: {
            select: { hospitalId: true, name: true, location: true, isActive: true },
          },
        },
      }),
      prisma.donationRecord.findMany({
        where: { status: "AVAILABLE" },
        select: {
          bloodType: true,
          quantity: true,
          createdAt: true,
          hospital: {
            select: { hospitalId: true, name: true, location: true, isActive: true },
          },
          hospitalStaff: {
            select: {
              hospital: {
                select: { hospitalId: true, name: true, location: true, isActive: true },
              },
            },
          },
        },
      }),
    ]);

    const hospitalsWithStock = new Set(
      stockRecords.map((record) => record.hospital.hospitalId)
    );
    const fallbackInventory = new Map();

    for (const donation of availableDonations) {
      const hospital = donation.hospital || donation.hospitalStaff?.hospital;

      if (!hospital || hospitalsWithStock.has(hospital.hospitalId)) continue;

      const key = `${hospital.hospitalId}:${donation.bloodType}`;
      const existing = fallbackInventory.get(key);

      if (existing) {
        existing.unitsAvailable += donation.quantity;
        if (donation.createdAt > existing.updatedAt) {
          existing.updatedAt = donation.createdAt;
        }
      } else {
        fallbackInventory.set(key, {
          inventoryId: null,
          bloodType: donation.bloodType,
          unitsAvailable: donation.quantity,
          minimumUnits: 5,
          updatedAt: donation.createdAt,
          hospital,
        });
      }
    }

    const searchTerm = search.toLowerCase();
    const filteredInventory = [...stockRecords, ...fallbackInventory.values()]
      .filter((record) => {
        if (bloodType && record.bloodType !== bloodType) return false;
        if (!searchTerm) return true;
        return [record.bloodType, record.hospital.name, record.hospital.location]
          .some((value) => value.toLowerCase().includes(searchTerm));
      })
      .sort((left, right) =>
        left.unitsAvailable - right.unitsAvailable ||
        left.hospital.hospitalId - right.hospital.hospitalId ||
        left.bloodType.localeCompare(right.bloodType)
      );
    const total = filteredInventory.length;
    const inventory = filteredInventory.slice((page - 1) * pageSize, page * pageSize);

    return res.status(200).json({
      success: true,
      message: "Blood inventory retrieved successfully.",
      data: {
        inventory,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdminDashboard,
  listAdminUsers,
  updateAdminUserStatus,
  createAdminHospitalStaff,
  listAdminHospitals,
  createAdminHospital,
  updateAdminHospitalStatus,
  listAdminInventory,
};