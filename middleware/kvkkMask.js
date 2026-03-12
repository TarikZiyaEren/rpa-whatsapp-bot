/**
 * KVKK Uyumlu Log Maskeleme Middleware'i
 *
 * TC, telefon, ad-soyad gibi kişisel verileri otomatik maskeler.
 * Response JSON'larında ve log çıktılarında kullanılır.
 *
 * KVKK Madde 4: Kişisel veriler işlenme amacıyla bağlantılı,
 * sınırlı ve ölçülü olmalıdır.
 */

// ── TC Kimlik Maskeleme ─────────────────────────────────────────────
function maskTC(tc) {
  if (!tc) return tc;
  const s = String(tc).trim();
  if (s.length < 5) return "***";
  return s.slice(0, 3) + "****" + s.slice(-3);
}

// ── Telefon Maskeleme ───────────────────────────────────────────────
function maskTelefon(tel) {
  if (!tel) return tel;
  const s = String(tel).replace(/\s/g, "").trim();
  if (s.length < 5) return "***";
  return s.slice(0, 3) + "****" + s.slice(-3);
}

// ── Ad Soyad Maskeleme ──────────────────────────────────────────────
function maskAd(ad) {
  if (!ad) return ad;
  const parts = String(ad).trim().split(/\s+/);
  return parts
    .map((p) => {
      if (p.length <= 2) return p[0] + "*";
      return p.slice(0, 2) + "*".repeat(Math.min(p.length - 2, 4));
    })
    .join(" ");
}

// ── E-posta Maskeleme ───────────────────────────────────────────────
function maskEposta(email) {
  if (!email) return email;
  const s = String(email).trim();
  const atIndex = s.indexOf("@");
  if (atIndex < 0) return "***";
  const local = s.slice(0, atIndex);
  const domain = s.slice(atIndex);
  if (local.length <= 2) return local[0] + "***" + domain;
  return local.slice(0, 2) + "***" + domain;
}

// ── Genel Metin İçinden TC Tespiti ve Maskeleme ─────────────────────
const TC_REGEX = /\b(\d{11})\b/g;
const TEL_REGEX = /\b(0\d{10})\b/g;

function maskTextContent(text) {
  if (!text || typeof text !== "string") return text;
  let result = text;
  result = result.replace(TC_REGEX, (match) => maskTC(match));
  result = result.replace(TEL_REGEX, (match) => maskTelefon(match));
  return result;
}

// ── Hassas Alanlar (JSON key bazlı otomatik maskeleme) ──────────────
const HASSAS_ALANLAR = {
  tc: maskTC,
  tcKimlikNo: maskTC,
  tc_kimlik: maskTC,
  telefon: maskTelefon,
  phone: maskTelefon,
  tel: maskTelefon,
  email: maskEposta,
  eposta: maskEposta,
  ad: maskAd,
  hasta_ad: maskAd,
  hastaAdi: maskAd,
  hastaAd: maskAd,
};

// Maskeleme uygulanmaması gereken rotalar
const BYPASS_PATHS = [
  "/api/provizyon",
  "/api/red-onleme/analiz",
];

function shouldBypass(path) {
  return BYPASS_PATHS.some((p) => path?.startsWith(p));
}

// ── Obje İçindeki Hassas Alanları Otomatik Maskele ──────────────────
function sanitizeObject(obj, depth = 0) {
  if (depth > 8) return obj;
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return maskTextContent(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1));
  }

  if (typeof obj === "object") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const maskFn = HASSAS_ALANLAR[key];
      if (maskFn && typeof value === "string") {
        result[key] = maskFn(value);
      } else if (typeof value === "object") {
        result[key] = sanitizeObject(value, depth + 1);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return obj;
}

// ── Log Verisi Temizleme (Audit ve Console için) ────────────────────
function sanitizeLogData(data) {
  if (!data || typeof data !== "object") return data;
  return sanitizeObject(data);
}

// ── Express Middleware ──────────────────────────────────────────────
// Response JSON'larında otomatik KVKK maskeleme
function kvkkMaskMiddleware(req, res, next) {
  // Orijinal json fonksiyonunu kaydet
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    // Bypass path'lerde maskeleme yapma (provizyon gönderimi gibi)
    if (shouldBypass(req.originalUrl)) {
      return originalJson(body);
    }

    // Admin kullanıcılar maskelenmemiş veri görebilir (opsiyonel)
    const user = req.session?.user;
    const isAdmin = user?.role === "admin";

    // KVKK officer ve admin hariç herkese maskele
    if (!isAdmin) {
      try {
        body = sanitizeObject(body);
      } catch {
        // Maskeleme hatası sessiz geçilir
      }
    }

    return originalJson(body);
  };

  next();
}

module.exports = {
  maskTC,
  maskTelefon,
  maskAd,
  maskEposta,
  maskTextContent,
  sanitizeObject,
  sanitizeLogData,
  kvkkMaskMiddleware,
};
