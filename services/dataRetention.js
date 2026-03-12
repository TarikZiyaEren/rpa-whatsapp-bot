/**
 * Veri Saklama ve Yedekleme Politikası Servisi
 *
 * Regülasyon uyumlu veri saklama süreleri ve otomatik temizlik.
 * KVKK: Kişisel veri amacı ortadan kalktığında silinmelidir.
 */

const { getDb, saveDb } = require("../db/core");
const { mapExecRows } = require("../db/utils");

// ── Saklama Politikaları (gün cinsinden) ────────────────────────────
const SAKLAMA_POLITIKALARI = {
  history: {
    tablo: "history",
    zamanKolonu: "time",
    saklamaGunu: 365,
    aciklama: "İşlem geçmişi — 1 yıl",
  },
  ai_feedback: {
    tablo: "ai_feedback",
    zamanKolonu: "time",
    saklamaGunu: 365,
    aciklama: "AI öğrenme verisi — 1 yıl",
  },
  audit_log: {
    tablo: "audit_log",
    zamanKolonu: "zaman",
    saklamaGunu: 730,
    aciklama: "Denetim kaydı — 2 yıl (yasal zorunluluk)",
  },
  error_log: {
    tablo: "error_log",
    zamanKolonu: "ilk_olusum",
    saklamaGunu: 90,
    aciklama: "Hata kayıtları — 90 gün",
  },
  // kvkk_log SİLİNMEZ — yasal zorunluluk
};

// ── Tarih Yardımcısı ────────────────────────────────────────────────

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// ── Otomatik Temizlik ───────────────────────────────────────────────

async function runRetentionCleanup() {
  const sonuclar = [];

  try {
    const db = await getDb();

    for (const [key, pol] of Object.entries(SAKLAMA_POLITIKALARI)) {
      try {
        const esik = daysAgoISO(pol.saklamaGunu);

        // Silinecek kayıt sayısını hesapla
        const countRows = mapExecRows(
          db.exec(
            `SELECT COUNT(*) as adet FROM ${pol.tablo}
             WHERE ${pol.zamanKolonu} < ?`,
            [esik]
          )
        );
        const silinecek = Number(countRows[0]?.adet || 0);

        if (silinecek > 0) {
          db.run(
            `DELETE FROM ${pol.tablo} WHERE ${pol.zamanKolonu} < ?`,
            [esik]
          );

          sonuclar.push({
            tablo: pol.tablo,
            silinenKayit: silinecek,
            saklamaGunu: pol.saklamaGunu,
            esikTarih: esik,
            durum: "temizlendi",
          });

          console.log(
            `[DATA_RETENTION] ${pol.tablo}: ${silinecek} kayıt silindi (>${pol.saklamaGunu} gün)`
          );
        } else {
          sonuclar.push({
            tablo: pol.tablo,
            silinenKayit: 0,
            saklamaGunu: pol.saklamaGunu,
            esikTarih: esik,
            durum: "temiz",
          });
        }
      } catch (err) {
        sonuclar.push({
          tablo: pol.tablo,
          durum: "hata",
          hata: err.message,
        });
        console.error(`[DATA_RETENTION] ${pol.tablo} temizlik hatası:`, err.message);
      }
    }

    await saveDb();
  } catch (err) {
    console.error("[DATA_RETENTION] Genel temizlik hatası:", err.message);
  }

  return {
    zaman: new Date().toISOString(),
    sonuclar,
  };
}

// ── Veri Saklama Durumu ─────────────────────────────────────────────

async function getRetentionStatus(hospitalId = null) {
  try {
    const db = await getDb();
    const durum = [];

    for (const [key, pol] of Object.entries(SAKLAMA_POLITIKALARI)) {
      try {
        const query = hospitalId
          ? `SELECT COUNT(*) as toplam,
                    MIN(${pol.zamanKolonu}) as en_eski,
                    MAX(${pol.zamanKolonu}) as en_yeni
             FROM ${pol.tablo}
             WHERE hospital_id = ?`
          : `SELECT COUNT(*) as toplam,
                    MIN(${pol.zamanKolonu}) as en_eski,
                    MAX(${pol.zamanKolonu}) as en_yeni
             FROM ${pol.tablo}`;

        const params = hospitalId ? [hospitalId] : [];
        const rows = mapExecRows(db.exec(query, params));
        const r = rows[0] || {};

        const esik = daysAgoISO(pol.saklamaGunu);
        const eskiKayitQuery = hospitalId
          ? `SELECT COUNT(*) as adet FROM ${pol.tablo}
             WHERE hospital_id = ? AND ${pol.zamanKolonu} < ?`
          : `SELECT COUNT(*) as adet FROM ${pol.tablo}
             WHERE ${pol.zamanKolonu} < ?`;
        const eskiParams = hospitalId ? [hospitalId, esik] : [esik];
        const eskiRows = mapExecRows(db.exec(eskiKayitQuery, eskiParams));

        durum.push({
          tablo: pol.tablo,
          aciklama: pol.aciklama,
          saklamaGunu: pol.saklamaGunu,
          toplamKayit: Number(r.toplam || 0),
          enEskiKayit: r.en_eski || null,
          enYeniKayit: r.en_yeni || null,
          suresiDolanKayit: Number(eskiRows[0]?.adet || 0),
        });
      } catch (err) {
        durum.push({
          tablo: pol.tablo,
          aciklama: pol.aciklama,
          hata: err.message,
        });
      }
    }

    // KVKK log (silinmez)
    try {
      const kvkkRows = mapExecRows(
        db.exec(
          hospitalId
            ? "SELECT COUNT(*) as toplam FROM kvkk_log WHERE hospital_id = ?"
            : "SELECT COUNT(*) as toplam FROM kvkk_log",
          hospitalId ? [hospitalId] : []
        )
      );
      durum.push({
        tablo: "kvkk_log",
        aciklama: "KVKK kayıtları — SİLİNMEZ (yasal zorunluluk)",
        saklamaGunu: "∞",
        toplamKayit: Number(kvkkRows[0]?.toplam || 0),
        suresiDolanKayit: 0,
      });
    } catch {}

    return {
      hospitalId,
      zaman: new Date().toISOString(),
      tablolar: durum,
    };
  } catch (err) {
    console.error("[DATA_RETENTION] Durum alınamadı:", err.message);
    return { tablolar: [], hata: err.message };
  }
}

// ── Yedekleme Manifest'i ────────────────────────────────────────────

async function createBackupManifest() {
  try {
    const db = await getDb();
    const tablolar = [
      "hospitals", "users", "history", "ai_feedback", "audit_log",
      "kvkk_log", "credentials", "review_queue", "randevular",
      "tenant_models", "tenant_procedure_stats", "tenant_provider_stats",
      "document_versions", "error_log",
    ];

    const manifest = [];
    for (const tablo of tablolar) {
      try {
        const rows = mapExecRows(
          db.exec(`SELECT COUNT(*) as adet FROM ${tablo}`)
        );
        manifest.push({
          tablo,
          kayitSayisi: Number(rows[0]?.adet || 0),
        });
      } catch {
        manifest.push({ tablo, kayitSayisi: 0, not: "tablo bulunamadı" });
      }
    }

    return {
      zaman: new Date().toISOString(),
      veritabani: "rpa.db",
      tablolar: manifest,
      toplamKayit: manifest.reduce((s, t) => s + (t.kayitSayisi || 0), 0),
    };
  } catch (err) {
    return { hata: err.message };
  }
}

// ── Otomatik Temizlik Scheduler ─────────────────────────────────────

let cleanupInterval = null;

function startRetentionScheduler() {
  // Her gün bir kez çalıştır (24 saat = 86400000 ms)
  cleanupInterval = setInterval(async () => {
    console.log("[DATA_RETENTION] Günlük temizlik başlıyor...");
    const sonuc = await runRetentionCleanup();
    const silinen = sonuc.sonuclar
      .filter((s) => s.silinenKayit > 0)
      .map((s) => `${s.tablo}: ${s.silinenKayit}`)
      .join(", ");

    if (silinen) {
      console.log(`[DATA_RETENTION] Temizlik tamamlandı: ${silinen}`);
    } else {
      console.log("[DATA_RETENTION] Temizlenecek kayıt bulunamadı.");
    }
  }, 24 * 60 * 60 * 1000);

  console.log("[DATA_RETENTION] Günlük temizlik scheduler başlatıldı.");
}

function stopRetentionScheduler() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

module.exports = {
  runRetentionCleanup,
  getRetentionStatus,
  createBackupManifest,
  startRetentionScheduler,
  stopRetentionScheduler,
  SAKLAMA_POLITIKALARI,
};
