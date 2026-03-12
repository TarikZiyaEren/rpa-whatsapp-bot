const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { klinikVeriTopla } = require("../bots/klinik_veri");
const { islemOner } = require("../bots/icd_sut/onerici");
const { redRiskiAnaliz } = require("../bots/red_onleme");
const { yasHesapla } = require("../services/jobRunner");
const {
  buildRedLearningSummary,
  getRiskPrediction,
} = require("../services/redLearningService");
const {
  getJob,
  getJobStatus,
  addClient,
  removeClient,
} = require("../jobs/jobStore");

const router = express.Router();

function isAdmin(user) {
  return !!user && (
    user.role === "admin" ||
    String(user.username || "").toLowerCase() === "admin"
  );
}

function normalizeString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getUserContext(req) {
  const user = req.session?.user || null;
  const hospitalId = normalizeString(req.hospital?.id || user?.hospitalId || "");

  return {
    user,
    hospitalId,
  };
}

function ensureHospitalContext(req, res) {
  const { user, hospitalId } = getUserContext(req);

  if (!user) {
    return {
      ok: false,
      response: res.status(401).json({
        ok: false,
        hata: "Oturum bulunamadi",
      }),
    };
  }

  if (isAdmin(user) && !hospitalId) {
    return {
      ok: false,
      response: res.status(403).json({
        ok: false,
        hata: "Admin için aktif hastane bağlamı gerekli",
      }),
    };
  }

  if (!isAdmin(user) && !hospitalId) {
    return {
      ok: false,
      response: res.status(403).json({
        ok: false,
        hata: "Aktif hastane bağlamı bulunamadi",
      }),
    };
  }

  return { ok: true, user, hospitalId };
}

function buildFallbackHastaPayload(tc, detay = null) {
  return {
    ok: true,
    hasta: {
      tc,
      ad: "Ayşe Demir",
      dogum: "01.01.1990",
      cinsiyet: "K",
    },
    teshisler: [],
    ilaclar: [],
    labSonuclari: [],
    goruntulemeler: [],
    prosedurler: [],
    klinikOzet: "HBYS verisi alınamadığı için demo hasta verisi kullanıldı.",
    riskIsaretleri: detay ? [`Servis fallback modunda çalıştı: ${detay}`] : [],
    doktorNotu: "",
    kaynak: "FHIR_FALLBACK",
  };
}

router.get("/events/:jobId", requireAuth, (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({
      ok: false,
      hata: "Job bulunamadi",
    });
  }

  const user = req.session?.user;
  if (!user) {
    return res.status(401).json({
      ok: false,
      hata: "Oturum bulunamadi",
    });
  }

  const hospitalCheck = ensureHospitalContext(req, res);
  if (!hospitalCheck.ok) return hospitalCheck.response;

  if (normalizeString(job.ownerUserId) !== normalizeString(user.id) && !isAdmin(user)) {
    return res.status(403).json({
      ok: false,
      hata: "Yetkisiz erisim",
    });
  }

  if (
    job.hospitalId &&
    hospitalCheck.hospitalId &&
    normalizeString(job.hospitalId) !== normalizeString(hospitalCheck.hospitalId) &&
    !isAdmin(user)
  ) {
    return res.status(403).json({
      ok: false,
      hata: "Bu job baska bir hastaneye ait",
    });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  try {
    res.write(": connected\n\n");
  } catch {}

  const ok = addClient(req.params.jobId, res);
  if (!ok) {
    return res.status(404).end();
  }

  req.on("close", () => {
    removeClient(req.params.jobId, res);
  });
});

router.get("/job/:jobId", requireAuth, (req, res) => {
  const job = getJobStatus(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      ok: false,
      hata: "Job bulunamadi",
    });
  }

  const hospitalCheck = ensureHospitalContext(req, res);
  if (!hospitalCheck.ok) return hospitalCheck.response;

  const { user, hospitalId } = hospitalCheck;

  if (normalizeString(job.ownerUserId) !== normalizeString(user.id) && !isAdmin(user)) {
    return res.status(403).json({
      ok: false,
      hata: "Yetkisiz erisim",
    });
  }

  if (
    job.hospitalId &&
    hospitalId &&
    normalizeString(job.hospitalId) !== normalizeString(hospitalId) &&
    !isAdmin(user)
  ) {
    return res.status(403).json({
      ok: false,
      hata: "Bu job baska bir hastaneye ait",
    });
  }

  return res.json({
    ok: true,
    job,
  });
});

router.get("/hasta/:tc", requireAuth, async (req, res) => {
  const hospitalCheck = ensureHospitalContext(req, res);
  if (!hospitalCheck.ok) return hospitalCheck.response;

  try {
    const tc = normalizeString(req.params.tc);

    if (!tc) {
      return res.status(400).json({
        ok: false,
        hata: "TC zorunludur",
      });
    }

    if (!/^\d{11}$/.test(tc)) {
      return res.status(400).json({
        ok: false,
        hata: "TC 11 haneli sayi olmalidir",
      });
    }

    let klinik = null;

    try {
      klinik = await klinikVeriTopla(tc, () => {});
    } catch (innerErr) {
      console.error("HASTA GETIR klinikVeriTopla HATA:", innerErr);
      return res.json(buildFallbackHastaPayload(tc, innerErr.message));
    }

    if (!klinik || typeof klinik !== "object") {
      return res.json(buildFallbackHastaPayload(tc, "Bos klinik veri"));
    }

    const hasta = klinik?.hasta || {};

    return res.json({
      ok: true,
      hasta: {
        tc,
        ad: hasta.ad || "Ayşe Demir",
        dogum: hasta.dogum || "01.01.1990",
        cinsiyet: hasta.cinsiyet || "",
      },
      teshisler: Array.isArray(klinik?.teshisler) ? klinik.teshisler : [],
      ilaclar: Array.isArray(klinik?.ilaclar) ? klinik.ilaclar : [],
      labSonuclari: Array.isArray(klinik?.labSonuclari) ? klinik.labSonuclari : [],
      goruntulemeler: Array.isArray(klinik?.goruntulemeler) ? klinik.goruntulemeler : [],
      prosedurler: Array.isArray(klinik?.prosedurler) ? klinik.prosedurler : [],
      klinikOzet: klinik?.klinikOzet || "",
      riskIsaretleri: Array.isArray(klinik?.riskIsaretleri) ? klinik.riskIsaretleri : [],
      doktorNotu: klinik?.birleskNotlar || "",
      kaynak: klinik?.kaynak || "FHIR_MOCK",
    });
  } catch (e) {
    console.error("GET /api/hasta/:tc GENEL HATA:", e);

    const tc = normalizeString(req.params.tc);
    return res.json(buildFallbackHastaPayload(tc || "12345678901", e.message));
  }
});

router.post("/icd-sut-oner", requireAuth, async (req, res) => {
  try {
    const hospitalCheck = ensureHospitalContext(req, res);
    if (!hospitalCheck.ok) return hospitalCheck.response;

    const { doktorNotu, yas, dogum } = req.body;

    if (!doktorNotu) {
      return res.status(400).json({
        ok: false,
        hata: "doktorNotu gerekli",
      });
    }

    const hesaplananYas =
      yas != null && yas !== ""
        ? Number(yas)
        : dogum
          ? yasHesapla(dogum)
          : null;

    const sonuc = islemOner(doktorNotu, {
      yas: hesaplananYas ?? undefined,
    });

    return res.json({
      ok: true,
      veri: {
        doktorNotu: sonuc?.doktorNotu || doktorNotu,
        icd: sonuc?.icd || null,
        icdAdaylari: Array.isArray(sonuc?.icdAdaylari) ? sonuc.icdAdaylari : [],
        confidence: Number(sonuc?.confidence || 0),
        oneriler: Array.isArray(sonuc?.oneriler) ? sonuc.oneriler : [],
        aciklama: sonuc?.aciklama || null,
      },
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      hata: "ICD/SUT önerisi üretilemedi",
      detay: e.message,
    });
  }
});

router.post("/islem-oneri", requireAuth, async (req, res) => {
  try {
    const hospitalCheck = ensureHospitalContext(req, res);
    if (!hospitalCheck.ok) return hospitalCheck.response;

    const { doktorNotu } = req.body;
    const sonuc = islemOner(String(doktorNotu || ""));

    return res.json({
      ok: true,
      oneriler: Array.isArray(sonuc?.oneriler) ? sonuc.oneriler : [],
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      hata: "İşlem önerisi üretilemedi",
      detay: e.message,
    });
  }
});

router.post("/red-tahmin", requireAuth, async (req, res) => {
  try {
    const hospitalCheck = ensureHospitalContext(req, res);
    if (!hospitalCheck.ok) return hospitalCheck.response;

    const {
      tc,
      ad,
      dogum,
      islem_kodu,
      islem_adi,
      provider,
      doktorNotu,
      doktor_notu,
    } = req.body;

    const finalDoktorNotu = doktorNotu || doktor_notu || "";
    const yas = dogum ? yasHesapla(dogum) : null;

    const rapor = await redRiskiAnaliz({
      hasta: {
        tc,
        ad,
        dogum,
        yas: yas ?? undefined,
      },
      islem: {
        kodu: islem_kodu,
        adi: islem_adi,
      },
      provider: provider || null,
      doktorNotu: finalDoktorNotu,
      hospitalId: hospitalCheck.hospitalId,
    });

    return res.json({
      ok: true,
      risk: rapor?.finalRisk ?? null,
      seviye: rapor?.seviye || null,
      oneri: rapor?.oneri || null,
      eksikBelgeler: Array.isArray(rapor?.eksikBelgeler) ? rapor.eksikBelgeler : [],
      nedenler: Array.isArray(rapor?.nedenler) ? rapor.nedenler : [],
      historicalReasons: Array.isArray(rapor?.historicalReasons) ? rapor.historicalReasons : [],
      incelemeGerekli: !!rapor?.incelemeGerekli,
      ogrenmePuani: rapor?.ogrenmePuani ?? null,
      modelMeta: rapor?.modelMeta ?? null,
      historicalRisk: rapor?.historicalRisk ?? null,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      hata: "Canli risk tahmini uretilemedi",
      detay: e.message,
    });
  }
});

router.get("/ai/red-patterns", requireAuth, async (req, res) => {
  try {
    const hospitalCheck = ensureHospitalContext(req, res);
    if (!hospitalCheck.ok) return hospitalCheck.response;

    const summary = await buildRedLearningSummary(hospitalCheck.hospitalId, 5000);

    return res.json({
      ok: true,
      summary,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      hata: "Red pattern özeti üretilemedi",
      detay: e.message,
    });
  }
});

router.post("/ai/risk-check", requireAuth, async (req, res) => {
  try {
    const hospitalCheck = ensureHospitalContext(req, res);
    if (!hospitalCheck.ok) return hospitalCheck.response;

    const {
      islem_kodu,
      provider,
      doktor_notu,
      doktorNotu,
      hasta_yas,
      dogum,
    } = req.body;

    let yas = hasta_yas;
    if ((yas == null || yas === "") && dogum) {
      yas = yasHesapla(dogum);
    }

    const prediction = await getRiskPrediction(
      {
        islem_kodu,
        provider,
        doktor_notu: doktor_notu || doktorNotu || "",
        hasta_yas: yas,
      },
      hospitalCheck.hospitalId
    );

    return res.json({
      ok: true,
      ...prediction,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      hata: "Öğrenen risk tahmini üretilemedi",
      detay: e.message,
    });
  }
});

module.exports = router;