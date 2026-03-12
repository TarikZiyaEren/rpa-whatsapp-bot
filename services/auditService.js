/**
 * Gelişmiş Audit Trail Servisi
 *
 * Detaylı aksiyon kategorileri, önem seviyeleri, data diff,
 * KVKK maskeleme entegrasyonu ve sorgulanabilir audit log.
 */

const { addAuditLog } = require("../db");
const { sanitizeLogData } = require("../middleware/kvkkMask");

// ── Aksiyon Kategorileri ────────────────────────────────────────────
const AUDIT_KATEGORILERI = {
  AUTH: "AUTH",                 // Giriş, çıkış, şifre değişikliği
  DATA_READ: "DATA_READ",       // Veri okuma (hassas)
  DATA_WRITE: "DATA_WRITE",     // Veri yazma/güncelleme
  DATA_DELETE: "DATA_DELETE",   // Veri silme
  CONFIG: "CONFIG",             // Sistem/kurum ayar değişikliği
  EXPORT: "EXPORT",             // Veri dışa aktarma
  KVKK: "KVKK",                 // KVKK işlemleri
  BOT: "BOT",                   // Bot/RPA işlemleri
  REVIEW: "REVIEW",             // İnceleme kuyruğu işlemleri
};

// ── Önem Seviyeleri ─────────────────────────────────────────────────
const ONEM_SEVIYELERI = {
  INFO: "INFO",
  WARNING: "WARNING",
  CRITICAL: "CRITICAL",
};

// ── İşlem → Otomatik Kategori ve Önem Eşlemesi ─────────────────────
const ISLEM_ESLEME = {
  LOGIN: { kategori: "AUTH", onem: "INFO" },
  LOGIN_FAIL: { kategori: "AUTH", onem: "WARNING" },
  LOGOUT: { kategori: "AUTH", onem: "INFO" },
  PASSWORD_CHANGE: { kategori: "AUTH", onem: "WARNING" },

  PROVIZYON_GONDER: { kategori: "BOT", onem: "INFO" },
  PROVIZYON_SONUC: { kategori: "BOT", onem: "INFO" },
  RED_ONLEME_ANALIZ: { kategori: "BOT", onem: "INFO" },
  RED_ONLEME_BLOCK: { kategori: "BOT", onem: "CRITICAL" },

  KVKK_TARA: { kategori: "KVKK", onem: "WARNING" },
  KVKK_AYDINLATMA: { kategori: "KVKK", onem: "INFO" },
  KVKK_SILME_TALEBI: { kategori: "KVKK", onem: "CRITICAL" },

  REVIEW_ONAYLA: { kategori: "REVIEW", onem: "WARNING" },
  REVIEW_REDDET: { kategori: "REVIEW", onem: "WARNING" },

  CREDENTIAL_SAVE: { kategori: "CONFIG", onem: "CRITICAL" },
  HOSPITAL_CREATE: { kategori: "CONFIG", onem: "CRITICAL" },
  HOSPITAL_UPDATE: { kategori: "CONFIG", onem: "WARNING" },
  USER_CREATE: { kategori: "CONFIG", onem: "CRITICAL" },

  DATA_EXPORT: { kategori: "EXPORT", onem: "WARNING" },
};

// ── Yardımcılar ─────────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString();
}

function extractUser(req) {
  const user = req?.session?.user || null;
  return {
    username: user?.username || "anonim",
    userId: user?.id ? String(user.id) : null,
    role: user?.role || null,
    hospitalId: req?.hospital?.id || user?.hospitalId || null,
  };
}

function extractIp(req) {
  return (
    req?.ip ||
    req?.headers?.["x-forwarded-for"] ||
    req?.connection?.remoteAddress ||
    null
  );
}

function getIslemEsleme(islem) {
  return ISLEM_ESLEME[islem] || { kategori: "DATA_READ", onem: "INFO" };
}

// ── Ana Audit Fonksiyonu (genişletilmiş) ────────────────────────────

function audit(req, islem, detay = null, extra = {}) {
  try {
    const user = extractUser(req);
    const ip = extractIp(req);
    const esleme = getIslemEsleme(islem);

    // KVKK maskeleme uygula
    const maskeliDetay = detay ? sanitizeLogData({ d: detay }).d : null;

    const payload = {
      hospital_id: user.hospitalId,
      kullanici: user.username,
      ip,
      islem: String(islem || "UNKNOWN"),
      detay: typeof maskeliDetay === "string" ? maskeliDetay : JSON.stringify(maskeliDetay),
      created_at: nowIso(),

      // Yeni alanlar
      kategori: extra.kategori || esleme.kategori,
      onem_seviyesi: extra.onem || esleme.onem,
      meta_json: JSON.stringify({
        ...extra,
        userId: user.userId,
        role: user.role,
        url: req?.originalUrl || null,
        method: req?.method || null,
        userAgent: req?.headers?.["user-agent"] || null,
      }),
      sure_ms: extra.sure_ms || null,
    };

    addAuditLog(payload).catch(() => {});

    // Kritik işlemleri console'a da yaz
    if (esleme.onem === "CRITICAL") {
      console.warn(
        `[AUDIT:CRITICAL] ${islem} | ${user.username} | hospital: ${user.hospitalId || "?"} | ${maskeliDetay || ""}`
      );
    }
  } catch {
    // Audit hatası sessiz geçilir
  }
}

// ── Programatik Audit (req olmadan) ─────────────────────────────────

function auditDirect(options = {}) {
  try {
    const esleme = getIslemEsleme(options.islem || "SYSTEM");
    const maskeliDetay = options.detay
      ? sanitizeLogData({ d: options.detay }).d
      : null;

    const payload = {
      hospital_id: options.hospitalId || null,
      kullanici: options.kullanici || "sistem",
      ip: options.ip || "127.0.0.1",
      islem: String(options.islem || "SYSTEM"),
      detay: typeof maskeliDetay === "string" ? maskeliDetay : JSON.stringify(maskeliDetay),
      created_at: nowIso(),
      kategori: options.kategori || esleme.kategori,
      onem_seviyesi: options.onem || esleme.onem,
      meta_json: JSON.stringify(options.meta || {}),
      sure_ms: options.sure_ms || null,
    };

    addAuditLog(payload).catch(() => {});
  } catch {}
}

module.exports = {
  audit,
  auditDirect,
  AUDIT_KATEGORILERI,
  ONEM_SEVIYELERI,
};