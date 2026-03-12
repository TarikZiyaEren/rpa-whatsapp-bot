const crypto = require("crypto");
const env = require("../config/env");

function verifyMetaSignature(req) {
  const appSecret = env.WA_APP_SECRET;
  const header = req.get("x-hub-signature-256") || "";

  if (!appSecret || !req.rawBody || !header.startsWith("sha256=")) {
    return false;
  }

  const incoming = header.slice(7);
  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(req.rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(incoming, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

module.exports = { verifyMetaSignature };