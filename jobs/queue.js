const env = require("../config/env");
const { calculateDynamicWorkerLimit } = require("./autoScaler");
const provizyonQueue = require("./bullQueue");

let activeWorkers = 0;
let cachedCounts = {
  waiting: 0,
  active: 0,
  delayed: 0,
  failed: 0,
  completed: 0,
};

let metricsStarted = false;
let refreshPromise = null;

function clampNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function refreshCounts() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = provizyonQueue
    .getJobCounts("waiting", "active", "delayed", "failed", "completed")
    .then((counts) => {
      cachedCounts = {
        waiting: clampNumber(counts.waiting, 0),
        active: clampNumber(counts.active, 0),
        delayed: clampNumber(counts.delayed, 0),
        failed: clampNumber(counts.failed, 0),
        completed: clampNumber(counts.completed, 0),
      };

      activeWorkers = cachedCounts.active;
    })
    .catch(() => {
      // sessiz geç
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

function startQueueMetricsPolling() {
  if (metricsStarted) return;
  metricsStarted = true;

  refreshCounts().catch(() => {});

  setInterval(() => {
    refreshCounts().catch(() => {});
  }, 2000).unref?.();
}

function getQueueLength() {
  return cachedCounts.waiting + cachedCounts.delayed;
}

function getActiveWorkers() {
  return Math.max(clampNumber(activeWorkers, 0), clampNumber(cachedCounts.active, 0));
}

function getMaxWorkers() {
  const dynamicLimit = calculateDynamicWorkerLimit(getQueueLength());
  const staticMax = Number(env.MAX_WORKERS) || 1;
  return Math.max(1, Math.min(dynamicLimit, staticMax));
}

function getStaticMaxWorkers() {
  return Number(env.MAX_WORKERS) || 1;
}

function getMinWorkers() {
  return Number(env.MIN_WORKERS) || 1;
}

function canRunNext() {
  return getActiveWorkers() < getMaxWorkers() && getQueueLength() > 0;
}

function workerStarted() {
  activeWorkers += 1;
  return activeWorkers;
}

function workerFinished() {
  activeWorkers = Math.max(0, activeWorkers - 1);
  return activeWorkers;
}

async function peekQueue(limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));

  try {
    const jobs = await provizyonQueue.getJobs(
      ["waiting", "delayed", "prioritized"],
      0,
      safeLimit - 1,
      true
    );

    return jobs.map((job) => ({
      id: String(job.id),
      name: job.name,
      data: job.data || {},
      attemptsMade: job.attemptsMade || 0,
      timestamp: job.timestamp || null,
      delay: job.delay || 0,
      progress: job.progress || 0,
      opts: {
        attempts: job.opts?.attempts || 0,
        priority: job.opts?.priority || 0,
        backoff: job.opts?.backoff || null,
      },
    }));
  } catch {
    return [];
  }
}

async function getDeadLetter(limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));

  try {
    const jobs = await provizyonQueue.getJobs(["failed"], 0, safeLimit - 1, true);

    return jobs.map((job) => ({
      id: String(job.id),
      name: job.name,
      data: job.data || {},
      attemptsMade: job.attemptsMade || 0,
      failedReason: job.failedReason || null,
      finishedOn: job.finishedOn || null,
      processedOn: job.processedOn || null,
      timestamp: job.timestamp || null,
      opts: {
        attempts: job.opts?.attempts || 0,
        priority: job.opts?.priority || 0,
        backoff: job.opts?.backoff || null,
      },
    }));
  } catch {
    return [];
  }
}

async function enqueue(item) {
  const payload = item?.payload ?? item ?? {};
  const jobKey = item?.id ? String(item.id) : undefined;
  const jobName = String(item?.type || "provizyon");
  const attempts = Number.isInteger(item?.maxAttempts) && item.maxAttempts > 0
    ? item.maxAttempts
    : 3;

  const job = await provizyonQueue.add(
    jobName,
    {
      jobId: jobKey || null,
      payload,
      hospitalId: item?.hospitalId ? String(item.hospitalId) : null,
      type: jobName,
    },
    {
      jobId: jobKey,
      priority: Number.isInteger(item?.priority) ? item.priority : 0,
      attempts,
    }
  );

  await refreshCounts();
  return job;
}

async function dequeue() {
  return null;
}

async function requeue(item, errorMessage = null) {
  const payload = item?.payload ?? {};
  const baseId = item?.id ? String(item.id) : `retry-${Date.now()}`;
  const jobName = String(item?.type || "provizyon");
  const attempts = Number.isInteger(item?.maxAttempts) && item.maxAttempts > 0
    ? item.maxAttempts
    : 3;

  const job = await provizyonQueue.add(
    jobName,
    {
      jobId: baseId,
      payload,
      hospitalId: item?.hospitalId ? String(item.hospitalId) : null,
      retryReason: errorMessage || null,
      type: jobName,
    },
    {
      jobId: `${baseId}-retry-${Date.now()}`,
      priority: Number.isInteger(item?.priority) ? item.priority : 0,
      attempts,
    }
  );

  await refreshCounts();
  return job;
}

async function pushDeadLetter(item, errorMessage = null) {
  return {
    id: item?.id || null,
    failedReason: errorMessage || item?.lastError || null,
    data: item?.payload || item || {},
  };
}

async function clearQueue() {
  await provizyonQueue.drain(true);
  await refreshCounts();
}

async function clearDeadLetter() {
  await provizyonQueue.clean(0, 1000, "failed");
  await refreshCounts();
}

startQueueMetricsPolling();

module.exports = {
  enqueue,
  dequeue,
  requeue,
  pushDeadLetter,
  getQueueLength,
  getActiveWorkers,
  getMaxWorkers,
  getStaticMaxWorkers,
  getMinWorkers,
  canRunNext,
  workerStarted,
  workerFinished,
  peekQueue,
  getDeadLetter,
  clearQueue,
  clearDeadLetter,
  refreshCounts,
  startQueueMetricsPolling,
};