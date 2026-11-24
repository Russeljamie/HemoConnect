const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const DEVELOPMENT_JWT_SECRET = "HemoConnect-Development-Only-JWT-Secret-Do-Not-Use-In-Production";
const nodeEnv = process.env.NODE_ENV || "development";
let jwtSecret = process.env.JWT_SECRET;

if (nodeEnv === "production") {
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters in production.");
  }
} else if (!jwtSecret) {
  jwtSecret = DEVELOPMENT_JWT_SECRET;
  console.warn("JWT_SECRET is not set; using the development-only default. Do not use this secret in production.");
}

const alertWaveRadiiKm = [
  Number(process.env.ALERT_WAVE_1_RADIUS_KM) || 5,
  Number(process.env.ALERT_WAVE_2_RADIUS_KM) || 15,
  Number(process.env.ALERT_WAVE_3_RADIUS_KM) || 30,
];

const configuredWaitingPeriod = process.env.DONATION_WAITING_PERIOD_DAYS === undefined
  ? 90
  : Number(process.env.DONATION_WAITING_PERIOD_DAYS);
if (!Number.isInteger(configuredWaitingPeriod) || configuredWaitingPeriod <= 0) {
  throw new Error("DONATION_WAITING_PERIOD_DAYS must be a positive integer.");
}

const env = {
  PORT: Number(process.env.PORT) || 5000,
  NODE_ENV: nodeEnv,
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:3000",
  ALERT_WAVE_RADII_KM: alertWaveRadiiKm,
  ALERT_WAVE_INTERVAL_MINUTES: Number(process.env.ALERT_WAVE_INTERVAL_MINUTES) || 30,
  DONATION_WAITING_PERIOD_DAYS: configuredWaitingPeriod,
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: Number(process.env.SMTP_PORT) || 0,
  SMTP_SECURE: process.env.SMTP_SECURE === "true",
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || "",
  EMAIL_FROM: process.env.EMAIL_FROM || "",
  EMAIL_WORKER_INTERVAL_MS: Number(process.env.EMAIL_WORKER_INTERVAL_MS) || 30000,
  SMS_PROVIDER: process.env.SMS_PROVIDER || "mobilesasa",
  MOBILESASA_API_TOKEN: process.env.MOBILESASA_API_TOKEN || "",
  MOBILESASA_SENDER_ID: process.env.MOBILESASA_SENDER_ID || "",
  MOBILESASA_API_URL: process.env.MOBILESASA_API_URL || "https://api.mobilesasa.com/v2/send/message",
  MOBILESASA_WEBHOOK_SECRET: process.env.MOBILESASA_WEBHOOK_SECRET || "",
  SMS_DELIVERY_REPORT_URL: process.env.SMS_DELIVERY_REPORT_URL || "",
  SMS_WORKER_INTERVAL_MS: Number(process.env.SMS_WORKER_INTERVAL_MS) || 30000,
};

module.exports = env;