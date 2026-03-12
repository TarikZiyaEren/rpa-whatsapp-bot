/**
 * Integration katmanı audit logger.
 * Her integration isteğini, cevabını ve hata durumlarını loglar.
 * Mevcut audit_bus ile uyumlu çalışır.
 */
const { auditEvent } = require("../audit_bus");

function auditIntegration(log, context, eventType, detail = {}) {
  const enriched = {
    requestId: context.requestId,
    provider: context.provider,
    hospitalId: context.hospitalId,
    environment: context.environment,
    elapsedMs: context.elapsed(),
    ...detail,
  };

  return auditEvent(log, `INTEGRATION_${eventType}`, enriched);
}

/** İstek başlangıcı */
function auditRequestStart(log, context, payload) {
  return auditIntegration(log, context, "REQUEST_START", {
    tc: payload?.hasta?.tc,
    islemKodu: payload?.islem?.kodu,
  });
}

/** Provider'dan cevap alındı */
function auditResponseReceived(log, context, response) {
  return auditIntegration(log, context, "RESPONSE_RECEIVED", {
    basarili: response?.basarili,
    durum: response?.durum,
    takipNo: response?.takipNo,
    hataKodu: response?.hataKodu,
  });
}

/** Retry denemesi */
function auditRetryAttempt(log, context, attempt, maxRetries) {
  return auditIntegration(log, context, "RETRY_ATTEMPT", {
    attempt,
    maxRetries,
  });
}

/** Timeout oluştu */
function auditTimeout(log, context) {
  return auditIntegration(log, context, "TIMEOUT", {
    timeoutMs: context.timeout,
    elapsedMs: context.elapsed(),
  });
}

/** Hata oluştu */
function auditError(log, context, error) {
  return auditIntegration(log, context, "ERROR", {
    errorCode: error?.code || null,
    errorMessage: error?.message || String(error),
  });
}

module.exports = {
  auditRequestStart,
  auditResponseReceived,
  auditRetryAttempt,
  auditTimeout,
  auditError,
};
