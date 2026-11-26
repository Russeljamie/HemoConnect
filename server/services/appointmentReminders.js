const prisma = require("./prisma");
const { appointmentNotificationDetails, createInAppNotification } = require("./notificationDelivery");

const REMINDER_INTERVAL_MS = 15 * 60 * 1000;

const getNextNairobiDate = (now) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + 1));
};

const processAppointmentReminders = async (now = new Date(), options = {}) => {
  const nextNairobiDate = getNextNairobiDate(now);
  const appointments = await prisma.appointment.findMany({
    where: {
      date: nextNairobiDate,
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      donorId: { not: null },
      ...(options.appointmentId ? { appointmentId: options.appointmentId } : {}),
    },
    include: {
      donor: {
        select: {
          firstName: true,
          lastName: true,
          user: { select: { userId: true, email: true, phone: true, status: true } },
        },
      },
      hospital: { select: { name: true } },
    },
  });

  let remindersQueued = 0;
  for (const appointment of appointments) {
    if (appointment.donor?.user?.status !== "ACTIVE") continue;
    const details = appointmentNotificationDetails(appointment);
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`
        SELECT "appointmentId"
        FROM "Appointment"
        WHERE "appointmentId" = ${appointment.appointmentId}
        FOR UPDATE
      `;
      if (!locked.length) return;

      const current = await tx.appointment.findFirst({
        where: {
          appointmentId: appointment.appointmentId,
          date: nextNairobiDate,
          status: { in: ["SCHEDULED", "CONFIRMED"] },
          donor: { user: { status: "ACTIVE" } },
        },
        select: { appointmentId: true },
      });
      if (!current) return;

      const existing = await tx.notification.findFirst({
        where: {
          userId: appointment.donor.user.userId,
          type: "APPOINTMENT_REMINDER",
          message: details.reminderMessage,
        },
        select: { notificationId: true },
      });
      if (existing) return;

      await createInAppNotification(tx, {
        userId: appointment.donor.user.userId,
        type: "APPOINTMENT_REMINDER",
        title: "Appointment reminder",
        message: details.reminderMessage,
      });
      remindersQueued += 1;
    });
  }
  return remindersQueued;
};

let workerTimer;
const startAppointmentReminderWorker = () => {
  if (workerTimer) return workerTimer;
  const run = () => {
    processAppointmentReminders().catch((error) => {
      console.error("Appointment reminder worker failed:", error.message);
    });
  };
  run();
  workerTimer = setInterval(run, REMINDER_INTERVAL_MS);
  workerTimer.unref();
  return workerTimer;
};

module.exports = { getNextNairobiDate, processAppointmentReminders, startAppointmentReminderWorker };
