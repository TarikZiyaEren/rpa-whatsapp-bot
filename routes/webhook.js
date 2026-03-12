const express = require("express");
const rateLimit = require("express-rate-limit");
const env = require("../config/env");
const { verifyMetaSignature } = require("../services/webhookService");
const { webhookIsle } = require("../bots/whatsapp");

const router = express.Router();

const webhookLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/whatsapp", webhookLimit, (req, res) => {
  const VERIFY_TOKEN = env.WA_VERIFY_TOKEN;

  console.log("[WA][GET] Webhook verify isteği geldi:", {
    mode: req.query["hub.mode"],
    tokenVarMi: !!req.query["hub.verify_token"],
    challengeVarMi: !!req.query["hub.challenge"],
  });

  if (!VERIFY_TOKEN) {
    console.error("[WA][GET] WA_VERIFY_TOKEN tanımlı değil");
    return res.status(500).send("WA_VERIFY_TOKEN tanimli degil");
  }

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WA][GET] Webhook doğrulandı");
    return res.status(200).send(challenge);
  }

  console.error("[WA][GET] Webhook doğrulama başarısız:", {
    mode,
    tokenEslesiyor: token === VERIFY_TOKEN,
  });

  return res.sendStatus(403);
});

router.post("/whatsapp", webhookLimit, async (req, res) => {
  console.log("[WA][POST] Webhook isteği geldi");
  console.log("[WA][POST] Headers:", {
    signature: req.get("x-hub-signature-256") || null,
    contentType: req.get("content-type") || null,
    userAgent: req.get("user-agent") || null,
  });

  try {
    console.log("[WA][POST] Body:", JSON.stringify(req.body, null, 2));
  } catch (e) {
    console.error("[WA][POST] Body loglanamadı:", e.message);
  }

  const signatureOk = verifyMetaSignature(req);

  if (!signatureOk) {
    console.error("[WA][POST] Signature doğrulaması başarısız");
    return res.sendStatus(401);
  }

  console.log("[WA][POST] Signature doğrulaması başarılı");
  res.sendStatus(200);

  try {
    await webhookIsle(req.body);
    console.log("[WA][POST] webhookIsle tamamlandı");
  } catch (e) {
    console.error("[WA][POST] İşleme hatası:", e.message);
    console.error(e.stack);
  }
});

module.exports = router;