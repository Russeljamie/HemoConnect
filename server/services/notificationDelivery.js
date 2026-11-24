const { enqueueEmail } = require("./email");
const { enqueueSms } = require("./sms");

const formatAppointmentDate = (date) => new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(date));

const appointmentReference = (appointmentId) => `HC-${appointmentId}`;

const appointmentNotificationDetails = (appointment) => {
  const donor = appointment.donor;
  const hospitalName = appointment.hospital?.name || "the selected hospital";
  const name = donor ? `${donor.firstName} ${donor.lastName}`.trim() : "Donor";
  const date = formatAppointmentDate(appointment.date);
  const time = appointment.time;
  const reference = appointmentReference(appointment.appointmentId);
  const purpose = appointment.purpose.toLowerCase();

  return {
    name,
    hospital: hospitalName,
    date,
    time,
    reference,
    purpose: appointment.purpose,
    emailPayload: { name, hospital: hospitalName, date: appointment.date, time, reference, purpose: appointment.purpose },
    bookingMessage: `Your HemoConnect ${purpose} appointment (${reference}) at ${hospitalName} is scheduled for ${date} at ${time}. Please arrive on time and bring the required identification.`,
    cancellationMessage: `Your HemoConnect ${purpose} appointment (${reference}) at ${hospitalName} on ${date} at ${time} was cancelled. Contact the hospital if you need assistance.`,
    reminderMessage: `Reminder: your HemoConnect ${purpose} appointment (${reference}) at ${hospitalName} is tomorrow, ${date} at ${time}. Please arrive on time with your identification.`,
  };
};

const createInAppNotification = async (tx, {
  userId,
  type,
  title,
  message,
  requestId,
}) => {
  if (!userId) return null;

  return tx.notification.create({
    data: {
      type,
      channel: "IN_APP",
      title,
      message,
      status: "SENT",
      sentAt: new Date(),
      userId,
      ...(requestId ? { requestId } : {}),
    },
  });
};

const notifyUser = async (tx, {
  userId,
  email,
  phone,
  eventKey,
  type,
  title,
  message,
  requestId,
  emailTemplate,
  emailPayload,
  smsMessage,
}) => {
  const notification = await createInAppNotification(tx, { userId, type, title, message, requestId });
  if (!notification) return null;

  if (emailTemplate) await enqueueEmail(tx, email, emailTemplate, emailPayload || {});
  if (smsMessage) await enqueueSms(tx, phone, smsMessage, `${eventKey}:sms`);
  return notification;
};

const notifyAppointment = async (tx, appointment, event) => {
  const details = appointmentNotificationDetails(appointment);
  const user = appointment.donor?.user;
  if (!user) return null;

  if (event === "BOOKED") {
    return notifyUser(tx, {
      userId: user.userId,
      email: user.email,
      phone: user.phone,
      eventKey: `appointment-${appointment.appointmentId}-booked`,
      type: "APPOINTMENT_BOOKED",
      title: "Appointment scheduled",
      message: details.bookingMessage,
      emailTemplate: "APPOINTMENT_BOOKED",
      emailPayload: details.emailPayload,
      smsMessage: details.bookingMessage,
    });
  }
  if (event === "CANCELLED") {
    return notifyUser(tx, {
      userId: user.userId,
      email: user.email,
      phone: user.phone,
      eventKey: `appointment-${appointment.appointmentId}-cancelled`,
      type: "APPOINTMENT_CANCELLED",
      title: "Appointment cancelled",
      message: details.cancellationMessage,
      emailTemplate: "APPOINTMENT_CANCELLED",
      emailPayload: details.emailPayload,
      smsMessage: details.cancellationMessage,
    });
  }
  if (event === "REMINDER") {
    return notifyUser(tx, {
      userId: user.userId,
      email: user.email,
      phone: user.phone,
      eventKey: `appointment-${appointment.appointmentId}-reminder`,
      type: "APPOINTMENT_REMINDER",
      title: "Appointment reminder",
      message: details.reminderMessage,
      smsMessage: details.reminderMessage,
    });
  }
  throw new Error(`Unknown appointment notification event: ${event}`);
};

const queueHospitalInventoryAlert = async (tx, { inventory, eventKey, actorUserId }) => {
  if (inventory.unitsAvailable > inventory.minimumUnits) return 0;
  const [hospital, staff] = await Promise.all([
    tx.hospital.findUnique({
      where: { hospitalId: inventory.hospitalId },
      select: { name: true },
    }),
    tx.hospitalStaff.findMany({
      where: {
        hospitalId: inventory.hospitalId,
        user: { status: "ACTIVE", role: "HOSPITAL_STAFF" },
      },
      select: {
        user: { select: { userId: true, firstName: true, lastName: true, email: true, phone: true } },
      },
    }),
  ]);
  if (!staff.length) return 0;

  await tx.auditLog.create({
    data: {
      action: "HOSPITAL_LOW_INVENTORY_ALERT_QUEUED",
      entityType: "BloodInventory",
      entityId: String(inventory.inventoryId),
      actorUserId,
      details: {
        hospitalId: inventory.hospitalId,
        bloodType: inventory.bloodType,
        unitsAvailable: inventory.unitsAvailable,
        minimumUnits: inventory.minimumUnits,
        recipientCount: staff.length,
      },
    },
  });

  for (const { user } of staff) {
    await notifyUser(tx, {
      userId: user.userId,
      email: user.email,
      phone: user.phone,
      eventKey: `${eventKey}-staff-${user.userId}`,
      type: "HOSPITAL_INVENTORY_ALERT",
      title: `Low ${inventory.bloodType} blood inventory`,
      message: `${hospital?.name || "Your hospital"} has ${inventory.unitsAvailable} units of ${inventory.bloodType} blood available, at or below the minimum of ${inventory.minimumUnits}.`,
      emailTemplate: "INVENTORY_ALERT",
      emailPayload: {
        name: `${user.firstName} ${user.lastName}`,
        hospital: hospital?.name || "Your hospital",
        bloodType: inventory.bloodType,
        units: inventory.unitsAvailable,
        minimumUnits: inventory.minimumUnits,
      },
      smsMessage: `HemoConnect low inventory: ${hospital?.name || "Your hospital"} has ${inventory.unitsAvailable} ${inventory.bloodType} units (minimum ${inventory.minimumUnits}). Please review stock.`,
    });
  }
  return staff.length;
};

module.exports = {
  formatAppointmentDate,
  appointmentReference,
  appointmentNotificationDetails,
  createInAppNotification,
  notifyUser,
  notifyAppointment,
  queueHospitalInventoryAlert,
};
