/**
 * Her integration isteği için benzersiz context oluşturur.
 * Request ID, timeout, metadata, zamanlama bilgileri burada yönetilir.
 */
const crypto = require("crypto");

function createRequestContext(opts = {}) {
  const requestId = opts.requestId || `req_${crypto.randomBytes(8).toString("hex")}`;
  const startedAt = Date.now();

  return {
    requestId,
    startedAt,
    provider: opts.provider || null,
    hospitalId: opts.hospitalId || null,
    userId: opts.userId || null,
    timeout: opts.timeout || 15000,
    environment: opts.environment || "test",

    /** Geçen süreyi ms olarak döndürür */
    elapsed() {
      return Date.now() - startedAt;
    },

    /** Timeout aşıldı mı? */
    isTimedOut() {
      return this.elapsed() > this.timeout;
    },

    /** Loglarda kullanılacak özet */
    toLogPrefix() {
      return `[${requestId}][${this.provider || "?"}]`;
    },
  };
}

module.exports = { createRequestContext };
