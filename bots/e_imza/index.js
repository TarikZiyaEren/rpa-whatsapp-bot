/**
 * Elektronik İmza Katmanı
 *
 * Türkiye'de e-imza standartları:
 *   - CAdES (CMS Advanced Electronic Signatures)
 *   - PAdES (PDF Advanced Electronic Signatures)
 *   - XAdES (XML Advanced Electronic Signatures)
 *
 * Entegrasyon seçenekleri:
 *   - TÜBİTAK BİLGEM e-imza API
 *   - E-Güven API
 *   - Yerel token (akıllı kart) — node-forge ile
 *
 * Bu katman:
 *   1. Doküman hash'i üretir
 *   2. İmza talebini API'ye gönderir (veya mock imzalar)
 *   3. İmzalı dokümanı döndürür
 *   4. İmzayı doğrular
 */

const crypto = require("crypto");

// ── Konfigürasyon ─────────────────────────────────────────────────────
const EIMZA_TIP     = process.env.EIMZA_TIP     || "mock"; // mock | tubitat | eguven
const EIMZA_API_URL = process.env.EIMZA_API_URL || null;
const EIMZA_API_KEY = process.env.EIMZA_API_KEY || null;

// ── Ana Fonksiyonlar ──────────────────────────────────────────────────

/**
 * Dokümanı imzala
 * @param {object} params
 * @param {string} params.icerik       — imzalanacak metin/JSON
 * @param {string} params.imzalayanTc  — imzalayan kişinin TC'si
 * @param {string} params.imzalayanAd  — imzalayan kişinin adı
 * @param {string} params.tip          — "provizyon" | "gerekce" | "randevu" | "kvkk"
 */
async function imzala(params) {
  const { icerik, imzalayanTc, imzalayanAd, tip = "genel" } = params;

  if (!icerik) throw new Error("İmzalanacak içerik boş olamaz.");

  switch (EIMZA_TIP) {
    case "tubitat": return tubıtakImzala(params);
    case "eguven":  return eguvenImzala(params);
    case "mock":
    default:        return mockImzala(params);
  }
}

/**
 * İmzayı doğrula
 * @param {object} imzaKaydi — imzala() fonksiyonunun döndürdüğü obje
 */
async function imzaDogrula(imzaKaydi) {
  if (!imzaKaydi?.imza || !imzaKaydi?.hash) {
    return { gecerli: false, hata: "İmza kaydı eksik veya hatalı." };
  }

  switch (EIMZA_TIP) {
    case "tubitat":
    case "eguven":  return apiImzaDogrula(imzaKaydi);
    case "mock":
    default:        return mockDogrula(imzaKaydi);
  }
}

// ── Mock İmza (demo / geliştirme ortamı) ─────────────────────────────
async function mockImzala({ icerik, imzalayanTc, imzalayanAd, tip }) {
  const zaman    = new Date().toISOString();
  const hash     = crypto.createHash("sha256").update(icerik + zaman).digest("hex");
  const imzaVeri = `${imzalayanTc}:${zaman}:${hash}`;
  const imza     = crypto.createHmac("sha256", process.env.DB_ENC_KEY || "mock_secret")
                         .update(imzaVeri)
                         .digest("hex");

  return {
    basarili:      true,
    tip:           "mock",
    belgeTip:      tip,
    imzalayanTc:   imzalayanTc ? `${imzalayanTc.slice(0,3)}****${imzalayanTc.slice(-3)}` : null,
    imzalayanAd,
    zaman,
    hash,
    imza,
    sertifikaNo:   `MOCK-${Date.now()}`,
    icerikOzeti:   icerik.slice(0, 100) + (icerik.length > 100 ? "..." : ""),
  };
}

async function mockDogrula(imzaKaydi) {
  // Mock doğrulama: hash tutarlılığını kontrol et
  const beklenenHash = imzaKaydi.hash;
  if (!beklenenHash || beklenenHash.length !== 64) {
    return { gecerli: false, hata: "Hash formatı geçersiz." };
  }
  return {
    gecerli:      true,
    tip:          "mock",
    imzalayanAd:  imzaKaydi.imzalayanAd,
    zaman:        imzaKaydi.zaman,
    sertifikaNo:  imzaKaydi.sertifikaNo,
    uyari:        "Mock imza — üretim ortamında gerçek e-imza kullanılmalıdır.",
  };
}

// ── TÜBİTAK BİLGEM İmza API ──────────────────────────────────────────
async function tubıtakImzala({ icerik, imzalayanTc, imzalayanAd, tip }) {
  const axios = require("axios");

  const payload = {
    content:     Buffer.from(icerik).toString("base64"),
    signerTc:    imzalayanTc,
    signerName:  imzalayanAd,
    signType:    "CADES_BES",
    docType:     tip,
  };

  const res = await axios.post(
    `${EIMZA_API_URL}/sign`,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": EIMZA_API_KEY,
      },
      timeout: 30000,
    }
  );

  return {
    basarili:     true,
    tip:          "tubitat",
    belgeTip:     tip,
    imzalayanTc,
    imzalayanAd,
    zaman:        new Date().toISOString(),
    hash:         res.data.contentHash,
    imza:         res.data.signature,
    sertifikaNo:  res.data.certificateSerial,
    icerikOzeti:  icerik.slice(0, 100),
  };
}

// ── E-Güven API ───────────────────────────────────────────────────────
async function eguvenImzala({ icerik, imzalayanTc, imzalayanAd, tip }) {
  const axios = require("axios");

  const hash = crypto.createHash("sha256").update(icerik).digest("hex");

  const res = await axios.post(
    `${EIMZA_API_URL}/api/v1/sign`,
    {
      documentHash: hash,
      signerTC:     imzalayanTc,
      format:       "XADES",
    },
    {
      headers: {
        Authorization: `Bearer ${EIMZA_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );

  return {
    basarili:     true,
    tip:          "eguven",
    belgeTip:     tip,
    imzalayanTc,
    imzalayanAd,
    zaman:        new Date().toISOString(),
    hash,
    imza:         res.data.signatureValue,
    sertifikaNo:  res.data.serialNumber,
    icerikOzeti:  icerik.slice(0, 100),
  };
}

async function apiImzaDogrula(imzaKaydi) {
  const axios = require("axios");
  const res = await axios.post(
    `${EIMZA_API_URL}/verify`,
    { signature: imzaKaydi.imza, hash: imzaKaydi.hash },
    {
      headers: { "X-API-Key": EIMZA_API_KEY },
      timeout: 10000,
    }
  );
  return {
    gecerli:     res.data?.valid === true,
    imzalayanAd: imzaKaydi.imzalayanAd,
    zaman:       imzaKaydi.zaman,
    sertifikaNo: imzaKaydi.sertifikaNo,
  };
}

// ── Provizyon Belgesi İmzala (hazır şablon) ───────────────────────────
async function provizyonBelgesiImzala({ hasta, islem, sonuc, imzalayanTc, imzalayanAd }) {
  const icerik = JSON.stringify({
    tip:     "PROVIZYON_BELGESI",
    zaman:   new Date().toISOString(),
    hasta:   { tc: hasta.tc, ad: hasta.ad, dogum: hasta.dogum },
    islem:   { kodu: islem?.kodu, adi: islem?.adi },
    sonuc,
  });

  return imzala({
    icerik,
    imzalayanTc,
    imzalayanAd,
    tip: "provizyon",
  });
}

// ── Gerekçe Belgesi İmzala ────────────────────────────────────────────
async function gerekceBelgesiImzala({ gerekceMetni, hasta, imzalayanTc, imzalayanAd }) {
  const icerik = JSON.stringify({
    tip:          "GEREKCE_BELGESI",
    zaman:        new Date().toISOString(),
    hasta:        { tc: hasta.tc, ad: hasta.ad },
    gerekceMetni,
  });

  return imzala({
    icerik,
    imzalayanTc,
    imzalayanAd,
    tip: "gerekce",
  });
}

module.exports = {
  imzala,
  imzaDogrula,
  provizyonBelgesiImzala,
  gerekceBelgesiImzala,
};