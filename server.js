const express = require("express");
const path = require("path");
const session = require("express-session");
const rateLimit = require("express-rate-limit");

const env = require("./config/env");
const { initDb } = require("./db");
const { schedulerBaslat } = require("./bots/whatsapp/scheduler");
const {
  attachHospitalContext,
  requireActiveHospital,
} = require("./middleware/hospitalIsolation");
const { securityHeadersMiddleware } = require("./middleware/securityHeaders");
const { kvkkMaskMiddleware } = require("./middleware/kvkkMask");
const { errorTrackingHandler } = require("./services/errorTracker");
const { startRetentionScheduler } = require("./services/dataRetention");

// BullMQ worker bootstrap
if (process.env.ENABLE_PROVIZYON_WORKER === "true") {
  require("./workers/provizyonWorker");
  console.log("[WORKER] Provizyon worker aktif.");
} else {
  console.log("[WORKER] Provizyon worker pasif.");
}

const authRoutes = require("./routes/auth");

let mainRoutes = null;
if (process.env.ENABLE_MAIN_ROUTES === "true") {
  mainRoutes = require("./routes/main");
  console.log("[ROUTES] mainRoutes aktif.");
} else {
  console.log("[ROUTES] mainRoutes pasif.");
}

let apiRoutes = null;
if (process.env.ENABLE_API_ROUTES === "true") {
  apiRoutes = require("./routes/api");
  console.log("[ROUTES] apiRoutes aktif.");
} else {
  console.log("[ROUTES] apiRoutes pasif.");
}

const redOnlemeRoutes = require("./routes/redOnleme");
const credentialRoutes = require("./routes/credentials");
const adminRoutes = require("./routes/admin");
const dashboardRoutes = require("./routes/dashboard");
const kvkkRoutes = require("./routes/kvkk");
const webhookRoutes = require("./routes/webhook");
const monitoringRoutes = require("./routes/monitoring");

function assertRouter(name, value) {
  if (typeof value !== "function") {
    console.error(`HATALI ROUTE: ${name} bir router export etmiyor.`);
    console.error("Gelen değer tipi:", typeof value);
    console.error("Gelen değer:", value);
    throw new TypeError(
      `${name} router degil. Dosyanin sonunda 'module.exports = router;' olmali.`
    );
  }
}

[
  ["authRoutes", authRoutes],
  ...(mainRoutes ? [["mainRoutes", mainRoutes]] : []),
  ...(apiRoutes ? [["apiRoutes", apiRoutes]] : []),
  ["redOnlemeRoutes", redOnlemeRoutes],
  ["credentialRoutes", credentialRoutes],
  ["adminRoutes", adminRoutes],
  ["dashboardRoutes", dashboardRoutes],
  ["kvkkRoutes", kvkkRoutes],
  ["webhookRoutes", webhookRoutes],
  ["monitoringRoutes", monitoringRoutes],
].forEach(([name, router]) => assertRouter(name, router));

const app = express();
const PORT = env.PORT;
const isProd = env.NODE_ENV === "production";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", 1);

app.use(express.urlencoded({ extended: true }));
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use((req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});

const genel = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { hata: "Çok fazla istek gönderildi. 15 dakika sonra tekrar deneyin." },
});

app.use(genel);

// Güvenlik header'ları
app.use(securityHeadersMiddleware);

// X-Powered-By kaldır
app.disable("x-powered-by");

app.use(
  session({
    name: "rpa.sid",
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.use((req, res, next) => {
  res.locals.currentUser = req.session?.user || null;
  res.locals.currentHospital = req.hospital || null;
  next();
});

// Static belgeler
app.use("/generated_docs", express.static(path.join(__dirname, "generated_docs")));

// Basit kök sayfa
app.get("/", (_req, res) => {
  res.send("RPA WhatsApp Bot çalışıyor. Sağlık kontrolü: /health");
});

// Health endpoint
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    status: "ok",
    service: "rpa_system",
    mainRoutes: process.env.ENABLE_MAIN_ROUTES === "true",
    apiRoutes: process.env.ENABLE_API_ROUTES === "true",
    provizyonWorker: process.env.ENABLE_PROVIZYON_WORKER === "true",
    ts: new Date().toISOString(),
  });
});

app.use("/", authRoutes);

// Webhook route'ları dış sistemden gelir; hospital/session zorunluluğuna girmemeli
app.use("/webhook", webhookRoutes);

app.use(attachHospitalContext);
app.use(requireActiveHospital);

// KVKK maskeleme
app.use(kvkkMaskMiddleware);

if (mainRoutes) {
  app.use("/", mainRoutes);
}

if (apiRoutes) {
  app.use("/api", apiRoutes);
}

app.use("/red-onleme", redOnlemeRoutes);
app.use("/credentials", credentialRoutes);
app.use("/admin", adminRoutes);
app.use("/", dashboardRoutes);
app.use("/", monitoringRoutes);
app.use("/kvkk", kvkkRoutes);

app.use((req, res) => {
  res.status(404).send("Sayfa bulunamadi.");
});

// Global error tracking
app.use(errorTrackingHandler);

app.use((err, req, res, next) => {
  const errorLog = {
    message: err.message,
    stack: isProd ? undefined : err.stack,
    method: req.method,
    url: req.originalUrl,
    userId: req.session?.user?.id || null,
    hospitalId:
      req.hospital?.id ||
      req.session?.hospital?.id ||
      req.session?.user?.hospitalId ||
      req.session?.user?.hospital_id ||
      null,
  };

  console.error("GLOBAL ERROR:", errorLog);

  if (res.headersSent) return next(err);

  if (req.originalUrl.startsWith("/api")) {
    return res.status(err.status || 500).json({
      ok: false,
      hata: isProd ? "Beklenmeyen bir sunucu hatasi olustu." : err.message,
    });
  }

  return res.status(err.status || 500).send(
    isProd ? "Beklenmeyen bir sunucu hatasi olustu." : `Sunucu hatasi: ${err.message}`
  );
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Panel: http://127.0.0.1:${PORT}`);
      schedulerBaslat();
      startRetentionScheduler();
      console.log("[SECURITY] Güvenlik header'ları aktif.");
      console.log("[KVKK] Log maskeleme aktif.");
      console.log("[ERROR_TRACKER] Hata izleme aktif.");

      // Development modunda mock SGK sunucusunu otomatik başlat
      if (!isProd) {
        try {
          require("./fake_portal");
          console.log("[MOCK] Sahte SGK portalı otomatik başlatıldı (port 4000).");
        } catch (e) {
          console.warn("[MOCK] Sahte portal başlatılamadı:", e.message);
        }
      }
    });
  })
  .catch((err) => {
    console.error("Uygulama baslatilamadi:", err);
    process.exit(1);
  });