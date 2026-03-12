/**
 * Adapter kayıt defteri.
 * Provider key'ine göre doğru adapter'ı bulur ve döndürür.
 */
const { resolveProviderConfig } = require("./envResolver");

const adapters = new Map();

/**
 * Bir adapter instance'ını kaydet.
 * Adapter'ın supportedProviders listesindeki her key için kayıt yapar.
 */
function registerAdapter(adapter) {
  for (const key of adapter.supportedProviders) {
    adapters.set(key, adapter);
  }
}

/**
 * Provider key'ine göre adapter döndürür.
 * @param {string} providerKey - "sgk", "allianz", "hbys" vb.
 * @returns {BaseAdapter}
 */
function getAdapter(providerKey) {
  const adapter = adapters.get(providerKey);
  if (!adapter) {
    throw new Error(`[IntegrationRegistry] '${providerKey}' için kayıtlı adapter bulunamadı.`);
  }
  return adapter;
}

/**
 * Kayıtlı tüm adapter'ları ve destekledikleri provider'ları listeler.
 */
function listAdapters() {
  const result = [];
  const seen = new Set();

  for (const [key, adapter] of adapters.entries()) {
    if (seen.has(adapter.name)) continue;
    seen.add(adapter.name);

    result.push({
      name: adapter.name,
      providers: adapter.supportedProviders,
      config: resolveProviderConfig(key),
    });
  }

  return result;
}

function hasAdapter(providerKey) {
  return adapters.has(providerKey);
}

module.exports = { registerAdapter, getAdapter, listAdapters, hasAdapter };
