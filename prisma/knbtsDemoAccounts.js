const bcrypt = require("bcryptjs");

const DEMO_PASSWORD = "Password123!";

const KNBTS_CENTRE = Object.freeze({
  name: "KNBTS Nairobi Regional Blood Transfusion Centre",
  location: "Nairobi, Kenya",
  contactInfo: "KNBTS Nairobi Centre",
  latitude: -1.3005,
  longitude: 36.8070,
  institutionType: "KNBTS_CENTRE",
  isActive: true,
});

const KNBTS_STAFF_ACCOUNTS = Object.freeze([
  {
    firstName: "KNBTS",
    lastName: "Staff One",
    email: "knbts1@hemoconnect.co.ke",
    phone: "0760000001",
    designation: "Blood Bank Technician",
  },
  {
    firstName: "KNBTS",
    lastName: "Staff Two",
    email: "knbts2@hemoconnect.co.ke",
    phone: "0760000002",
    designation: "Centre Coordinator",
  },
]);

async function hashDemoPassword() {
  return bcrypt.hash(DEMO_PASSWORD, 10);
}

function getDemoPassword() {
  return DEMO_PASSWORD;
}

async function ensureKnbtsDemoAccounts(prisma, passwordHash) {
  const existingCentre = await prisma.hospital.findFirst({
    where: { name: KNBTS_CENTRE.name },
    select: {
      hospitalId: true,
      name: true,
      location: true,
      latitude: true,
      longitude: true,
      institutionType: true,
      isActive: true,
    },
  });

  if (existingCentre && existingCentre.institutionType !== KNBTS_CENTRE.institutionType) {
    throw new Error(`An institution named "${KNBTS_CENTRE.name}" already exists with a different type.`);
  }

  const centre = existingCentre || await prisma.hospital.create({
    data: KNBTS_CENTRE,
    select: {
      hospitalId: true,
      name: true,
      location: true,
      latitude: true,
      longitude: true,
      institutionType: true,
      isActive: true,
    },
  });

  const staffProfiles = [];
  for (const account of KNBTS_STAFF_ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: {
        firstName: account.firstName,
        lastName: account.lastName,
        phone: account.phone,
        password: passwordHash,
        role: "KNBTS_STAFF",
        status: "ACTIVE",
        mustChangePassword: false,
      },
      create: {
        firstName: account.firstName,
        lastName: account.lastName,
        email: account.email,
        phone: account.phone,
        password: passwordHash,
        role: "KNBTS_STAFF",
        status: "ACTIVE",
        mustChangePassword: false,
      },
      select: { userId: true, firstName: true, lastName: true },
    });

    const staffProfile = await prisma.knbtsStaff.upsert({
      where: { userId: user.userId },
      update: {
        centreId: centre.hospitalId,
        designation: account.designation,
      },
      create: {
        userId: user.userId,
        centreId: centre.hospitalId,
        designation: account.designation,
      },
      select: {
        knbtsStaffId: true,
        designation: true,
        userId: true,
        centreId: true,
      },
    });

    staffProfiles.push({ ...staffProfile, user });
  }

  return { centre, staffProfiles };
}

module.exports = {
  KNBTS_CENTRE,
  KNBTS_STAFF_ACCOUNTS,
  ensureKnbtsDemoAccounts,
  getDemoPassword,
  hashDemoPassword,
};
