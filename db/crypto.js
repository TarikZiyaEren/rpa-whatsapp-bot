const crypto = require("crypto");
const env = require("../config/env");

const ENC_KEY = Buffer.from(env.DB_ENC_KEY.slice(0, 32), "utf8");

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function decrypt(str) {
  const [ivHex, tagHex, encHex] = str.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    ENC_KEY,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  return decipher.update(Buffer.from(encHex, "hex")) + decipher.final("utf8");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 100_000, 64, "sha512")
    .toString("hex");

  return `pbkdf2:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored.startsWith("pbkdf2:")) {
    const legacyHash = crypto.createHash("sha256").update(password).digest("hex");
    return legacyHash === stored;
  }

  const [, salt, hash] = stored.split(":");
  const check = crypto
    .pbkdf2Sync(password, salt, 100_000, 64, "sha512")
    .toString("hex");

  return check === hash;
}

module.exports = {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
};