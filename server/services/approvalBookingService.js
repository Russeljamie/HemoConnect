const { notifyAppointment } = require("./notificationDelivery");

const getDatabaseNow = async (tx) => {
  const rows = await tx.$queryRaw`SELECT NOW() AS "databaseNow"`;
  const now = rows[0]?.databaseNow instanceof Date
    ? rows[0].databaseNow
    : new Date(rows[0]?.databaseNow);
  if (!Number.isFinite(now.getTime())) return null;
  return now;
};

const lockActiveApprovalForBooking = async (tx, donorId, now) => {
  const approvals = await tx.$queryRaw`
    SELECT "approvalId", "donorId", "status", "approvedAt", "expiresAt"
    FROM "QuestionnaireApproval"
    WHERE "donorId" = ${donorId}
      AND "status" = 'ACTIVE'
    FOR UPDATE
  `;
  for (const approval of approvals) {
    if (approval.expiresAt <= now) {
      await tx.questionnaireApproval.update({
        where: { approvalId: approval.approvalId },
        data: { status: "EXPIRED" },
      });
    }
  }

  const activeApproval = await tx.questionnaireApproval.findFirst({
    where: {
      donorId,
      status: "ACTIVE",
      expiresAt: { gt: now },
    },
    orderBy: [{ approvedAt: "desc" }, { approvalId: "desc" }],
  });
  if (!activeApproval) return { error: "NO_VALID_APPROVAL" };

  const activeAssociation = await tx.questionnaireBookingAssociation.findFirst({
    where: { approvalId: activeApproval.approvalId, status: "ACTIVE" },
    include: { appointment: { select: { appointmentId: true, status: true } } },
  });
  if (activeAssociation) {
    return { error: "ACTIVE_APPROVAL_BOOKING_EXISTS" };
  }
  return { approval: activeApproval };
};

const cancelAppointmentWithApproval = async (tx, {
  appointmentId,
  donorId,
  hospitalId = null,
  actorUserId = null,
  today = null,
}) => {
  const appointmentRows = await tx.$queryRaw`
    SELECT "appointmentId", "donorId", "hospitalId", "slotId", "status"
    FROM "Appointment"
    WHERE "appointmentId" = ${appointmentId}
      AND (${donorId}::integer IS NULL OR "donorId" = ${donorId})
      AND (${hospitalId}::integer IS NULL OR "hospitalId" = ${hospitalId})
    FOR UPDATE
  `;
  if (!appointmentRows.length) return { error: "NOT_FOUND" };
  const appointment = appointmentRows[0];
  if (!["SCHEDULED", "CONFIRMED"].includes(appointment.status)) {
    return { error: "NOT_CANCELLABLE" };
  }
  const appointmentDetails = await tx.appointment.findUnique({
    where: { appointmentId },
    include: {
      donor: {
        select: {
          firstName: true,
          lastName: true,
          user: { select: { userId: true, email: true, phone: true } },
        },
      },
      hospital: { select: { name: true } },
    },
  });
  if (!appointmentDetails) return { error: "NOT_FOUND" };

  const now = await getDatabaseNow(tx);
  if (!now) return { error: "DATABASE_CLOCK_UNAVAILABLE" };

  const association = await tx.questionnaireBookingAssociation.findFirst({
    where: { appointmentId, status: "ACTIVE" },
  });
  let approval = null;
  if (association) {
    const approvalRows = await tx.$queryRaw`
      SELECT "approvalId", "donorId", "status", "expiresAt"
      FROM "QuestionnaireApproval"
      WHERE "approvalId" = ${association.approvalId}
      FOR UPDATE
    `;
    approval = approvalRows[0] || null;
    if (!approval || approval.donorId !== appointment.donorId) {
      return { error: "INVALID_APPROVAL_RELATIONSHIP" };
    }
  }

  const updated = await tx.appointment.updateMany({
    where: {
      appointmentId,
      donorId,
      ...(hospitalId ? { hospitalId } : {}),
      status: { in: ["SCHEDULED", "CONFIRMED"] },
    },
    data: { status: "CANCELLED" },
  });
  if (!updated.count) return { error: "NOT_CANCELLABLE" };

  if (appointment.slotId) {
    await tx.appointmentSlot.updateMany({
      where: { slotId: appointment.slotId, bookedCount: { gt: 0 } },
      data: { bookedCount: { decrement: 1 } },
    });
  }

  if (association && approval) {
    if (now < approval.expiresAt) {
      await tx.questionnaireBookingAssociation.update({
        where: { bookingAssociationId: association.bookingAssociationId },
        data: { status: "CANCELLED_RELEASED", releasedAt: now },
      });
      if (approval.status !== "ACTIVE") {
        await tx.questionnaireApproval.update({
          where: { approvalId: approval.approvalId },
          data: { status: "ACTIVE" },
        });
      }
    } else {
      await tx.questionnaireBookingAssociation.update({
        where: { bookingAssociationId: association.bookingAssociationId },
        data: { status: "CANCELLED_EXPIRED", releasedAt: now },
      });
      await tx.questionnaireApproval.update({
        where: { approvalId: approval.approvalId },
        data: { status: "EXPIRED" },
      });
    }
  }
  await tx.auditLog.create({
    data: {
      action: hospitalId ? "HOSPITAL_APPOINTMENT_CANCELLED" : "DONOR_APPOINTMENT_CANCELLED",
      entityType: "Appointment",
      entityId: String(appointmentId),
      actorUserId,
      details: { donorId: appointment.donorId, hospitalId: appointment.hospitalId },
    },
  });
  await notifyAppointment(tx, appointmentDetails, "CANCELLED");
  return { cancelled: true, now, approval, appointment: appointmentDetails };
};

const consumeApprovalForCompletedDonation = async (tx, appointmentId, donorId) => {
  const association = await tx.questionnaireBookingAssociation.findFirst({
    where: { appointmentId, status: "ACTIVE" },
  });
  if (!association) return null;

  const approvalRows = await tx.$queryRaw`
    SELECT "approvalId", "donorId", "status"
    FROM "QuestionnaireApproval"
    WHERE "approvalId" = ${association.approvalId}
    FOR UPDATE
  `;
  const approval = approvalRows[0];
  if (!approval || approval.donorId !== donorId) {
    throw Object.assign(new Error("Booking association does not belong to the donor."), {
      workflowError: "INVALID_APPROVAL_RELATIONSHIP",
    });
  }

  const now = await getDatabaseNow(tx);
  if (!now) {
    throw Object.assign(new Error("Database time could not be verified."), {
      workflowError: "DATABASE_CLOCK_UNAVAILABLE",
    });
  }
  await tx.questionnaireBookingAssociation.update({
    where: { bookingAssociationId: association.bookingAssociationId },
    data: { status: "COMPLETED_CONSUMED", consumedAt: now },
  });
  await tx.questionnaireApproval.update({
    where: { approvalId: approval.approvalId },
    data: { status: "CONSUMED", consumedAt: now },
  });
  return approval;
};

module.exports = {
  getDatabaseNow,
  lockActiveApprovalForBooking,
  cancelAppointmentWithApproval,
  consumeApprovalForCompletedDonation,
};
