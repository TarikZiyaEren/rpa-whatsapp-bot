/**
 * Integration Katmanı — Ana Giriş Noktası
 *
 * Bu modül import edildiğinde tüm adapter'lar otomatik kayıt olur.
 * Dışarıya sendRequest, provizyonAl ve yardımcı fonksiyonları verir.
 */
const { registerAdapter, getAdapter, listAdapters, hasAdapter } = require("./adapterRegistry");
const { sendRequest, provizyonAl } = require("./integrationService");
const { resolveEnvironment, resolveProviderConfig } = require("./envResolver");
const { createRequestContext } = require("./requestContext");

// --- Adapter'ları kaydet ---
const SgkAdapter = require("./adapters/sgk");
const OzelSigortaAdapter = require("./adapters/ozelSigorta");
const HbysAdapter = require("./adapters/hbys");

registerAdapter(new SgkAdapter());
registerAdapter(new OzelSigortaAdapter());
registerAdapter(new HbysAdapter());

// --- Uyumluluk wrapper'ı ---
/**
 * Mevcut jobRunner.js'in kullandığı medulaGatewayProvizyonAl ile bire-bir uyumlu.
 * provider parametresi eklendi: default olarak "sgk" kullanır.
 */
async function integrationProvizyonAl({ hasta, islem, doktorNotu, hospitalId, provider, credentials }, log = () => {}) {
  return provizyonAl(
    {
      provider: provider || "sgk",
      payload: { hasta, islem, doktorNotu, credentials },
      hospitalId,
    },
    log
  );
}

/**
 * Tüm adapter'ların sağlık durumunu kontrol eder.
 */
async function healthCheckAll() {
  const adapters = listAdapters();
  const results = [];

  for (const entry of adapters) {
    try {
      const adapter = getAdapter(entry.providers[0]);
      const health = await adapter.healthCheck();
      results.push({ adapter: entry.name, ...health });
    } catch (err) {
      results.push({ adapter: entry.name, healthy: false, detail: err.message });
    }
  }

  return results;
}

module.exports = {
  // Ana API
  sendRequest,
  provizyonAl,
  integrationProvizyonAl,

  // Yardımcılar
  resolveEnvironment,
  resolveProviderConfig,
  createRequestContext,
  listAdapters,
  hasAdapter,
  healthCheckAll,

  // İleri düzey: kendi adapter'ını eklemek isteyenler için
  registerAdapter,
};
