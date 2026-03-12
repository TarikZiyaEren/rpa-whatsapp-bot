const { Worker } = require("bullmq");
const connection = require("../jobs/redisConnection");
const { processProvizyonJob } = require("../services/jobRunner");

const QUEUE_NAME = "provizyon";

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {

    const { jobId, payload } = job.data || {};

    if (!jobId || !payload) {
      throw new Error("Geçersiz job payload.");
    }

    try {

      await processProvizyonJob(jobId, payload);

    } catch (err) {

      console.error("❌ Job işlem hatası:", err.message);

      // hatayı tekrar fırlat ki bullmq job fail olarak işlesin
      throw err;
    }

  },
  {
    connection,
    concurrency: 5,
    removeOnComplete: true,
    removeOnFail: false,
  }
);


worker.on("completed", (job) => {

  const { jobId } = job.data || {};

  console.log("✅ Worker tamamladı:", jobId || job.id);

});


worker.on("failed", (job, err) => {

  const { jobId } = job.data || {};

  console.error("❌ Worker hata:", jobId || job.id, err?.message);

});


worker.on("error", (err) => {

  console.error("⚠️ Worker sistem hatası:", err);

});


console.log("🚀 Provizyon worker başlatıldı");


module.exports = worker;