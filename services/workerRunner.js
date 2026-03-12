const queue = require("../jobs/queue");
const { startJob, finishJob, failJob, pushLog } = require("../jobs/jobStore");

let running = false;

async function processJob(job) {
  try {
    startJob(job.id);

    pushLog(job.id, "Job başlatıldı");

    // burada gerçek bot işlemi çalışacak
    // örnek:
    if (typeof job.handler === "function") {
      const result = await job.handler(job.payload, job);
      pushLog(job.id, "Job tamamlandı");
      finishJob(job.id, result);
    } else {
      pushLog(job.id, "Handler bulunamadı");
      finishJob(job.id, { ok: true });
    }

  } catch (err) {
    pushLog(job.id, `HATA: ${err.message}`);
    failJob(job.id, err.message);
  } finally {
    queue.workerFinished();
  }
}

async function workerLoop() {
  if (running) return;
  running = true;

  while (true) {
    try {
      if (!queue.canRunNext()) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      const job = queue.dequeue();
      if (!job) continue;

      queue.workerStarted();
      processJob(job);

    } catch (err) {
      console.error("Worker loop error:", err);
    }
  }
}

function startWorkers() {
  workerLoop();
}

module.exports = {
  startWorkers,
};