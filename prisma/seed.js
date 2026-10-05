const { PrismaClient } = require("../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");
const bcrypt = require("bcryptjs");

require("dotenv").config();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting HemoConnect database seed...\n");

  // ---------------------------------------------------------
  // 1. CLEAR EXISTING DATA
  // ---------------------------------------------------------

  await prisma.alert.deleteMany();
  await prisma.rewardTransaction.deleteMany();
  await prisma.donationRecord.deleteMany();
  await prisma.emergencyRequest.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.hospitalStaff.deleteMany();
  await prisma.nGOUser.deleteMany();
  await prisma.donor.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.nGO.deleteMany();
  await prisma.hospital.deleteMany();

  // Admin depends on User, so delete Admin first
  await prisma.admin.deleteMany();
  await prisma.user.deleteMany();

  console.log("✓ Existing data cleared");

  // ---------------------------------------------------------
  // 2. USER ACCOUNTS + ADMIN
  // ---------------------------------------------------------

  const hashedPassword = await bcrypt.hash("Password123!", 10);

  // Create the admin's User account first
  const adminUser = await prisma.user.create({
    data: {
      firstName: "System",
      lastName: "Administrator",
      email: "admin@hemoconnect.co.ke",
      phone: "0700000000",
      password: hashedPassword,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  // Then create the Admin record linked to that User
  const admin = await prisma.admin.create({
    data: {
      userId: adminUser.userId,
    },
  });

  console.log("✓ Admin user and account created");

  // ---------------------------------------------------------
  // 3. HOSPITALS
  // ---------------------------------------------------------

  const hospitals = await Promise.all([
    prisma.hospital.create({
      data: {
        name: "Kenyatta National Hospital",
        location: "Hospital Road, Nairobi",
        contactInfo: "0202726300",
      },
    }),

    prisma.hospital.create({
      data: {
        name: "Mama Lucy Kibaki Hospital",
        location: "Donholm, Nairobi",
        contactInfo: "0208000000",
      },
    }),

    prisma.hospital.create({
      data: {
        name: "Mbagathi Hospital",
        location: "Mbagathi Road, Nairobi",
        contactInfo: "0202729800",
      },
    }),

    prisma.hospital.create({
      data: {
        name: "Aga Khan University Hospital",
        location: "3rd Parklands Avenue, Nairobi",
        contactInfo: "0203662020",
      },
    }),

    prisma.hospital.create({
      data: {
        name: "MP Shah Hospital",
        location: "Shivachi Road, Parklands, Nairobi",
        contactInfo: "0204291000",
      },
    }),
  ]);

  console.log(`✓ ${hospitals.length} hospitals created`);

  // ---------------------------------------------------------
  // 4. NGOs
  // ---------------------------------------------------------

  const ngos = await Promise.all([
    prisma.nGO.create({
      data: {
        name: "Kenya Red Cross",
        location: "South C, Nairobi",
        contactInfo: "0700395395",
      },
    }),

    prisma.nGO.create({
      data: {
        name: "Nairobi Community Blood Initiative",
        location: "Westlands, Nairobi",
        contactInfo: "0712345678",
      },
    }),
  ]);

  console.log(`✓ ${ngos.length} NGOs created`);

  // ---------------------------------------------------------
  // 5. HOSPITAL ↔ NGO RELATIONSHIP
  // ---------------------------------------------------------

  for (const hospital of hospitals) {
    for (const ngo of ngos) {
      await prisma.hospital.update({
        where: {
          hospitalId: hospital.hospitalId,
        },
        data: {
          ngos: {
            connect: {
              ngoId: ngo.ngoId,
            },
          },
        },
      });
    }
  }

  console.log("✓ Hospital-NGO collaborations created");

  // ---------------------------------------------------------
  // 6. NGO USERS
  // ---------------------------------------------------------

  const ngoUsers = [];

  for (let i = 0; i < ngos.length; i++) {
    const ngoUserAccount = await prisma.user.create({
      data: {
        firstName: "NGO",
        lastName: `User${i + 1}`,
        email: `ngo${i + 1}@hemoconnect.co.ke`,
        phone: `07300000${String(i + 1).padStart(2, "0")}`,
        password: hashedPassword,
        role: "NGO",
        status: "ACTIVE",
      },
    });

    const ngoUser = await prisma.nGOUser.create({
      data: {
        userId: ngoUserAccount.userId,
        ngoId: ngos[i].ngoId,
        createdByAdminId: admin.adminId,
      },
    });

    ngoUsers.push(ngoUser);
  }

  console.log(`✓ ${ngoUsers.length} NGO users created`);

  // ---------------------------------------------------------
  // 7. HOSPITAL STAFF
  // ---------------------------------------------------------

  const staffNames = [
    "Brian Mwangi",
    "Faith Wanjiku",
    "Kevin Otieno",
    "Mercy Njeri",
    "Daniel Kamau",
    "Ann Wambui",
    "Joseph Kiptoo",
    "Lucy Achieng",
    "Mark Ochieng",
    "Esther Nyambura",
  ];

  const hospitalStaff = [];

  for (let i = 0; i < staffNames.length; i++) {
    const [firstName, lastName] = staffNames[i].split(" ");

    // Create User account for hospital staff
    const staffUser = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email: `staff${i + 1}@hemoconnect.co.ke`,
        phone: `07400000${String(i + 1).padStart(2, "0")}`,
        password: hashedPassword,
        role: "HOSPITAL_STAFF",
        status: "ACTIVE",
      },
    });

    // Create HospitalStaff profile linked to the User
    const staff = await prisma.hospitalStaff.create({
      data: {
        userId: staffUser.userId,
        hospitalId: hospitals[i % hospitals.length].hospitalId,
        designation:
          i % 2 === 0
            ? "Blood Bank Officer"
            : "Laboratory Technologist",
      },
    });

    hospitalStaff.push(staff);
  }

  console.log(`✓ ${hospitalStaff.length} hospital staff created`);

  // ---------------------------------------------------------
  // 8. PATIENTS
  // ---------------------------------------------------------

  const patientsData = [
    ["James", "Kamau", "O+", "0711000001", "Male"],
    ["Mary", "Wanjiku", "A+", "0711000002", "Female"],
    ["David", "Otieno", "B+", "0711000003", "Male"],
    ["Grace", "Achieng", "O-", "0711000004", "Female"],
    ["Peter", "Mwangi", "AB+", "0711000005", "Male"],
    ["Sarah", "Njeri", "A-", "0711000006", "Female"],
    ["Samuel", "Kiptoo", "O+", "0711000007", "Male"],
    ["Anne", "Wambui", "B-", "0711000008", "Female"],
    ["Michael", "Ochieng", "O+", "0711000009", "Male"],
    ["Catherine", "Nyambura", "A+", "0711000010", "Female"],
  ];

  const patients = [];

  for (let i = 0; i < patientsData.length; i++) {
    const [firstName, lastName, bloodType, phone, gender] =
      patientsData[i];

    // Create User account for patient
    const patientUser = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email: `patient${i + 1}@hemoconnect.co.ke`,
        phone,
        password: hashedPassword,
        role: "PATIENT",
        status: "ACTIVE",
      },
    });

    // Create Patient profile linked to the User
    const patient = await prisma.patient.create({
      data: {
        userId: patientUser.userId,
        firstName,
        lastName,
        bloodType,
        address:
          [
            "Westlands",
            "Kasarani",
            "Embakasi",
            "Lang'ata",
            "Dagoretti",
          ][i % 5] + ", Nairobi",
        phone,
        birthDate: new Date(
          1985 + (i % 15),
          i % 12,
          10 + (i % 15)
        ),
        gender,
        hospitalId: hospitals[i % hospitals.length].hospitalId,
      },
    });

    patients.push(patient);
  }

  console.log(`✓ ${patients.length} patients created`);

  // ---------------------------------------------------------
  // 9. DONORS
  // ---------------------------------------------------------

  const donorData = [
    ["Brian", "Kamau", "O+", 27, "Male", "Westlands", -1.2676, 36.8108],
    ["Wanjiku", "Mwangi", "O+", 24, "Female", "Kasarani", -1.2215, 36.8970],
    ["Kevin", "Otieno", "A+", 31, "Male", "Embakasi", -1.3180, 36.8940],
    ["Faith", "Wanjiku", "B+", 26, "Female", "Lang'ata", -1.3620, 36.7460],
    ["Dennis", "Kiptoo", "O+", 29, "Male", "Dagoretti", -1.3000, 36.7600],
    ["Mercy", "Njeri", "A+", 22, "Female", "Westlands", -1.2630, 36.8060],
    ["Samuel", "Ochieng", "O-", 35, "Male", "Kasarani", -1.2300, 36.8900],
    ["Ann", "Wambui", "B+", 28, "Female", "Embakasi", -1.3190, 36.9000],
    ["David", "Kamau", "AB+", 33, "Male", "Lang'ata", -1.3550, 36.7500],
    ["Lucy", "Achieng", "O+", 25, "Female", "Dagoretti", -1.2960, 36.7650],
    ["Joseph", "Mwangi", "A+", 30, "Male", "Westlands", -1.2700, 36.8150],
    ["Esther", "Njeri", "O+", 23, "Female", "Kasarani", -1.2180, 36.9000],
    ["Mark", "Otieno", "B-", 38, "Male", "Embakasi", -1.3200, 36.8850],
    ["Jane", "Wanjiku", "A-", 29, "Female", "Lang'ata", -1.3600, 36.7550],
    ["Daniel", "Kiptoo", "O+", 34, "Male", "Dagoretti", -1.3050, 36.7550],
    ["Cynthia", "Kamau", "B+", 27, "Female", "Westlands", -1.2600, 36.8000],
    ["Peter", "Ochieng", "O+", 32, "Male", "Kasarani", -1.2250, 36.8950],
    ["Susan", "Mwangi", "A+", 21, "Female", "Embakasi", -1.3150, 36.9100],
    ["George", "Njoroge", "AB+", 36, "Male", "Lang'ata", -1.3500, 36.7400],
    ["Caroline", "Wambui", "O-", 28, "Female", "Dagoretti", -1.3100, 36.7700],
    ["Alex", "Kamau", "O+", 26, "Male", "Westlands", -1.2650, 36.8050],
    ["Beatrice", "Njeri", "A+", 30, "Female", "Kasarani", -1.2200, 36.8850],
    ["Victor", "Otieno", "B+", 39, "Male", "Embakasi", -1.3250, 36.8950],
    ["Irene", "Achieng", "O+", 24, "Female", "Lang'ata", -1.3650, 36.7450],
    ["Martin", "Mwangi", "AB-", 37, "Male", "Dagoretti", -1.2950, 36.7550],
  ];

  const donors = [];

  for (let i = 0; i < donorData.length; i++) {
    const [
      firstName,
      lastName,
      bloodType,
      age,
      gender,
      area,
      latitude,
      longitude,
    ] = donorData[i];

    // Create User account for donor
    const donorUser = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email: `donor${i + 1}@hemoconnect.co.ke`,
        phone: `07500000${String(i + 1).padStart(2, "0")}`,
        password: hashedPassword,
        role: "DONOR",
        status: "ACTIVE",
      },
    });

    // Create Donor profile linked to the User
    const donor = await prisma.donor.create({
      data: {
        firstName,
        lastName,
        bloodType,
        age,
        gender,
        address: `${area}, Nairobi`,
        latitude,
        longitude,
        donationFrequency:
          i % 3 === 0
            ? "Regular"
            : i % 3 === 1
            ? "Occasional"
            : "First-time",
        points: (i % 6) * 20,
        userId: donorUser.userId,
      },
    });

    donors.push(donor);
  }

  console.log(`✓ ${donors.length} donors created`);

  // ---------------------------------------------------------
  // 10. APPOINTMENTS
  // ---------------------------------------------------------

  const appointments = [];

  for (let i = 0; i < 15; i++) {
    const appointment = await prisma.appointment.create({
      data: {
        date: new Date(2026, 8, 29 + (i % 10)),
        time: `${9 + (i % 7)}:00`,
        purpose: i % 3 === 0 ? "Blood Donation" : "Blood Test",
        status: i % 4 === 0 ? "COMPLETED" : "SCHEDULED",
        donorId: donors[i % donors.length].donorId,
        patientId: patients[i % patients.length].patientId,
      },
    });

    appointments.push(appointment);
  }

  console.log(`✓ ${appointments.length} appointments created`);

  // ---------------------------------------------------------
  // 11. DONATION RECORDS
  // ---------------------------------------------------------

  const donationRecords = [];

  for (let i = 0; i < 15; i++) {
    const donor = donors[i % donors.length];

    const donation = await prisma.donationRecord.create({
      data: {
        donationDate: new Date(2026, 8, 20 - (i % 10)),
        bloodType: donor.bloodType,
        quantity: 450,
        status: "AVAILABLE",
        donorId: donor.donorId,
        appointmentId: appointments[i].appointmentId,
        staffId: hospitalStaff[i % hospitalStaff.length].staffId,
      },
    });

    donationRecords.push(donation);
  }

  console.log(`✓ ${donationRecords.length} donation records created`);

  // ---------------------------------------------------------
  // 12. REWARD TRANSACTIONS
  // ---------------------------------------------------------

  for (let i = 0; i < donationRecords.length; i++) {
    await prisma.rewardTransaction.create({
      data: {
        pointsEarned: 20,
        awardDate: donationRecords[i].donationDate,
        description: "Blood donation reward",
        donationId: donationRecords[i].donationId,
      },
    });
  }

  console.log("✓ Reward transactions created");

  // ---------------------------------------------------------
  // 13. EMERGENCY REQUESTS
  // ---------------------------------------------------------

  const emergencyRequests = [];

  const emergencyData = [
    ["O+", 3, "HIGH"],
    ["O-", 2, "CRITICAL"],
    ["A+", 2, "HIGH"],
    ["B+", 3, "MEDIUM"],
    ["AB+", 1, "CRITICAL"],
  ];

  for (let i = 0; i < emergencyData.length; i++) {
    const [bloodType, quantityRequired, urgencyLevel] =
      emergencyData[i];

    const request = await prisma.emergencyRequest.create({
      data: {
        bloodType,
        quantityRequired,
        urgencyLevel,
        status: i === 1 || i === 4 ? "URGENT" : "OPEN",
        requestDate: new Date(),
        neededBy: new Date(
          Date.now() + (i + 1) * 24 * 60 * 60 * 1000
        ),
        patientId: patients[i].patientId,
      },
    });

    emergencyRequests.push(request);
  }

  console.log(
    `✓ ${emergencyRequests.length} emergency requests created`
  );

  // ---------------------------------------------------------
  // 14. LINK DONATIONS TO EMERGENCY REQUESTS
  // ---------------------------------------------------------

  for (let i = 0; i < emergencyRequests.length; i++) {
    await prisma.emergencyRequest.update({
      where: {
        requestId: emergencyRequests[i].requestId,
      },
      data: {
        donationRecords: {
          connect: {
            donationId: donationRecords[i].donationId,
          },
        },
      },
    });
  }

  console.log("✓ Emergency request donations linked");

  // ---------------------------------------------------------
  // 15. ALERTS
  // ---------------------------------------------------------

  for (let i = 0; i < emergencyRequests.length; i++) {
    await prisma.alert.create({
      data: {
        alertType: "Emergency Blood Request",
        channel: i % 2 === 0 ? "SMS" : "EMAIL",
        message: `Urgent request for ${emergencyRequests[i].bloodType} blood`,
        sentAt: new Date(),
        requestId: emergencyRequests[i].requestId,
      },
    });
  }

  console.log("✓ Alerts created");

  // ---------------------------------------------------------
  // 16. CAMPAIGNS
  // ---------------------------------------------------------

  const campaigns = [
    {
      name: "Nairobi Blood Drive 2026",
      description:
        "Community blood donation campaign across Nairobi.",
      startDate: new Date("2026-10-01"),
      endDate: new Date("2026-10-07"),
      location: "Nairobi CBD",
      status: "ACTIVE",
    },

    {
      name: "Save a Life Campaign",
      description:
        "Blood donation awareness and recruitment campaign.",
      startDate: new Date("2026-10-10"),
      endDate: new Date("2026-10-20"),
      location: "Westlands",
      status: "PLANNED",
    },

    {
      name: "University Blood Drive",
      description:
        "Student-focused blood donation campaign.",
      startDate: new Date("2026-11-01"),
      endDate: new Date("2026-11-05"),
      location: "Nairobi",
      status: "PLANNED",
    },
  ];

  for (const campaign of campaigns) {
    await prisma.campaign.create({
      data: {
        ...campaign,
        createdByAdminId: admin.adminId,
      },
    });
  }

  console.log(`✓ ${campaigns.length} campaigns created`);

  // ---------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------

  const totalUsers =
    1 +
    ngoUsers.length +
    hospitalStaff.length +
    patients.length +
    donors.length;

  console.log("\n========================================");
  console.log("🎉 HemoConnect seed completed!");
  console.log("========================================");
  console.log(`Admin:                 1`);
  console.log(`User accounts:         ${totalUsers}`);
  console.log(`Hospitals:             ${hospitals.length}`);
  console.log(`NGOs:                  ${ngos.length}`);
  console.log(`NGO Users:             ${ngoUsers.length}`);
  console.log(`Hospital Staff:        ${hospitalStaff.length}`);
  console.log(`Patients:              ${patients.length}`);
  console.log(`Donors:                ${donors.length}`);
  console.log(`Appointments:          ${appointments.length}`);
  console.log(`Donation Records:      ${donationRecords.length}`);
  console.log(`Reward Transactions:   ${donationRecords.length}`);
  console.log(`Emergency Requests:    ${emergencyRequests.length}`);
  console.log(`Alerts:                ${emergencyRequests.length}`);
  console.log(`Campaigns:             ${campaigns.length}`);
  console.log("========================================\n");

  console.log("Development login password for all seeded accounts:");
  console.log("Password123!");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });