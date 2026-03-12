const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const db = require("../db");
const queueState = require("../jobs/queue");
const { getLearningSummary } = require("../ai_learning/learningService");
const {
  buildRedLearningSummary,
  getRiskPrediction,
} = require("../services/redLearningService");

const router = express.Router();

const dbApi = db && db.default ? db.default : db;

const getStats =
  dbApi.getStats ||
  (dbApi.stats && dbApi.stats.getStats) ||
  (dbApi.dashboard && dbApi.dashboard.getStats);

const listHistory =
  dbApi.listHistory ||
  (dbApi.history && dbApi.history.listHistory);

const getDailyCounts =
  dbApi.getDailyCounts ||
  (dbApi.stats && dbApi.stats.getDailyCounts) ||
  (dbApi.dashboard && dbApi.dashboard.getDailyCounts);

function safeUpper(value) {
  return String(value || "").toUpperCase();
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

router.get(
  "/dashboard",
  requireAuth,
  requireRole("dashboard"),
  async (req, res, next) => {
    try {
      const user = req.session?.user;
      const hospitalId = getEffectiveHospitalId(req);

      if (typeof getStats !== "function") {
        throw new Error("db.getStats fonksiyonu bulunamadi");
      }

      if (typeof listHistory !== "function") {
        throw new Error("db.listHistory fonksiyonu bulunamadi");
      }

      if (typeof getDailyCounts !== "function") {
        throw new Error("db.getDailyCounts fonksiyonu bulunamadi");
      }

      if (isAdmin(user) && !hospitalId) {
        return res.status(403).send("Dashboard için aktif hastane bağlamı gerekli.");
      }

      if (!hospitalId) {
        return res.status(403).send("Aktif hastane bağlamı bulunamadi.");
      }

      const [statsRaw, itemsRaw, dailyRaw, learning, redLearning] = await Promise.all([
        getStats(hospitalId),
        listHistory(200, hospitalId),
        getDailyCounts(14, hospitalId),
        getLearningSummary(hospitalId),
        buildRedLearningSummary(hospitalId, 5000),
      ]);

      const stats = statsRaw || { total: 0, ok: 0, fail: 0, red: 0, aiBloke: 0 };
      const items = Array.isArray(itemsRaw) ? itemsRaw : [];
      const daily = Array.isArray(dailyRaw) ? dailyRaw : [];

      const onayItems = items.filter(
        (i) => typeof i.sonuc === "string" && i.sonuc.includes("ONAY")
      );

      const redItems = items.filter(
        (i) =>
          typeof i.sonuc === "string" &&
          safeUpper(i.sonuc).includes("RED") &&
          !safeUpper(i.sonuc).includes("ONAY")
      );

      const aiBlokeItems = items.filter(
        (i) =>
          typeof i.sonuc === "string" && i.sonuc.includes("AI BLOKE")
      );

      const retryItems = items.filter((i) => !!i.retry_kullanildi);
      const retrySuccessItems = items.filter((i) => !!i.retry_basarili);

      const successRate =
        stats.total > 0 ? Math.round((stats.ok / stats.total) * 100) : 0;

      const aiOzet = {
        toplam: items.length,
        onay: onayItems.length,
        red: redItems.length,
        aiBloke: aiBlokeItems.length,
        ortSure: items.length
          ? Math.round(
              items.reduce((a, b) => a + Number(b.elapsedMs || 0), 0) /
                items.length /
                1000
            )
          : 0,
        ortRisk: learning.avgRisk || 0,
        redOrani: learning.redRate || 0,
        retrySuccessRate: retryItems.length
          ? round(retrySuccessItems.length / retryItems.length, 4)
          : 0,
        calibrationError: learning.calibrationError || 0,
      };

      const providerPerformance = (redLearning.providerRiskleri || [])
        .slice(0, 10)
        .map((x) => ({
          provider: x.provider,
          toplam: x.toplam,
          red: x.red,
          onay: x.onay,
          redOrani: x.redOrani,
        }));

      const procedurePerformance = (redLearning.islemRiskleri || [])
        .slice(0, 10)
        .map((x) => ({
          kod: x.kod,
          toplam: x.toplam,
          red: x.red,
          onay: x.onay,
          redOrani: x.redOrani,
        }));

      const topPredictions = [];
      for (const item of items.slice(0, 20)) {
        if (!item.islem_kodu) continue;

        try {
          const prediction = await getRiskPrediction(
            {
              islem_kodu: item.islem_kodu,
              provider: item.provider || item.kaynak || null,
              doktor_notu: item.doktor_notu || "",
              hasta_yas: item.hasta_yas || null,
            },
            hospitalId
          );

          topPredictions.push({
            id: item.id || null,
            islem_kodu: item.islem_kodu,
            provider: item.provider || item.kaynak || null,
            risk: prediction.risk,
            seviye: prediction.seviye,
            confidence: prediction.confidence,
          });
        } catch {
          // sessiz geç
        }
      }

      topPredictions.sort((a, b) => b.risk - a.risk);

      const dashboardCharts = {
        outcomes: {
          labels: ["ONAY", "RED", "AI BLOKE"],
          values: [onayItems.length, redItems.length, aiBlokeItems.length],
        },
        daily: {
          labels: daily.map((x) => x.date || x.day),
          values: daily.map((x) => x.count),
        },
        providers: {
          labels: providerPerformance.slice(0, 5).map((x) => x.provider),
          values: providerPerformance.slice(0, 5).map((x) => x.redOrani),
        },
        procedures: {
          labels: procedurePerformance.slice(0, 5).map((x) => x.kod),
          values: procedurePerformance.slice(0, 5).map((x) => x.redOrani),
        },
      };

      let deadJobsCount = 0;

      try {
        if (typeof queueState.getDeadLetter === "function") {
          const deadLetter = await queueState.getDeadLetter(100);
          deadJobsCount = Array.isArray(deadLetter) ? deadLetter.length : 0;
        }
      } catch {
        deadJobsCount = 0;
      }

      res.render("dashboard", {
        stats,
        items,
        successRate,
        daily,
        aiOzet,
        learning,
        redLearning,
        providerPerformance,
        procedurePerformance,
        topRedReasons: redLearning.enSikRedNedenleri || [],
        topMissingDocuments: redLearning.enSikEksikBelgeler || [],
        keywordPatterns: (redLearning.keywordPatternleri || []).slice(0, 10),
        topPredictions: topPredictions.slice(0, 10),
        dashboardCharts,
        queue: {
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
          deadJobs: deadJobsCount,
        },
      });
    } catch (err) {
      console.error("[Dashboard Route Error]", err);
      next(err);
    }
  }
);

router.get(
  "/history",
  requireAuth,
  requireRole("history"),
  async (req, res, next) => {
    try {
      const user = req.session?.user;
      const hospitalId = getEffectiveHospitalId(req);

      if (typeof listHistory !== "function") {
        throw new Error("db.listHistory fonksiyonu bulunamadi");
      }

      if (isAdmin(user) && !hospitalId) {
        return res.status(403).send("History için aktif hastane bağlamı gerekli.");
      }

      if (!hospitalId) {
        return res.status(403).send("Aktif hastane bağlamı bulunamadi.");
      }

      const itemsRaw = await listHistory(200, hospitalId);
      const items = Array.isArray(itemsRaw) ? itemsRaw : [];

      res.render("history", { items });
    } catch (err) {
      console.error("[History Route Error]", err);
      next(err);
    }
  }
);

router.get("/queue", requireAuth, requireRole("dashboard"), async (req, res) => {
  let deadJobs = 0;
  let queuedJobs = [];

  try {
    if (typeof queueState.getDeadLetter === "function") {
      const dl = await queueState.getDeadLetter(100);
      deadJobs = Array.isArray(dl) ? dl.length : 0;
    }

    if (typeof queueState.peekQueue === "function") {
      const pq = await queueState.peekQueue(100);
      queuedJobs = Array.isArray(pq) ? pq : [];
    }
  } catch {
    deadJobs = 0;
    queuedJobs = [];
  }

  res.json({
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
        : undefined,
    minWorkers:
      typeof queueState.getMinWorkers === "function"
        ? queueState.getMinWorkers()
        : undefined,
    deadJobs,
    queuedJobs,
  });
});

// ── Live Dashboard API (auto-refresh için) ─────────────────────────────
router.get(
  "/api/dashboard/live",
  requireAuth,
  requireRole("dashboard"),
  async (req, res) => {
    try {
      const hospitalId = getEffectiveHospitalId(req);
      if (!hospitalId) return res.json({ ok: false });

      const [statsRaw, itemsRaw] = await Promise.all([
        typeof getStats === "function" ? getStats(hospitalId) : null,
        typeof listHistory === "function" ? listHistory(5, hospitalId) : [],
      ]);

      const stats = statsRaw || { total: 0, ok: 0, fail: 0, red: 0, aiBloke: 0 };
      const items = Array.isArray(itemsRaw) ? itemsRaw : [];
      const successRate = stats.total > 0 ? Math.round((stats.ok / stats.total) * 100) : 0;

      // Kuyruk durumu
      let queue = { activeWorkers: 0, queued: 0, maxWorkers: 0, deadJobs: 0 };
      try {
        queue.activeWorkers = typeof queueState.getActiveWorkers === "function" ? queueState.getActiveWorkers() : 0;
        queue.queued = typeof queueState.getQueueLength === "function" ? queueState.getQueueLength() : 0;
        queue.maxWorkers = typeof queueState.getMaxWorkers === "function" ? queueState.getMaxWorkers() : 0;
        if (typeof queueState.getDeadLetter === "function") {
          const dl = await queueState.getDeadLetter(100);
          queue.deadJobs = Array.isArray(dl) ? dl.length : 0;
        }
      } catch {}

      // Sistem sağlığı
      const uptime = process.uptime();
      const memUsage = process.memoryUsage();
      const system = {
        uptimeSaat: round(uptime / 3600, 1),
        uptimeDk: Math.round(uptime / 60),
        memoryMB: round(memUsage.heapUsed / 1024 / 1024, 1),
        memoryTotalMB: round(memUsage.heapTotal / 1024 / 1024, 1),
        cpuUsage: round(process.cpuUsage().user / 1000000, 2),
        nodeVersion: process.version,
        platform: process.platform,
      };

      // Son 5 işlem
      const sonIslemler = items.map((item) => ({
        zaman: item.createdAt || item.time || null,
        tc: "*******" + String(item.tcKimlikNo || item.tc || "").slice(-4),
        islem: item.islem_kodu || item.provizyonTipi || "-",
        sonuc: String(item.sonuc || "").toUpperCase(),
        sure: item.elapsedMs ? round(Number(item.elapsedMs) / 1000, 2) : null,
        risk: item.ai_risk ? round(Number(item.ai_risk) * 100, 0) : null,
      }));

      res.json({
        ok: true,
        ts: Date.now(),
        stats: {
          total: stats.total || 0,
          ok: stats.ok || 0,
          red: stats.red || 0,
          aiBloke: stats.aiBloke || 0,
          successRate,
        },
        queue,
        system,
        sonIslemler,
      });
    } catch (err) {
      console.error("[Live Dashboard Error]", err.message);
      res.json({ ok: false, error: err.message });
    }
  }
);

module.exports = router;