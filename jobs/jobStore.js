const jobs = new Map();

function nowIso() {
  return new Date().toISOString();
}

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  return v || null;
}

function createJob(ownerUserId, hospitalId = null, meta = {}) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  jobs.set(id, {
    id,
    ownerUserId: normalizeId(ownerUserId),
    hospitalId: normalizeId(hospitalId),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: [],
    clients: new Set(),
    done: false,
    status: "queued",
    result: null,
    error: null,
    meta: meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {},
  });

  return id;
}

function getJob(jobId) {
  return jobs.get(String(jobId || "")) || null;
}

function getJobStatus(jobId) {
  const job = getJob(jobId);
  if (!job) return null;

  return {
    id: job.id,
    ownerUserId: job.ownerUserId,
    hospitalId: job.hospitalId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    messages: [...job.messages],
    done: job.done,
    status: job.status,
    result: job.result,
    error: job.error,
    meta: job.meta,
  };
}

function deleteJob(jobId) {
  jobs.delete(String(jobId || ""));
}

function listJobs(limit = 100, hospitalId = null) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 1000));
  const normalizedHospitalId = normalizeId(hospitalId);

  let items = Array.from(jobs.values());

  if (normalizedHospitalId) {
    items = items.filter(
      (job) => normalizeId(job.hospitalId) === normalizedHospitalId
    );
  }

  return items
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, safeLimit)
    .map((job) => ({
      id: job.id,
      ownerUserId: job.ownerUserId,
      hospitalId: job.hospitalId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      done: job.done,
      status: job.status,
      error: job.error,
      meta: job.meta,
    }));
}

function formatLogLine(msg) {
  return `[${new Date().toLocaleTimeString("tr-TR")}] ${String(msg || "")}`;
}

function safeWrite(res, eventName, payload) {
  try {
    if (eventName) {
      res.write(`event: ${eventName}\n`);
    }
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function notifyClients(job, eventName, payload, endAfterWrite = false) {
  if (!job || !job.clients || !job.clients.size) return;

  const deadClients = [];

  for (const res of job.clients) {
    const ok = safeWrite(res, eventName, payload);

    if (!ok) {
      deadClients.push(res);
      continue;
    }

    if (endAfterWrite) {
      try {
        res.end();
      } catch {}
      deadClients.push(res);
    }
  }

  for (const res of deadClients) {
    job.clients.delete(res);
  }
}

function updateJobStatus(jobId, status) {
  const job = getJob(jobId);
  if (!job) return null;

  job.status = String(status || "queued");
  job.updatedAt = nowIso();
  return job;
}

function startJob(jobId) {
  const job = getJob(jobId);
  if (!job) return null;

  job.status = "running";
  job.updatedAt = nowIso();

  notifyClients(job, "status", {
    type: "status",
    status: job.status,
    done: job.done,
    updatedAt: job.updatedAt,
  });

  return job;
}

function pushLog(jobId, msg) {
  const job = getJob(jobId);
  if (!job) return;

  const line = formatLogLine(msg);
  job.messages.push(line);
  job.updatedAt = nowIso();

  notifyClients(job, "log", {
    type: "log",
    message: line,
    line,
    updatedAt: job.updatedAt,
  });
}

function failJob(jobId, error) {
  const job = getJob(jobId);
  if (!job) return;

  job.done = true;
  job.status = "failed";
  job.error = error ? String(error) : "Bilinmeyen hata";
  job.updatedAt = nowIso();

  notifyClients(
    job,
    "failed",
    {
      type: "failed",
      error: job.error,
      updatedAt: job.updatedAt,
    },
    true
  );

  setTimeout(() => {
    deleteJob(jobId);
  }, 10 * 60 * 1000);
}

function finishJob(jobId, result) {
  const job = getJob(jobId);
  if (!job) return;

  job.done = true;
  job.status = "done";
  job.result = result || null;
  job.error = null;
  job.updatedAt = nowIso();

  const finalResult = {
    ...(result || {}),
    finalIslem: result?.finalIslem || null,
    klinikVeri: result?.klinikVeri || null,
    aiContext: result?.aiContext || null,
    imzaKaydi: result?.imzaKaydi || null,
    retryBilgi: result?.retryBilgi || null,
    redCozum: result?.redCozum || null,
    rapor: result?.rapor || null,
  };

  notifyClients(
    job,
    "done",
    {
      type: "done",
      result: finalResult,
      updatedAt: job.updatedAt,
    },
    true
  );

  setTimeout(() => {
    deleteJob(jobId);
  }, 10 * 60 * 1000);
}

function addClient(jobId, res) {
  const job = getJob(jobId);
  if (!job) return false;

  job.clients.add(res);

  try {
    res.write(`retry: 3000\n`);
    res.write(`: connected\n\n`);
  } catch {}

  for (const line of job.messages) {
    const ok = safeWrite(res, "log", {
      type: "log",
      message: line,
      line,
      updatedAt: job.updatedAt,
    });

    if (!ok) {
      job.clients.delete(res);
      return false;
    }
  }

  const statusOk = safeWrite(res, "status", {
    type: "status",
    status: job.status,
    done: job.done,
    updatedAt: job.updatedAt,
  });

  if (!statusOk) {
    job.clients.delete(res);
    return false;
  }

  if (job.done && job.status === "done") {
    const finalResult = {
      ...(job.result || {}),
      finalIslem: job.result?.finalIslem || null,
      klinikVeri: job.result?.klinikVeri || null,
      aiContext: job.result?.aiContext || null,
      imzaKaydi: job.result?.imzaKaydi || null,
      retryBilgi: job.result?.retryBilgi || null,
      redCozum: job.result?.redCozum || null,
      rapor: job.result?.rapor || null,
    };

    safeWrite(res, "done", {
      type: "done",
      result: finalResult,
      updatedAt: job.updatedAt,
    });

    try {
      res.end();
    } catch {}

    job.clients.delete(res);
    return true;
  }

  if (job.done && job.status === "failed") {
    safeWrite(res, "failed", {
      type: "failed",
      error: job.error,
      updatedAt: job.updatedAt,
    });

    try {
      res.end();
    } catch {}

    job.clients.delete(res);
    return true;
  }

  return true;
}

function removeClient(jobId, res) {
  const job = getJob(jobId);
  if (!job) return;

  job.clients.delete(res);
}

module.exports = {
  createJob,
  getJob,
  getJobStatus,
  deleteJob,
  listJobs,
  updateJobStatus,
  startJob,
  pushLog,
  failJob,
  finishJob,
  addClient,
  removeClient,
};