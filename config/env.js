require("dotenv").config();
const path = require("path");

function required(name, minLength = 1) {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(`${name} zorunludur (min ${minLength} karakter).`);
  }
  return value;
}

function optional(name, fallback = "") {
  return process.env[name] ?? fallback;
}

function numberValue(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;

  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`${name} sayi olmali.`);
  }
  return parsed;
}

const env = {

  PORT: numberValue("PORT", 3000),
  NODE_ENV: optional("NODE_ENV", "development"),

  SESSION_SECRET: required("SESSION_SECRET", 32),

  DB_PATH: optional("DB_PATH", path.join(process.cwd(), "rpa.db")),
  DB_ENC_KEY: required("DB_ENC_KEY", 32),
  ADMIN_PASS: required("ADMIN_PASS", 10),

  WA_APP_SECRET: optional("WA_APP_SECRET"),
  WA_VERIFY_TOKEN: optional("WA_VERIFY_TOKEN"),

  AI_BLOCK_THRESHOLD: numberValue("AI_BLOCK_THRESHOLD", 0.7),
  AUTO_RETRY_ENABLED: optional("AUTO_RETRY_ENABLED", "true"),

  MIN_WORKERS: numberValue("MIN_WORKERS", 1),
  MAX_WORKERS: numberValue("MAX_WORKERS", 6),
  SCALE_UP_QUEUE_THRESHOLD: numberValue("SCALE_UP_QUEUE_THRESHOLD", 3),
  SCALE_DOWN_QUEUE_THRESHOLD: numberValue("SCALE_DOWN_QUEUE_THRESHOLD", 1),

  /* -------------------- REDIS -------------------- */

  REDIS_HOST: optional("REDIS_HOST", "127.0.0.1"),
  REDIS_PORT: numberValue("REDIS_PORT", 6379),
  REDIS_PASSWORD: optional("REDIS_PASSWORD", ""),
  REDIS_DB: numberValue("REDIS_DB", 0),

  /* -------------------- INTEGRATION -------------------- */

  INTEGRATION_MAX_RETRIES: numberValue("INTEGRATION_MAX_RETRIES", 2),
  INTEGRATION_TIMEOUT: numberValue("INTEGRATION_TIMEOUT", 15000),
  SGK_PROD_BASE_URL: optional("SGK_PROD_BASE_URL", ""),
  HBYS_PROD_URL: optional("HBYS_PROD_URL", ""),
  FHIR_PROD_URL: optional("FHIR_PROD_URL", ""),

};

module.exports = env;