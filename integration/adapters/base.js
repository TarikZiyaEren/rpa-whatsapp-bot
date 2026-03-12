/**
 * Tüm integration adapter'larının temel sınıfı.
 * Her adapter bu sınıfı extend eder ve execute() metodunu implement eder.
 */
class BaseAdapter {
  constructor(config = {}) {
    this.config = config;
  }

  /** Adapter adı — alt sınıf override etmeli */
  get name() {
    throw new Error("Adapter name tanımlanmamış");
  }

  /** Desteklenen provider key'leri (örn: ["sgk"] veya ["allianz","axa"]) */
  get supportedProviders() {
    throw new Error("supportedProviders tanımlanmamış");
  }

  /**
   * Ana çalıştırma metodu. Alt sınıflar bunu implement eder.
   * @param {Object} payload  - Normalize edilmiş istek verisi
   * @param {Object} context  - requestContext (requestId, timeout, env vb.)
   * @param {Function} log    - Log callback
   * @returns {Object} Raw provider cevabı (normalizer'a girmeden önce)
   */
  async execute(payload, context, log) {
    throw new Error(`${this.name}: execute() implement edilmemiş`);
  }

  /**
   * Adapter sağlık kontrolü — opsiyonel, alt sınıf override edebilir.
   * @returns {{ healthy: boolean, detail: string }}
   */
  async healthCheck() {
    return { healthy: true, detail: "Default health check — override edilmedi" };
  }
}

module.exports = BaseAdapter;
