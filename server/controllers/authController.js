
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const prisma = require("../services/prisma");
const env = require("../config/env");
const { enqueueEmail, isEmailConfigured } = require("../services/email");
const { notifyUser } = require("../services/notificationDelivery");
const { isActiveKnbtsCentre } = require("../utils/institution");

const register = async (req, res, next) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      role,
      bloodType,
      birthDate,
      gender,
      address,
    } = req.body;

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedPhone = phone.trim();

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          email: normalizedEmail,
          phone: normalizedPhone,
          password: hashedPassword,
          role,
          status: "ACTIVE",
        },
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

      if (role === "DONOR") {
        await tx.donor.create({
          data: {
            firstName: normalizedFirstName,
            lastName: normalizedLastName,
            userId: newUser.userId,
            bloodType,
            birthDate: new Date(`${birthDate}T00:00:00.000Z`),
            gender,
            address: address.trim(),
          },
        });
      } else {
        throw new Error("Unsupported public registration role");
      }

      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_REGISTERED",
          entityType: "User",
          entityId: String(newUser.userId),
          actorUserId: newUser.userId,
          details: { role: newUser.role },
        },
      });
      await notifyUser(tx, {
        userId: newUser.userId,
        email: newUser.email,
        phone: newUser.phone,
        eventKey: `account-${newUser.userId}-registered`,
        type: "ACCOUNT_REGISTERED",
        title: "Welcome to HemoConnect",
        message: "Your donor account is ready. Welcome to HemoConnect.",
        emailTemplate: "WELCOME",
        emailPayload: {
          name: `${newUser.firstName} ${newUser.lastName}`,
          role: "donor",
        },
      });
      return newUser;
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: user,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists",
      });
    }

    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (user.role === "PATIENT") {
      return res.status(403).json({
        success: false,
        message: "Patient accounts are no longer supported",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Your account is not active",
      });
    }

    if (user.role === "KNBTS_STAFF") {
      const staffProfile = await prisma.knbtsStaff.findUnique({
        where: { userId: user.userId },
        select: {
          centre: {
            select: { institutionType: true, isActive: true },
          },
        },
      });

      if (!staffProfile || !isActiveKnbtsCentre(staffProfile.centre)) {
        return res.status(403).json({
          success: false,
          message: "KNBTS staff must be linked to an active KNBTS centre.",
        });
      }
    }

    const token = jwt.sign(
      {
        userId: user.userId,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      env.JWT_SECRET,
      {
        expiresIn: env.JWT_EXPIRES_IN,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: {
          userId: user.userId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
          mustChangePassword: user.mustChangePassword,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        password: true,
      },
    });

    if (!user || user.status !== "ACTIVE") {
      return res.status(403).json({ success: false, message: "This account is not active." });
    }

    const passwordMatches = await bcrypt.compare(req.body.currentPassword, user.password);
    if (!passwordMatches) {
      return res.status(400).json({ success: false, message: "Current password is incorrect." });
    }

    if (req.body.currentPassword === req.body.newPassword) {
      return res.status(400).json({ success: false, message: "Choose a new password different from the temporary password." });
    }

    const hashedPassword = await bcrypt.hash(req.body.newPassword, 12);
    const updatedUser = await prisma.$transaction(async (tx) => {
      const savedUser = await tx.user.update({
        where: { userId: user.userId },
        data: { password: hashedPassword, mustChangePassword: false },
        select: {
          userId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          mustChangePassword: true,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_PASSWORD_CHANGED",
          entityType: "User",
          entityId: String(user.userId),
          actorUserId: user.userId,
        },
      });
      await enqueueEmail(tx, user.email, "PASSWORD_CHANGED", {
        name: `${user.firstName} ${user.lastName}`,
      });
      return savedUser;
    });

    const token = jwt.sign(
      { userId: updatedUser.userId, role: updatedUser.role, mustChangePassword: false },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      success: true,
      message: "Password changed successfully.",
      data: { token, user: updatedUser },
    });
  } catch (error) {
    next(error);
  }
};

const requestPasswordReset = async (req, res, next) => {
  try {
    if (!isEmailConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Password reset email is not configured. Please contact an administrator.",
      });
    }

    const email = req.body.email.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { email, status: "ACTIVE" },
      select: { userId: true, firstName: true, lastName: true, email: true },
    });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const resetUrl = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
      await prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.updateMany({
          where: { userId: user.userId, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.passwordResetToken.create({
          data: { userId: user.userId, tokenHash, expiresAt },
        });
        await enqueueEmail(tx, user.email, "PASSWORD_RESET", {
          name: `${user.firstName} ${user.lastName}`,
          resetUrl,
          expiresInMinutes: 30,
        });
        await tx.auditLog.create({
          data: {
            action: "PASSWORD_RESET_REQUESTED",
            entityType: "User",
            entityId: String(user.userId),
            actorUserId: user.userId,
          },
        });
      });
    }

    return res.status(200).json({
      success: true,
      message: "If an active account exists for that email, password reset instructions will be sent.",
    });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const tokenHash = crypto.createHash("sha256").update(req.body.token).digest("hex");
    const now = new Date();
    const token = await prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      include: { user: { select: { userId: true, firstName: true, lastName: true, email: true, status: true } } },
    });

    if (!token || token.user.status !== "ACTIVE") {
      return res.status(400).json({
        success: false,
        message: "This password reset link is invalid or has expired. Request a new one.",
      });
    }

    const hashedPassword = await bcrypt.hash(req.body.newPassword, 12);
    const resetResult = await prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { tokenId: token.tokenId, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (!claimed.count) return false;

      await tx.user.update({
        where: { userId: token.userId },
        data: { password: hashedPassword, mustChangePassword: false },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: token.userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_PASSWORD_RESET",
          entityType: "User",
          entityId: String(token.userId),
          actorUserId: token.userId,
        },
      });
      await enqueueEmail(tx, token.user.email, "PASSWORD_CHANGED", {
        name: `${token.user.firstName} ${token.user.lastName}`,
      });
      return true;
    });

    if (!resetResult) {
      return res.status(400).json({
        success: false,
        message: "This password reset link is invalid or has expired. Request a new one.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. You can now sign in with your new password.",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  changePassword,
  requestPasswordReset,
  resetPassword,
};
