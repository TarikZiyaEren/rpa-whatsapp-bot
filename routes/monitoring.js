const express = require("express");
const os = require("os");
const { requireAuth, requireRole } = require("../middleware/auth");
const queueState = require("../jobs/queue");
const { listHistory } = require("../db");
const { getLearningSummary } = require("../ai_learning/learningService");
const {
  buildRedLearningSummary,
  getRiskPrediction,
} = require("../services/redLearningService");
const {
  getTenantModelStatus,
  getTenantInsights,
} = require("../services/tenantModelService");

const router = express.Router();

function safeUpper(value) {
  return String(value || "").toUpperCase();
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(2)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(2)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function getSystemInfo() {
  const memory = process.memoryUsage();

  return {
    uptimeSec: Math.floor(process.uptime()),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    cpuCount: os.cpus()?.length || 0,
    loadAverage: os.loadavg(),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers,
      rssFormatted: formatBytes(memory.rss),
      heapTotalFormatted: formatBytes(memory.heapTotal),
      heapUsedFormatted: formatBytes(memory.heapUsed),
      externalFormatted: formatBytes(memory.external),
      totalMemoryFormatted: formatBytes(os.totalmem()),
      freeMemoryFormatted: formatBytes(os.freemem()),
    },
  };
}

function avg(values) {
  if (!Array.isArray(values) || !values.length) return 0;
  const total = values.reduce((sum, x) => sum + Number(x || 0), 0);
  return total / values.length;
}

function round(value, digits = 2) {
  const n = Number(value || 0);
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function isAdmin(user) {
  return !!user && (
    user.role === "admin" ||
    String(user.username || "").toLowerCase() === "admin"
  );
}

function getEffectiveHospitalId(req) {
  return (
    req.hospital?.id ||
    req.session?.user?.hospitalId ||
    req.session?.user?.hospital_id ||
    null
  );
}

async function getQueueSnapshot() {
  let deadLetter = [];
  let queuedJobs = [];

  try {
    if (typeof queueState.getDeadLetter === "function") {
      const dl = await queueState.getDeadLetter(100);
      deadLetter = Array.isArray(dl) ? dl : [];
    }
  } catch {
    deadLetter = [];
  }

  try {
    if (typeof queueState.peekQueue === "function") {
      const pq = await queueState.peekQueue(100);
      queuedJobs = Array.isArray(pq) ? pq : [];
    }
  } catch {
    queuedJobs = [];
  }

  return {
    activeWorkers:
      typeof queueState.getActiveWorkers === "function"
        ? queueState.getActiveWorkers()
        : 0,
    queued:
      typeof queueState.getQueueLength === "function"
        ? queueState.getQueueLength()
        : 0,
    maxWorkers:
      typeof queueState.getMaxWorkers === "function"
        ? queueState.getMaxWorkers()
        : 0,
    staticMaxWorkers:
      typeof queueState.getStaticMaxWorkers === "function"
        ? queueState.getStaticMaxWorkers()
        : 0,
    minWorkers:
      typeof queueState.getMinWorkers === "function"
        ? queueState.getMinWorkers()
        : 0,
    deadJobs: deadLetter.length,
    queuedJobs,
    deadLetter,
  };
}

async function buildMonitoringData(hospitalId) {
  const history = await listHistory(300, hospitalId);
  const learning = await getLearningSummary(hospitalId);
  const redLearning = await buildRedLearningSummary(hospitalId, 5000);
  const queue = await getQueueSnapshot();

  // ── Tenant Model Bilgisi ──
  let tenantModel = null;
  let tenantInsights = null;
  try {
    tenantModel = await getTenantModelStatus(hospitalId);
    tenantInsights = await getTenantInsights(hospitalId);
  } catch (e) {
    console.warn("[MONITORING] Tenant model verisi alınamadı:", e.message);
  }
  const recent = history.slice(0, 10).map((x) => ({
    id: x.id || null,
    createdAt: x.createdAt || x.time || null,
    sonuc: x.sonuc || null,
    hata: x.hata || x.mesaj || null,
    elapsedMs: x.elapsedMs || null,
    provider: x.provider || x.kaynak || null,
    tc: x.tc || x.tcKimlikNo || null,
    ad: x.ad || x.hastaAdi || null,
    islem_kodu: x.islem_kodu || x.sonucKodu || null,
    islem_adi: x.islem_adi || null,
    ai_risk: x.ai_risk ?? null,
    red_nedeni: x.red_nedeni || null,
  }));

  const onayItems = history.filter((x) => safeUpper(x.sonuc).includes("ONAY"));
  const redItems = history.filter(
    (x) =>
      safeUpper(x.sonuc).includes("RED") &&
      !safeUpper(x.sonuc).includes("ONAY")
  );
  const aiBlokeItems = history.filter((x) =>
    safeUpper(x.sonuc).includes("AI BLOKE")
  );
  const retryItems = history.filter((x) => !!x.retry_kullanildi);
  const retrySuccessItems = history.filter((x) => !!x.retry_basarili);

  const avgElapsedSec = round(
    avg(history.map((x) => Number(x.elapsedMs || 0))) / 1000,
    1
  );

  const avgAiRisk = round(
    avg(history.map((x) => Number(x.ai_risk || 0))),
    2
  );

  const topRedPredictions = [];
  for (const item of history.slice(0, 20)) {
    if (!item.islem_kodu) continue;

    try {
      const pred = await getRiskPrediction(
        {
          islem_kodu: item.islem_kodu,
          provider: item.provider || item.kaynak || null,
          doktor_notu: item.doktor_notu || "",
          hasta_yas: item.hasta_yas || null,
        },
        hospitalId
      );

      topRedPredictions.push({
        id: item.id || null,
        islem_kodu: item.islem_kodu || null,
        provider: item.provider || item.kaynak || null,
        risk: pred.risk,
        seviye: pred.seviye,
        confidence: pred.confidence || 0,
      });
    } catch {
      // sessiz geç
    }
  }

  topRedPredictions.sort((a, b) => Number(b.risk || 0) - Number(a.risk || 0));

  const system = getSystemInfo();

  return {
    status: "ok",
    queue,
    system,
    learning,
    redLearning,
    recent,
    summary: {
      total: history.length,
      onay: onayItems.length,
      red: redItems.length,
      aiBloke: aiBlokeItems.length,
      retryCount: retryItems.length,
      retrySuccess: retrySuccessItems.length,
      retrySuccessRate: retryItems.length
        ? round(retrySuccessItems.length / retryItems.length, 4)
        : 0,
      avgElapsedSec,
      avgAiRisk,
      calibrationError: learning.calibrationError || 0,
      deadJobs: queue.deadJobs,
    },
    insights: {
      redRate: learning.redRate || 0,
      avgRisk: learning.avgRisk || 0,
      calibrationError: learning.calibrationError || 0,
      topRiskyProcedures: redLearning.enRiskliIslemler || [],
      topRiskyProviders: redLearning.enRiskliProviderlar || [],
      topMissingDocuments: redLearning.enSikEksikBelgeler || [],
      topRedReasons: redLearning.enSikRedNedenleri || [],
      ageDistribution: redLearning.yasDagilimi || [],
      keywordPatterns: redLearning.keywordPatternleri || [],
      topRedPredictions: topRedPredictions.slice(0, 10),
    },
    charts: {
      queue: {
        labels: ["Aktif Worker", "Kuyruk", "Maks Worker", "Dead Jobs"],
        values: [
          queue.activeWorkers,
          queue.queued,
          queue.maxWorkers,
          queue.deadJobs,
        ],
      },
      learning: {
        labels: ["Onay", "Red", "Retry Başarı", "AI Bloke"],
        values: [
          onayItems.length,
          redItems.length,
          retrySuccessItems.length,
          aiBlokeItems.length,
        ],
      },
      outcomes: {
        labels: ["ONAY", "RED", "AI BLOKE"],
        values: [onayItems.length, redItems.length, aiBlokeItems.length],
      },
      topRiskyProcedures: {
        labels: (redLearning.enRiskliIslemler || []).slice(0, 5).map((x) => x.kod),
        values: (redLearning.enRiskliIslemler || []).slice(0, 5).map((x) => x.redOrani),
      },
      missingDocuments: {
        labels: (redLearning.enSikEksikBelgeler || []).slice(0, 5).map((x) => x.belge),
        values: (redLearning.enSikEksikBelgeler || []).slice(0, 5).map((x) => x.adet),
      },
      providers: {
        labels: (redLearning.enRiskliProviderlar || []).slice(0, 5).map((x) => x.provider),
        values: (redLearning.enRiskliProviderlar || []).slice(0, 5).map((x) => x.redOrani),
      },
      ageDistribution: {
        labels: (redLearning.yasDagilimi || []).slice(0, 5).map((x) => x.grup),
        values: (redLearning.yasDagilimi || []).slice(0, 5).map((x) => x.redOrani),
      },
      predictionConfidence: {
        labels: topRedPredictions.slice(0, 5).map((x) => x.islem_kodu || "BILINMIYOR"),
        values: topRedPredictions.slice(0, 5).map((x) => x.confidence || 0),
      },
    },
    tenantModel: tenantModel || null,
    tenantInsights: tenantInsights || null,
    generatedAt: new Date().toISOString(),
  };
}

router.get("/health", async (_req, res) => {
  const queue = await getQueueSnapshot();

  return res.json({
    ok: true,
    status: "ok",
    uptimeSec: Math.floor(process.uptime()),
    queue: {
      activeWorkers: queue.activeWorkers,
      queued: queue.queued,
      maxWorkers: queue.maxWorkers,
      deadJobs: queue.deadJobs,
    },
    generatedAt: new Date().toISOString(),
  });
});

router.get("/system", requireAuth, requireRole("dashboard"), (req, res) => {
  return res.json({
    ok: true,
    status: "ok",
    system: getSystemInfo(),
    generatedAt: new Date().toISOString(),
  });
});

router.get("/queue-status", requireAuth, requireRole("dashboard"), async (req, res) => {
  const queue = await getQueueSnapshot();

  return res.json({
    ok: true,
    status: "ok",
    queue,
    generatedAt: new Date().toISOString(),
  });
});

router.get("/metrics", requireAuth, requireRole("dashboard"), async (req, res) => {
  const user = req.session?.user;
  const hospitalId = getEffectiveHospitalId(req);

  if (isAdmin(user) && !hospitalId) {
    return res.status(403).send("Metrics için aktif hastane bağlamı gerekli.");
  }

  if (!hospitalId) {
    return res.status(403).send("Aktif hastane bağlamı bulunamadi.");
  }

  const learning = await getLearningSummary(hospitalId);
  const history = await listHistory(300, hospitalId);
  const queue = await getQueueSnapshot();

  const aiBloke = history.filter((x) =>
    safeUpper(x.sonuc).includes("AI BLOKE")
  ).length;

  res.set("Content-Type", "text/plain; charset=utf-8");
  return res.send(
    [
      `queue_length ${queue.queued}`,
      `active_workers ${queue.activeWorkers}`,
      `max_workers ${queue.maxWorkers}`,
      `dead_jobs ${queue.deadJobs}`,
      `process_uptime_sec ${Math.floor(process.uptime())}`,
      `prediction_avg_risk ${learning.avgRisk || 0}`,
      `prediction_red_rate ${learning.redRate || 0}`,
      `prediction_calibration_error ${learning.calibrationError || 0}`,
      `ai_block_count ${aiBloke}`,
    ].join("\n")
  );
});

router.get("/monitoring", requireAuth, requireRole("dashboard"), async (req, res) => {
  try {
    const user = req.session?.user;
    const hospitalId = getEffectiveHospitalId(req);

    if (isAdmin(user) && !hospitalId) {
      return res.status(403).send("Monitoring için aktif hastane bağlamı gerekli.");
    }

    if (!hospitalId) {
      return res.status(403).send("Aktif hastane bağlamı bulunamadi.");
    }

    const data = await buildMonitoringData(hospitalId);
    return res.render("monitoring", data);
  } catch (err) {
    console.error("Monitoring render hatasi:", err);
    return res.status(500).send(`Monitoring render hatasi: ${err.message}`);
  }
});

router.get("/api/monitoring", requireAuth, requireRole("dashboard"), async (req, res) => {
  try {
    const user = req.session?.user;
    const hospitalId = getEffectiveHospitalId(req);

    if (isAdmin(user) && !hospitalId) {
      return res.status(403).json({
        ok: false,
        hata: "Monitoring için aktif hastane bağlamı gerekli.",
      });
    }

    if (!hospitalId) {
      return res.status(403).json({
        ok: false,
        hata: "Aktif hastane bağlamı bulunamadi.",
      });
    }

    const data = await buildMonitoringData(hospitalId);
    return res.json({ ok: true, ...data });
  } catch (err) {
    console.error("Monitoring API hatasi:", err);
    return res.status(500).json({
      ok: false,
      hata: `Monitoring verisi alinamadi: ${err.message}`,
    });
  }
});

module.exports = router;