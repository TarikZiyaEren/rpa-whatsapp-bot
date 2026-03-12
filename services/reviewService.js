/**
 * Review Desk Servisi
 *
 * Yüksek riskli işlemleri review kuyruğuna alır.
 * Kullanıcı onaylayınca provizyon gönderir.
 * Tüm aksiyonlar audit log'a düşer.
 */
const {
  addReviewItem,
  getReviewItem,
  updateReviewItem,
  listReviewItems,
  getReviewStats,
} = require("../repositories/reviewRepository");
const { integrationProvizyonAl } = require("../integration");
const { addHistory } = require("../db");
const { audit } = require("./auditService");

/**
 * AI raporu ve payload'dan review kuyruğuna kayıt oluşturur.
 * jobRunner'dan çağrılır.
 */
async function reviewKuyrugunaAl({ jobId, payload, rapor, hospitalId, kullanici }) {
  const oncelik =
    (rapor?.finalRisk ?? 0) >= 0.7 ? "yuksek" :
    (rapor?.finalRisk ?? 0) >= 0.5 ? "normal" :
    "normal";

  const id = await addReviewItem(
    {
      jobId,
      oncelik,
      tc: payload.hasta?.tc,
      hastaAd: payload.hasta?.ad,
      hastaDogum: payload.hasta?.dogum,
      provider: payload.provider,
      islemKodu: payload.islem?.kodu,
      islemAdi: payload.islem?.adi,
      doktorNotu: payload.doktorNotu || "",
      aiRisk: rapor?.finalRisk ?? null,
      aiSeviye: rapor?.seviye || null,
      aciklamaOzet: rapor?.aciklama?.ozet || null,
      aciklamaKartlar: rapor?.aciklama?.kartlar || null,
      eksikBelgeler: rapor?.eksikBelgeler || [],
      kuralAnalizi: rapor?.kuralMotoru || null,
      rapor,
      payload,
      olusturanKullanici: kullanici || "sistem",
    },
    hospitalId
  );

  return { reviewId: id, oncelik };
}

/**
 * Operatör review kaydını onaylar → provizyon gönderilir.
 */
async function reviewOnayla(reviewId, kullanici, not, req) {
  const item = await getReviewItem(reviewId);
  if (!item) throw new Error("Review kaydı bulunamadı.");
  if (item.durum !== "beklemede") throw new Error(`Bu kayıt zaten işlenmiş: ${item.durum}`);

  let payload;
  try {
    payload = JSON.parse(item.payload_json);
  } catch {
    throw new Error("Kayıt payload'ı okunamadı.");
  }

  // Provizyon gönder
  const sonuc = await integrationProvizyonAl(
    {
      hasta: payload.hasta,
      islem: payload.islem,
      doktorNotu: payload.doktorNotu || item.doktor_notu,
      hospitalId: item.hospital_id,
      provider: item.provider || "sgk",
      credentials: payload.credentials || null,
    },
    () => {} // Log'u sessiz geç — review sonucu audit'te
  );

  const sonucStr = `${sonuc.durum} | TakipNo: ${sonuc.takipNo || "-"}`;

  await updateReviewItem(reviewId, {
    durum: "tamamlandi",
    kullanici,
    not: not || "Operatör tarafından onaylandı.",
    islemTipi: "onayla",
    sonuc: sonucStr,
  });

  // Audit log
  if (req) {
    audit(req, "REVIEW_ONAYLA", `ReviewID: ${reviewId} | TC: ${item.tc} | Sonuç: ${sonucStr}`);
  }

  return { reviewId, sonuc: sonucStr, provizyon: sonuc };
}

/**
 * Operatör review kaydını reddeder → provizyon gönderilmez.
 */
async function reviewReddet(reviewId, kullanici, not, req) {
  const item = await getReviewItem(reviewId);
  if (!item) throw new Error("Review kaydı bulunamadı.");
  if (item.durum !== "beklemede") throw new Error(`Bu kayıt zaten işlenmiş: ${item.durum}`);

  await updateReviewItem(reviewId, {
    durum: "reddedildi",
    kullanici,
    not: not || "Operatör tarafından reddedildi.",
    islemTipi: "reddet",
    sonuc: "OPERATÖR RED",
  });

  if (req) {
    audit(req, "REVIEW_REDDET", `ReviewID: ${reviewId} | TC: ${item.tc} | Not: ${not || "-"}`);
  }

  return { reviewId, sonuc: "OPERATÖR RED" };
}

/**
 * Operatör düzeltme yapıp tekrar dener.
 */
async function reviewTekrarDene(reviewId, kullanici, duzeltmeler, not, req) {
  const item = await getReviewItem(reviewId);
  if (!item) throw new Error("Review kaydı bulunamadı.");
  if (item.durum !== "beklemede") throw new Error(`Bu kayıt zaten işlenmiş: ${item.durum}`);

  let payload;
  try {
    payload = JSON.parse(item.payload_json);
  } catch {
    throw new Error("Kayıt payload'ı okunamadı.");
  }

  // Düzeltmeleri uygula
  if (duzeltmeler.doktorNotu) {
    payload.doktorNotu = duzeltmeler.doktorNotu;
  }
  if (duzeltmeler.islemKodu) {
    payload.islem = {
      kodu: duzeltmeler.islemKodu,
      adi: duzeltmeler.islemAdi || payload.islem?.adi,
    };
  }

  const sonuc = await integrationProvizyonAl(
    {
      hasta: payload.hasta,
      islem: payload.islem,
      doktorNotu: payload.doktorNotu,
      hospitalId: item.hospital_id,
      provider: item.provider || "sgk",
      credentials: payload.credentials || null,
    },
    () => {}
  );

  const sonucStr = `${sonuc.durum} | TakipNo: ${sonuc.takipNo || "-"} (DÜZELTME)`;

  await updateReviewItem(reviewId, {
    durum: "tekrar_dene",
    kullanici,
    not: not || "Düzeltme yapılarak tekrar denendi.",
    islemTipi: "tekrar_dene",
    sonuc: sonucStr,
  });

  if (req) {
    audit(
      req,
      "REVIEW_TEKRAR_DENE",
      `ReviewID: ${reviewId} | TC: ${item.tc} | Düzeltme: ${JSON.stringify(duzeltmeler)} | Sonuç: ${sonucStr}`
    );
  }

  return { reviewId, sonuc: sonucStr, provizyon: sonuc };
}

module.exports = {
  reviewKuyrugunaAl,
  reviewOnayla,
  reviewReddet,
  reviewTekrarDene,
  listReviewItems,
  getReviewItem,
  getReviewStats,
};
