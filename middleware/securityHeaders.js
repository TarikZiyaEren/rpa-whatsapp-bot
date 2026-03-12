/**
 * Güvenlik Header'ları Middleware'i
 *
 * OWASP önerilerine uygun HTTP güvenlik header'ları.
 * XSS, clickjacking, MIME sniffing ve diğer saldırılara karşı koruma.
 */

function securityHeadersMiddleware(req, res, next) {
  // X-Powered-By kaldır (bilgi sızıntısı engeli)
  res.removeHeader("X-Powered-By");

  // MIME type sniffing engelle
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Clickjacking koruması
  res.setHeader("X-Frame-Options", "DENY");

  // XSS koruması (eski tarayıcılar için)
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer bilgi sızıntısını sınırla
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // DNS prefetching kapat
  res.setHeader("X-DNS-Prefetch-Control", "off");

  // Download dialog'unda otomatik açılmayı engelle (IE)
  res.setHeader("X-Download-Options", "noopen");

  // İzin politikası
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  // Content Security Policy (temel)
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; ")
  );

  // Production'da HSTS
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  // Hassas endpoint'ler için cache engeli
  const sensitiveEndpoints = [
    "/api",
    "/admin",
    "/kvkk",
    "/credentials",
    "/login",
    "/monitoring",
  ];

  const isSensitive = sensitiveEndpoints.some((ep) =>
    req.originalUrl?.startsWith(ep)
  );

  if (isSensitive) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  next();
}

module.exports = {
  securityHeadersMiddleware,
};
