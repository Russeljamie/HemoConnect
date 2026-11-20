const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const alertWaveRadiiKm = [
  Number(process.env.ALERT_WAVE_1_RADIUS_KM) || 5,
  Number(process.env.ALERT_WAVE_2_RADIUS_KM) || 15,
  Number(process.env.ALERT_WAVE_3_RADIUS_KM) || 30,
];

const env = {
  PORT: Number(process.env.PORT) || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET: process.env.JWT_SECRET || "development_secret",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:3000",
  ALERT_WAVE_RADII_KM: alertWaveRadiiKm,
  ALERT_WAVE_INTERVAL_MINUTES: Number(process.env.ALERT_WAVE_INTERVAL_MINUTES) || 30,
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: Number(process.env.SMTP_PORT) || 0,
  SMTP_SECURE: process.env.SMTP_SECURE === "true",
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || "",
  EMAIL_FROM: process.env.EMAIL_FROM || "",
  EMAIL_WORKER_INTERVAL_MS: Number(process.env.EMAIL_WORKER_INTERVAL_MS) || 30000,
};

module.exports = env;