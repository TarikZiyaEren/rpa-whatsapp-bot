/**
 * SGK / MEDULA Adapter
 * Mevcut soap_adapter + medula_gateway + document_service + signature_service'i sarar.
 * Integration katmanı bu adapter üzerinden SGK ile konuşur.
 */
const BaseAdapter = require("./base");
const { resolveProviderConfig } = require("../envResolver");
const { medulaGatewayPayload } = require("../../medula_gateway/mapper");
const { sgkProvizyonIstegi } = require("../../soap_adapter/client");
const { belgeHazirla } = require("../../document_service");
const { belgeImzala } = require("../../signature_service");

class SgkAdapter extends BaseAdapter {
  get name() {
    return "SGK/MEDULA";
  }

  get supportedProviders() {
    return ["sgk"];
  }

  async execute(payload, context, log = () => {}) {
    const config = resolveProviderConfig("sgk");
    const prefix = context.toLogPrefix();

    log(`${prefix} MEDULA payload hazırlanıyor...`);

    const gatewayPayload = medulaGatewayPayload({
      hasta: payload.hasta,
      islem: payload.islem,
      doktorNotu: payload.doktorNotu,
    });

    log(`${prefix} SGK SOAP isteği gönderiliyor (${config.baseUrl})...`);

    const sgkCevap = await sgkProvizyonIstegi(gatewayPayload);

    if (!sgkCevap || !sgkCevap.basarili) {
      return {
        basarili: false,
        durum: sgkCevap?.durum || "RED",
        takipNo: sgkCevap?.takipNo || null,
        mesaj: sgkCevap?.mesaj || null,
        hataKodu: sgkCevap?.hataKodu || "BILINMEYEN_HATA",
        hataMesaji: sgkCevap?.hataMesaji || "Provizyon reddedildi.",
        belge: null,
        imza: null,
      };
    }

    log(`${prefix} SGK ONAY — belge üretiliyor...`);

    const belge = belgeHazirla({
      hasta: payload.hasta,
      islem: payload.islem,
      doktorNotu: payload.doktorNotu,
      takipNo: sgkCevap.takipNo,
    });

    const imza = belgeImzala(belge, "sistem");

    log(`${prefix} Belge imzalandı (${belge.belgeNo})`);

    return {
      basarili: true,
      durum: sgkCevap.durum,
      takipNo: sgkCevap.takipNo,
      mesaj: sgkCevap.mesaj,
      hataKodu: sgkCevap.hataKodu || null,
      hataMesaji: sgkCevap.hataMesaji || null,
      belge,
      imza,
    };
  }

  async healthCheck() {
    const config = resolveProviderConfig("sgk");
    try {
      const axios = require("axios");
      await axios.get(config.baseUrl, { timeout: 3000 });
      return { healthy: true, detail: `SGK endpoint erişilebilir: ${config.baseUrl}` };
    } catch (err) {
      return { healthy: false, detail: `SGK endpoint erişilemedi: ${err.message}` };
    }
  }
}

module.exports = SgkAdapter;
