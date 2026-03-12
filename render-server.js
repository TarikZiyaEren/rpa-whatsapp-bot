const express = require("express");
const env = require("./config/env");

const webhookRoutes = require("./routes/webhook");
const securityHeadersMiddleware = require("./middleware/securityHeaders");
const kvkkMaskMiddleware = require("./middleware/kvkkMask");
const { initDb } = require("./db");
const { startDataRetentionScheduler } = require("./services/dataRetention");
const { startErrorTracker } = require("./services/errorTracker");

const app = express();

// Meta signature doğrulaması için ham body saklama
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
    limit: "2mb",
  })
);

app.use(express.urlencoded({ extended: true }));

app.use(securityHeadersMiddleware);
app.use(kvkkMaskMiddleware);

// Basit health endpoint
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    status: "ok",
    service: "rpa-whatsapp-bot",
    mode: "render-minimal",
    ts: new Date().toISOString(),
  });
});

// Sadece WhatsApp webhook
app.use("/webhook", webhookRoutes);

async function start() {
  try {
    await initDb();
    console.log("[RENDER] DB hazır");
  } catch (e) {
    console.error("[RENDER] DB init hatası:", e.message);
    console.error(e.stack);
    process.exit(1);
  }

  try {
    startDataRetentionScheduler();
    startErrorTracker();
  } catch (e) {
    console.warn("[RENDER] Opsiyonel servis başlatma uyarısı:", e.message);
  }

  const PORT = Number(env.PORT || process.env.PORT || 10000);

  app.listen(PORT, () => {
    console.log(`[RENDER] Minimal server aktif: http://127.0.0.1:${PORT}`);
  });
}

start();