const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { listKvkkLog, kvkkIstatistik, addKvkkLog } = require("../db");
const {
  kvkkTaramaCalistir,
  aydinlatmaMetniGetir,
  silmeTalebiOlusturAl,
} = require("../bots/kvkk");
const { audit } = require("../services/auditService");
const { createJob, pushLog, finishJob } = require("../jobs/jobStore");

const router = express.Router();

router.get("/", requireAuth, requireRole("kvkk"), async (req, res) => {
  const hospitalId = req.session.user.hospitalId;

  const [loglar, istatistik] = await Promise.all([
    listKvkkLog(50, hospitalId),
    kvkkIstatistik(hospitalId),
  ]);

  res.render("kvkk", {
    loglar,
    istatistik,
    rapor: null,
    jobId: null,
    hata: null,
  });
});

router.post("/tara", requireAuth, requireRole("kvkk"), async (req, res) => {
  const hospitalId = req.session.user.hospitalId;

  audit(req, "KVKK_TARA", null);
  const jobId = createJob(req.session.user.id);

  const [loglar, istatistik] = await Promise.all([
    listKvkkLog(50, hospitalId),
    kvkkIstatistik(hospitalId),
  ]);

  res.render("kvkk", {
    loglar,
    istatistik,
    rapor: null,
    jobId,
    hata: null,
  });

  setImmediate(async () => {
    try {
      const sonuc = await kvkkTaramaCalistir((m) => pushLog(jobId, m));
      finishJob(jobId, { rapor: sonuc.rapor, ozet: sonuc.ozet });
    } catch (e) {
      pushLog(jobId, `HATA: ${e.message}`);
      finishJob(jobId, { hata: e.message });
    }
  });
});

router.post("/aydinlatma", requireAuth, requireRole("kvkk"), async (req, res) => {
  const { tc, ad, dogum } = req.body;

  audit(
    req,
    "KVKK_AYDINLATMA",
    `TC: ${String(tc).slice(0, 3)}****${String(tc).slice(-3)}`
  );

  const metin = await aydinlatmaMetniGetir({ tc, ad, dogum });
  res.json(metin);
});

router.post("/silme-talebi", requireAuth, requireRole("kvkk"), async (req, res) => {
  const hospitalId = req.session.user.hospitalId;
  const { tc, ad, sebep } = req.body;

  audit(
    req,
    "KVKK_SILME_TALEBI",
    `TC: ${String(tc).slice(0, 3)}****${String(tc).slice(-3)} | Sebep: ${sebep}`
  );

  const talep = await silmeTalebiOlusturAl(tc, ad, sebep);

  await addKvkkLog({
    hospital_id: hospitalId,
    time: new Date().toISOString(),
    tip: "VERİ-SİLME",
    aciklama: `Silme talebi: ${ad}`,
    risk_seviyesi: "BİLGİ",
    tc: "*".repeat(7) + String(tc).slice(-4),
    islem: sebep,
    durum: "talep_alindi",
  });

  res.json(talep);
});

module.exports = router;