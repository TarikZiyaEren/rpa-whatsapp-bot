/**
 * Merkezi retry yöneticisi.
 * Exponential backoff + yapılandırılabilir retry sayısı.
 * Captcha/2FA gibi insan müdahalesi gereken hatalarda retry yapmaz.
 */

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY = 1000; // ms
const DEFAULT_MAX_DELAY = 10000; // ms

/**
 * @param {Function} fn         - Çalıştırılacak async fonksiyon
 * @param {Object}   opts
 * @param {number}   opts.maxRetries   - Maks deneme sayısı (ilk deneme hariç)
 * @param {number}   opts.baseDelay    - İlk bekleme süresi (ms)
 * @param {number}   opts.maxDelay     - Maks bekleme süresi (ms)
 * @param {Function} opts.onRetry      - Her retry'da çağrılacak callback(attempt, error)
 * @param {Function} opts.shouldRetry  - Hata retry edilmeli mi? (error) => boolean
 * @returns {*} fn()'nin dönüş değeri
 */
async function withRetry(fn, opts = {}) {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelay = opts.baseDelay ?? DEFAULT_BASE_DELAY;
  const maxDelay = opts.maxDelay ?? DEFAULT_MAX_DELAY;
  const onRetry = opts.onRetry || (() => {});
  const shouldRetry = opts.shouldRetry || defaultShouldRetry;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      if (attempt >= maxRetries) break;
      if (!shouldRetry(err)) break;

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      onRetry(attempt + 1, err, delay);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * İnsan müdahalesi gereken hatalarda retry yapma.
 * Timeout hatalarında retry yap.
 */
function defaultShouldRetry(err) {
  // İnsan müdahalesi gerekiyorsa retry yapma
  if (err.needsHuman) return false;

  // MISSING_CREDENTIALS gibi kalıcı hatalarda retry yapma
  if (err.code === "MISSING_CREDENTIALS") return false;

  // Captcha/2FA tespit edildiyse retry yapma
  if (/captcha|recaptcha|2fa|otp/i.test(err.message)) return false;

  return true;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { withRetry, defaultShouldRetry };
