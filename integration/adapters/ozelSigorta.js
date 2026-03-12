/**
 * Özel Sigorta Adapter
 * Allianz, AXA, Mapfre, Anadolu, Türkiye Sigorta gibi browser-based provider'ları sarar.
 * Mevcut providers/ altındaki Playwright provider'larını kullanır.
 */
const BaseAdapter = require("./base");
const { resolveProviderConfig } = require("../envResolver");
const { getProvider } = require("../../providers");

const OZEL_PROVIDERS = ["allianz", "axa", "mapfre", "anadolu", "turkiye_sigorta"];

class OzelSigortaAdapter extends BaseAdapter {
  get name() {
    return "OzelSigorta";
  }

  get supportedProviders() {
    return OZEL_PROVIDERS;
  }

  async execute(payload, context, log = () => {}) {
    const providerKey = context.provider;
    const config = resolveProviderConfig(providerKey);
    const prefix = context.toLogPrefix();

    if (!payload.credentials) {
      throw Object.assign(
        new Error(`${providerKey} için credential bilgisi eksik.`),
        { code: "MISSING_CREDENTIALS" }
      );
    }

    log(`${prefix} Browser provider başlatılıyor (${providerKey})...`);

    const provider = getProvider(providerKey, {
      username: payload.credentials.username,
      password: payload.credentials.password,
      headless: config.headless !== false,
      ...(payload.credentials.sube_kodu && { sube_kodu: payload.credentials.sube_kodu }),
      ...(payload.credentials.kurum_kodu && { kurum_kodu: payload.credentials.kurum_kodu }),
      ...(payload.credentials.acente_kodu && { acente_kodu: payload.credentials.acente_kodu }),
    });

    const rawResult = await provider.run(payload, (msg) => {
      log(`${prefix} ${msg}`);
    });

    log(`${prefix} Browser provider tamamlandı: ${rawResult?.durum || "?"}`);

    // Browser provider'dan gelen sonucu normalize edilebilir formata çevir
    const durum = String(rawResult?.durum || "").toUpperCase();
    const basarili = durum === "ONAY";

    return {
      basarili,
      durum,
      takipNo: rawResult?.takipNo || null,
      mesaj: rawResult?.ham || null,
      hataKodu: basarili ? null : "PROVIDER_RED",
      hataMesaji: basarili ? null : rawResult?.ham || "Provizyon reddedildi.",
      meta: {
        ham: rawResult?.ham || null,
        provider: rawResult?.provider || providerKey,
        islem: rawResult?.islem || null,
      },
    };
  }
}

module.exports = OzelSigortaAdapter;
