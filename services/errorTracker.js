/**
 * Yapılandırılmış Hata İzleme Servisi
 *
 * Hataları DB'ye kaydeder, kategorize eder ve trend analizi sağlar.
 * console.error yerine yapılandırılmış, sorgulanabilir hata takibi.
 */

const { getDb, saveDb } = require("../db/core");
const { mapExecRows, uid } = require("../db/utils");

// ── Hata Kategorileri ───────────────────────────────────────────────
const HATA_KATEGORILERI = {
  AUTH: "AUTH",           // Kimlik doğrulama hataları
  DB: "DB",               // Veritabanı hataları
  API: "API",             // API/endpoint hataları
  WORKER: "WORKER",       // İş kuyruğu hataları
  BOT: "BOT",             // Bot/RPA hataları
  KVKK: "KVKK",           // KVKK işlem hataları
  NETWORK: "NETWORK",     // Ağ/dış servis hataları
  VALIDATION: "VALIDATION", // Veri doğrulama hataları
  SYSTEM: "SYSTEM",       // Sistem seviyesi hatalar
};

// ── Tablo Oluşturma ─────────────────────────────────────────────────

async function ensureErrorTable() {
  const db = await getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS error_log (
      id TEXT PRIMARY KEY,
      hospital_id TEXT,
      kategori TEXT NOT NULL,
      mesaj TEXT NOT NULL,
      stack TEXT,
      context_json TEXT,
      kaynak TEXT,
      kullanici TEXT,
      url TEXT,
      method TEXT,
      ilk_olusum TEXT NOT NULL,
      son_olusum TEXT NOT NULL,
      tekrar_sayisi INTEGER DEFAULT 1,
      cozuldu INTEGER DEFAULT 0
    );
  `);
}

// ── Hata Kayıt ──────────────────────────────────────────────────────

async function trackError(err, context = {}) {
  try {
    await ensureErrorTable();
    const db = await getDb();
    const now = new Date().toISOString();

    const kategori = context.kategori || HATA_KATEGORILERI.SYSTEM;
    const mesaj = err?.message || String(err || "Bilinmeyen hata");
    const stack = err?.stack || null;
    const hospitalId = context.hospitalId || null;
    const kaynak = context.kaynak || null;
    const kullanici = context.kullanici || null;
    const url = context.url || null;
    const method = context.method || null;

    // Aynı mesaj + kategori + hospital varsa tekrar sayısını artır
    const existing = mapExecRows(
      db.exec(
        `SELECT id, tekrar_sayisi FROM error_log
         WHERE mesaj = ? AND kategori = ? AND hospital_id IS ?
         AND cozuldu = 0
         LIMIT 1`,
        [mesaj, kategori, hospitalId]
      )
    );

    if (existing.length > 0) {
      db.run(
        `UPDATE error_log
         SET tekrar_sayisi = tekrar_sayisi + 1,
             son_olusum = ?,
             stack = ?,
             context_json = ?
         WHERE id = ?`,
        [
          now,
          stack,
          JSON.stringify({
            ...context,
            son_stack: stack,
          }),
          existing[0].id,
        ]
      );
    } else {
      db.run(
        `INSERT INTO error_log
         (id, hospital_id, kategori, mesaj, stack, context_json, kaynak, kullanici, url, method, ilk_olusum, son_olusum, tekrar_sayisi, cozuldu)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        [
          uid(),
          hospitalId,
          kategori,
          mesaj,
          stack,
          JSON.stringify(context),
          kaynak,
          kullanici,
          url,
          method,
          now,
          now,
        ]
      );
    }

    await saveDb();

    // Console'a da yaz (silme — ama yapılandırılmış)
    console.error(
      `[ERROR_TRACKER] [${kategori}] ${mesaj}${hospitalId ? ` | hospital: ${hospitalId}` : ""}${kaynak ? ` | kaynak: ${kaynak}` : ""}`
    );
  } catch (trackErr) {
    // Hata izleme servisi kendisi hata verirse sessiz geç
    console.error("[ERROR_TRACKER] Kendi hatası:", trackErr.message);
  }
}

// ── Hata Özeti ──────────────────────────────────────────────────────

async function getErrorSummary(hospitalId = null) {
  try {
    await ensureErrorTable();
    const db = await getDb();

    const query = hospitalId
      ? `SELECT kategori, COUNT(*) as adet, SUM(tekrar_sayisi) as toplam_tekrar,
                MAX(son_olusum) as son_olusum
         FROM error_log
         WHERE hospital_id = ? AND cozuldu = 0
         GROUP BY kategori
         ORDER BY toplam_tekrar DESC`
      : `SELECT kategori, COUNT(*) as adet, SUM(tekrar_sayisi) as toplam_tekrar,
                MAX(son_olusum) as son_olusum
         FROM error_log
         WHERE cozuldu = 0
         GROUP BY kategori
         ORDER BY toplam_tekrar DESC`;

    const params = hospitalId ? [hospitalId] : [];
    const rows = mapExecRows(db.exec(query, params));

    const topHatalar = mapExecRows(
      db.exec(
        hospitalId
          ? `SELECT mesaj, kategori, tekrar_sayisi, son_olusum, kaynak
             FROM error_log
             WHERE hospital_id = ? AND cozuldu = 0
             ORDER BY tekrar_sayisi DESC, son_olusum DESC
             LIMIT 10`
          : `SELECT mesaj, kategori, tekrar_sayisi, son_olusum, kaynak
             FROM error_log
             WHERE cozuldu = 0
             ORDER BY tekrar_sayisi DESC, son_olusum DESC
             LIMIT 10`,
        hospitalId ? [hospitalId] : []
      )
    );

    return {
      kategoriBazli: rows.map((r) => ({
        kategori: r.kategori,
        benzersizHata: Number(r.adet),
        toplamTekrar: Number(r.toplam_tekrar),
        sonOlusum: r.son_olusum,
      })),
      topHatalar: topHatalar.map((r) => ({
        mesaj: r.mesaj,
        kategori: r.kategori,
        tekrarSayisi: Number(r.tekrar_sayisi),
        sonOlusum: r.son_olusum,
        kaynak: r.kaynak,
      })),
    };
  } catch (err) {
    console.error("[ERROR_TRACKER] Özet alınamadı:", err.message);
    return { kategoriBazli: [], topHatalar: [] };
  }
}

// ── Hata Trendi ─────────────────────────────────────────────────────

async function getErrorTrend(hospitalId = null, days = 7) {
  try {
    await ensureErrorTable();
    const db = await getDb();

    const result = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const day = d.toISOString().slice(0, 10);

      const query = hospitalId
        ? `SELECT COUNT(*) as adet FROM error_log
           WHERE hospital_id = ? AND ilk_olusum LIKE ? || '%'`
        : `SELECT COUNT(*) as adet FROM error_log
           WHERE ilk_olusum LIKE ? || '%'`;

      const params = hospitalId ? [hospitalId, day] : [day];
      const rows = mapExecRows(db.exec(query, params));

      result.push({
        tarih: day,
        hataSayisi: Number(rows[0]?.adet || 0),
      });
    }

    return result;
  } catch (err) {
    console.error("[ERROR_TRACKER] Trend alınamadı:", err.message);
    return [];
  }
}

// ── Hata Çözüldü İşaretle ──────────────────────────────────────────

async function resolveError(errorId) {
  try {
    await ensureErrorTable();
    const db = await getDb();
    db.run("UPDATE error_log SET cozuldu = 1 WHERE id = ?", [errorId]);
    await saveDb();
  } catch (err) {
    console.error("[ERROR_TRACKER] Çözüldü işaretlenemedi:", err.message);
  }
}

// ── Express Global Error Handler Yardımcısı ─────────────────────────

function errorTrackingHandler(err, req, res, next) {
  trackError(err, {
    kategori: HATA_KATEGORILERI.API,
    hospitalId:
      req.hospital?.id ||
      req.session?.user?.hospitalId ||
      null,
    kullanici: req.session?.user?.username || null,
    url: req.originalUrl,
    method: req.method,
    kaynak: "express_global_error",
  });

  next(err);
}

module.exports = {
  trackError,
  getErrorSummary,
  getErrorTrend,
  resolveError,
  errorTrackingHandler,
  HATA_KATEGORILERI,
};
