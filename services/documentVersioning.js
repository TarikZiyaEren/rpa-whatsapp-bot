/**
 * Belge Versiyonlama Servisi
 *
 * Oluşturulan belgelerin her versiyonunu saklar.
 * Hash ile değişiklik tespiti, versiyon geçmişi, son versiyon sorgulama.
 */

const crypto = require("crypto");
const { getDb, saveDb } = require("../db/core");
const { mapExecRows, uid } = require("../db/utils");

// ── Tablo Oluşturma ─────────────────────────────────────────────────

async function ensureVersionTable() {
  const db = await getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      hospital_id TEXT NOT NULL,
      belge_no TEXT NOT NULL,
      versiyon INTEGER NOT NULL DEFAULT 1,
      belge_tipi TEXT,
      icerik_hash TEXT NOT NULL,
      icerik_json TEXT,
      olusturan_kullanici TEXT,
      olusturma_zamani TEXT NOT NULL,
      degisiklik_notu TEXT,
      meta_json TEXT
    );
  `);
}

// ── Yardımcılar ─────────────────────────────────────────────────────

function hashContent(content) {
  const data =
    typeof content === "string" ? content : JSON.stringify(content || "");
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function normalizeHospitalId(value) {
  if (value === null || value === undefined) return null;
  const n = String(value).trim();
  return n || null;
}

// ── Yeni Versiyon Oluştur ───────────────────────────────────────────

async function createDocumentVersion(
  hospitalId,
  belgeNo,
  belgeTipi,
  icerik,
  kullanici = null,
  degisiklikNotu = null,
  meta = {}
) {
  const hId = normalizeHospitalId(hospitalId);
  if (!hId || !belgeNo) return null;

  await ensureVersionTable();
  const db = await getDb();
  const now = new Date().toISOString();
  const hash = hashContent(icerik);

  // Mevcut son versiyonu kontrol et
  const existing = mapExecRows(
    db.exec(
      `SELECT versiyon, icerik_hash FROM document_versions
       WHERE hospital_id = ? AND belge_no = ?
       ORDER BY versiyon DESC
       LIMIT 1`,
      [hId, belgeNo]
    )
  );

  // Aynı hash ise yeni versiyon oluşturma (değişiklik yok)
  if (existing.length > 0 && existing[0].icerik_hash === hash) {
    return {
      degisti: false,
      versiyon: Number(existing[0].versiyon),
      mesaj: "İçerik değişmedi, yeni versiyon oluşturulmadı.",
    };
  }

  const yeniVersiyon = existing.length > 0 ? Number(existing[0].versiyon) + 1 : 1;

  db.run(
    `INSERT INTO document_versions
     (id, hospital_id, belge_no, versiyon, belge_tipi, icerik_hash, icerik_json, olusturan_kullanici, olusturma_zamani, degisiklik_notu, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uid(),
      hId,
      belgeNo,
      yeniVersiyon,
      belgeTipi || null,
      hash,
      typeof icerik === "string" ? icerik : JSON.stringify(icerik),
      kullanici,
      now,
      degisiklikNotu,
      JSON.stringify(meta),
    ]
  );

  await saveDb();

  return {
    degisti: true,
    versiyon: yeniVersiyon,
    belgeNo,
    hash,
    olusturmaZamani: now,
  };
}

// ── Belge Geçmişi ──────────────────────────────────────────────────

async function getDocumentHistory(hospitalId, belgeNo) {
  const hId = normalizeHospitalId(hospitalId);
  if (!hId || !belgeNo) return [];

  await ensureVersionTable();
  const db = await getDb();

  const rows = mapExecRows(
    db.exec(
      `SELECT id, versiyon, belge_tipi, icerik_hash, olusturan_kullanici,
              olusturma_zamani, degisiklik_notu
       FROM document_versions
       WHERE hospital_id = ? AND belge_no = ?
       ORDER BY versiyon DESC`,
      [hId, belgeNo]
    )
  );

  return rows.map((r) => ({
    id: r.id,
    versiyon: Number(r.versiyon),
    belgeTipi: r.belge_tipi,
    hash: r.icerik_hash,
    olusturan: r.olusturan_kullanici,
    tarih: r.olusturma_zamani,
    not: r.degisiklik_notu,
  }));
}

// ── Son Versiyon ────────────────────────────────────────────────────

async function getLatestVersion(hospitalId, belgeNo) {
  const hId = normalizeHospitalId(hospitalId);
  if (!hId || !belgeNo) return null;

  await ensureVersionTable();
  const db = await getDb();

  const rows = mapExecRows(
    db.exec(
      `SELECT * FROM document_versions
       WHERE hospital_id = ? AND belge_no = ?
       ORDER BY versiyon DESC
       LIMIT 1`,
      [hId, belgeNo]
    )
  );

  if (!rows.length) return null;

  const r = rows[0];
  return {
    id: r.id,
    versiyon: Number(r.versiyon),
    belgeTipi: r.belge_tipi,
    hash: r.icerik_hash,
    icerik: r.icerik_json,
    olusturan: r.olusturan_kullanici,
    tarih: r.olusturma_zamani,
    not: r.degisiklik_notu,
  };
}

// ── Kurum Belge İstatistikleri ──────────────────────────────────────

async function getDocumentStats(hospitalId) {
  const hId = normalizeHospitalId(hospitalId);
  if (!hId) return { toplamBelge: 0, toplamVersiyon: 0 };

  await ensureVersionTable();
  const db = await getDb();

  const stats = mapExecRows(
    db.exec(
      `SELECT COUNT(DISTINCT belge_no) as belge_sayisi,
              COUNT(*) as versiyon_sayisi
       FROM document_versions
       WHERE hospital_id = ?`,
      [hId]
    )
  );

  return {
    toplamBelge: Number(stats[0]?.belge_sayisi || 0),
    toplamVersiyon: Number(stats[0]?.versiyon_sayisi || 0),
  };
}

module.exports = {
  createDocumentVersion,
  getDocumentHistory,
  getLatestVersion,
  getDocumentStats,
};
