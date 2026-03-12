const express = require("express");
const env = require("./config/env");
const { initDb } = require("./db");

const webhookRoutes = require("./routes/webhook");
const { securityHeadersMiddleware } = require("./middleware/securityHeaders");
const { kvkkMaskMiddleware } = require("./middleware/kvkkMask");

const app = express();

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

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    status: "ok",
    service: "rpa-whatsapp-bot",
    mode: "render-minimal",
    ts: new Date().toISOString(),
  });
});

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

  const PORT = Number(env.PORT || process.env.PORT || 10000);

  app.listen(PORT, () => {
    console.log(`[RENDER] Minimal server aktif: http://127.0.0.1:${PORT}`);
  });
}

start();