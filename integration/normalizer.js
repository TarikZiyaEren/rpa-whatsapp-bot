/**
 * Tüm provider cevaplarını tek bir UnifiedResponse formatına çevirir.
 * Panel ve jobRunner bu formata güvenir, provider farkını bilmez.
 */

/**
 * @typedef {Object} UnifiedResponse
 * @property {string}  requestId      - İstek takip numarası
 * @property {string}  provider       - Provider adı (sgk, allianz, hbys vs.)
 * @property {boolean} basarili       - İşlem başarılı mı
 * @property {string}  durum          - ONAY | RED | HATA | BEKLEMEDE
 * @property {string|null} takipNo    - Provider takip numarası
 * @property {string|null} hataKodu   - Hata kodu
 * @property {string|null} hataMesaji - Hata mesajı
 * @property {string|null} mesaj      - Genel mesaj
 * @property {Object|null} belge      - Üretilen belge bilgisi
 * @property {Object|null} imza       - İmza bilgisi
 * @property {Object|null} meta       - Provider'a özel ek bilgiler
 * @property {number}  elapsedMs      - İşlem süresi (ms)
 * @property {string}  environment    - test | prod
 */

function normalizeResponse({ requestId, provider, environment, rawResponse, elapsedMs }) {
  if (!rawResponse) {
    return {
      requestId,
      provider,
      basarili: false,
      durum: "HATA",
      takipNo: null,
      hataKodu: "EMPTY_RESPONSE",
      hataMesaji: "Provider boş cevap döndü.",
      mesaj: null,
      belge: null,
      imza: null,
      meta: null,
      elapsedMs: elapsedMs || 0,
      environment,
    };
  }

  const r = rawResponse;

  // Durum tespiti: farklı provider'lar farklı alanlar kullanabilir
  let durum = r.durum || null;
  if (!durum) {
    if (r.basarili === true) durum = "ONAY";
    else if (r.basarili === false) durum = "RED";
    else durum = "HATA";
  }

  const basarili =
    r.basarili != null
      ? !!r.basarili
      : /onay/i.test(String(durum));

  return {
    requestId,
    provider,
    basarili,
    durum: String(durum).toUpperCase(),
    takipNo: r.takipNo || r.takip_no || r.trackingNo || null,
    hataKodu: r.hataKodu || r.hata_kodu || r.errorCode || null,
    hataMesaji: r.hataMesaji || r.hata_mesaji || r.errorMessage || null,
    mesaj: r.mesaj || r.message || null,
    belge: r.belge || null,
    imza: r.imza || null,
    meta: r.meta || r.ham ? { ham: r.ham } : null,
    elapsedMs: elapsedMs || 0,
    environment,
  };
}

function normalizeError({ requestId, provider, environment, error, elapsedMs }) {
  return {
    requestId,
    provider,
    basarili: false,
    durum: "HATA",
    takipNo: null,
    hataKodu: error?.code || "INTEGRATION_ERROR",
    hataMesaji: error?.message || String(error),
    mesaj: null,
    belge: null,
    imza: null,
    meta: { stack: error?.stack || null },
    elapsedMs: elapsedMs || 0,
    environment,
  };
}

module.exports = { normalizeResponse, normalizeError };
