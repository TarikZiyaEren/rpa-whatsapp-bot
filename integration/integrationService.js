/**
 * Ana Entegrasyon Servisi
 *
 * Panel ve jobRunner bu servise konuşur, doğrudan provider'a değil.
 * Bu servis:
 *  - Provider'a göre doğru adapter'ı seçer
 *  - Request ID ile her isteği izler
 *  - Timeout yönetimi yapar
 *  - Merkezi retry uygular
 *  - Her adımda audit log tutar
 *  - Sonucu UnifiedResponse formatında döndürür
 */
const { createRequestContext } = require("./requestContext");
const { resolveEnvironment, resolveProviderConfig } = require("./envResolver");
const { getAdapter, hasAdapter } = require("./adapterRegistry");
const { normalizeResponse, normalizeError } = require("./normalizer");
const { withRetry } = require("./retryManager");
const {
  auditRequestStart,
  auditResponseReceived,
  auditRetryAttempt,
  auditTimeout,
  auditError,
} = require("./auditLogger");

/**
 * Provizyon isteği gönderir — tüm provider'lar için tek giriş noktası.
 *
 * @param {Object}   opts
 * @param {string}   opts.provider     - "sgk", "allianz", "axa", "hbys" vb.
 * @param {Object}   opts.payload      - { hasta, islem, doktorNotu, credentials?, ... }
 * @param {string}   opts.hospitalId   - Hastane ID
 * @param {string}   opts.userId       - Kullanıcı ID
 * @param {number}   opts.timeout      - Timeout (ms), opsiyonel
 * @param {number}   opts.maxRetries   - Retry sayısı, opsiyonel (default: 2)
 * @param {Function} opts.log          - Log callback, opsiyonel
 * @returns {UnifiedResponse}
 */
async function sendRequest(opts) {
  const {
    provider,
    payload,
    hospitalId,
    userId,
    timeout,
    maxRetries,
    log = () => {},
  } = opts;

  const env = resolveEnvironment();
  const providerConfig = resolveProviderConfig(provider);

  const context = createRequestContext({
    provider,
    hospitalId,
    userId,
    timeout: timeout || providerConfig.timeout || 15000,
    environment: env,
  });

  const prefix = context.toLogPrefix();

  // Adapter var mı kontrol et
  if (!hasAdapter(provider)) {
    const errMsg = `'${provider}' için entegrasyon adapter'ı bulunamadı.`;
    log(`${prefix} ${errMsg}`);
    return normalizeError({
      requestId: context.requestId,
      provider,
      environment: env,
      error: Object.assign(new Error(errMsg), { code: "NO_ADAPTER" }),
      elapsedMs: context.elapsed(),
    });
  }

  const adapter = getAdapter(provider);

  // Audit: istek başlıyor
  auditRequestStart(log, context, payload);

  log(`${prefix} [${env.toUpperCase()}] İstek başlatılıyor — adapter: ${adapter.name}`);

  try {
    const rawResponse = await withRetry(
      async (attempt) => {
        if (attempt > 0) {
          auditRetryAttempt(log, context, attempt, maxRetries || 2);
          log(`${prefix} Retry #${attempt} başlatılıyor...`);
        }

        // Timeout kontrolü
        if (context.isTimedOut()) {
          auditTimeout(log, context);
          throw Object.assign(
            new Error(`İstek zaman aşımına uğradı (${context.timeout}ms)`),
            { code: "INTEGRATION_TIMEOUT" }
          );
        }

        // Adapter'ı çalıştır
        return await executeWithTimeout(
          () => adapter.execute(payload, context, log),
          context.timeout - context.elapsed()
        );
      },
      {
        maxRetries: maxRetries ?? 2,
        baseDelay: 1000,
        maxDelay: 8000,
        onRetry: (attempt, err, delay) => {
          log(`${prefix} Hata: ${err.message} — ${delay}ms sonra retry (#${attempt})`);
        },
      }
    );

    // Audit: cevap alındı
    auditResponseReceived(log, context, rawResponse);

    const unified = normalizeResponse({
      requestId: context.requestId,
      provider,
      environment: env,
      rawResponse,
      elapsedMs: context.elapsed(),
    });

    log(`${prefix} Sonuç: ${unified.durum} (${unified.elapsedMs}ms)`);

    return unified;
  } catch (err) {
    auditError(log, context, err);
    log(`${prefix} HATA: ${err.message}`);

    const errorResponse = normalizeError({
      requestId: context.requestId,
      provider,
      environment: env,
      error: err,
      elapsedMs: context.elapsed(),
    });

    // needsHuman bilgisini koru
    if (err.needsHuman) {
      errorResponse.needsHuman = true;
    }

    return errorResponse;
  }
}

/**
 * Timeout ile adapter çalıştırma.
 */
function executeWithTimeout(fn, timeoutMs) {
  if (timeoutMs <= 0) {
    return Promise.reject(
      Object.assign(new Error("Timeout süresi doldu"), { code: "INTEGRATION_TIMEOUT" })
    );
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        Object.assign(new Error(`Adapter ${timeoutMs}ms içinde cevap vermedi`), {
          code: "ADAPTER_TIMEOUT",
        })
      );
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Mevcut medulaGatewayProvizyonAl ile uyumlu wrapper.
 * jobRunner.js geçiş sürecinde bunu kullanabilir.
 */
async function provizyonAl(opts, log = () => {}) {
  const result = await sendRequest({ ...opts, log });

  // Eski format uyumluluğu: jobRunner basarili, durum, takipNo, hataKodu, hataMesaji bekliyor
  return {
    basarili: result.basarili,
    durum: result.durum,
    takipNo: result.takipNo,
    mesaj: result.mesaj,
    hataKodu: result.hataKodu,
    hataMesaji: result.hataMesaji,
    belge: result.belge,
    imza: result.imza,
    // Ek bilgiler
    requestId: result.requestId,
    environment: result.environment,
    elapsedMs: result.elapsedMs,
    meta: result.meta,
    needsHuman: result.needsHuman || false,
  };
}

module.exports = { sendRequest, provizyonAl };
