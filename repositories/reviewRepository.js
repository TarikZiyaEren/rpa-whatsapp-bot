const { getDb, saveDb } = require("../db/core");
const { uid, mapExecRows } = require("../db/utils");

function nowIso() {
  return new Date().toISOString();
}

/**
 * Review kuyruğuna yeni kayıt ekler.
 */
async function addReviewItem(data, hospitalId) {
  const db = getDb();
  const id = uid();

  db.run(
    `INSERT INTO review_queue
      (id, hospital_id, job_id, durum, oncelik, tc, hasta_ad, hasta_dogum,
       provider, islem_kodu, islem_adi, doktor_notu,
       ai_risk, ai_seviye, aciklama_ozet, aciklama_kartlar,
       eksik_belgeler_json, kural_analizi_json, red_cozum_json, rapor_json, payload_json,
       olusturan_kullanici, olusturma_zamani)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      hospitalId || null,
      data.jobId || null,
      "beklemede",
      data.oncelik || "normal",
      data.tc,
      data.hastaAd || null,
      data.hastaDogum || null,
      data.provider || null,
      data.islemKodu || null,
      data.islemAdi || null,
      data.doktorNotu || null,
      data.aiRisk ?? null,
      data.aiSeviye || null,
      data.aciklamaOzet || null,
      data.aciklamaKartlar ? JSON.stringify(data.aciklamaKartlar) : null,
      data.eksikBelgeler ? JSON.stringify(data.eksikBelgeler) : null,
      data.kuralAnalizi ? JSON.stringify(data.kuralAnalizi) : null,
      data.redCozum ? JSON.stringify(data.redCozum) : null,
      data.rapor ? JSON.stringify(data.rapor) : null,
      data.payload ? JSON.stringify(data.payload) : null,
      data.olusturanKullanici || "sistem",
      nowIso(),
    ]
  );

  await saveDb();
  return id;
}

/**
 * Bekleyen review'ları listeler.
 */
async function listReviewItems(hospitalId, durum = null, limit = 100) {
  const db = getDb();

  let sql = `SELECT * FROM review_queue WHERE hospital_id = ?`;
  const params = [hospitalId];

  if (durum) {
    sql += ` AND durum = ?`;
    params.push(durum);
  }

  sql += ` ORDER BY
    CASE oncelik WHEN 'acil' THEN 0 WHEN 'yuksek' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
    olusturma_zamani DESC
    LIMIT ?`;
  params.push(limit);

  const result = db.exec(sql, params);
  return mapExecRows(result);
}

/**
 * Tek bir review kaydını getirir.
 */
async function getReviewItem(id) {
  const db = getDb();
  const result = db.exec(`SELECT * FROM review_queue WHERE id = ?`, [id]);
  const rows = mapExecRows(result);
  return rows[0] || null;
}

/**
 * Review kaydını günceller (onay/red/düzelt/tekrar dene).
 */
async function updateReviewItem(id, updates) {
  const db = getDb();

  db.run(
    `UPDATE review_queue SET
      durum = ?,
      islem_yapan_kullanici = ?,
      islem_zamani = ?,
      islem_notu = ?,
      islem_tipi = ?,
      sonuc = ?
     WHERE id = ?`,
    [
      updates.durum || "tamamlandi",
      updates.kullanici || null,
      nowIso(),
      updates.not || null,
      updates.islemTipi || null,
      updates.sonuc || null,
      id,
    ]
  );

  await saveDb();
}

/**
 * İstatistik: bekleyen, tamamlanan, toplam.
 */
async function getReviewStats(hospitalId) {
  const db = getDb();

  const result = db.exec(
    `SELECT
       COUNT(*) as toplam,
       SUM(CASE WHEN durum='beklemede' THEN 1 ELSE 0 END) as bekleyen,
       SUM(CASE WHEN durum='tamamlandi' THEN 1 ELSE 0 END) as tamamlanan,
       SUM(CASE WHEN durum='reddedildi' THEN 1 ELSE 0 END) as reddedilen,
       SUM(CASE WHEN durum='tekrar_dene' THEN 1 ELSE 0 END) as tekrar_denen
     FROM review_queue WHERE hospital_id = ?`,
    [hospitalId]
  );

  const rows = mapExecRows(result);
  return rows[0] || { toplam: 0, bekleyen: 0, tamamlanan: 0, reddedilen: 0, tekrar_denen: 0 };
}

module.exports = {
  addReviewItem,
  listReviewItems,
  getReviewItem,
  updateReviewItem,
  getReviewStats,
};
