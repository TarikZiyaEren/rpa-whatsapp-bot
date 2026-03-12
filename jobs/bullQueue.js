const { Queue } = require("bullmq");
const connection = require("./redisConnection");

const QUEUE_NAME = "provizyon";

const provizyonQueue = new Queue(QUEUE_NAME, {
  connection,

  defaultJobOptions: {
    attempts: 3,

    backoff: {
      type: "exponential",
      delay: 2000,
    },

    removeOnComplete: {
      age: 3600,     // 1 saat sonra sil
      count: 1000,   // max 1000 job sakla
    },

    removeOnFail: {
      age: 24 * 3600, // 24 saat sakla
    },
  },
});

console.log("📦 BullMQ Queue hazır:", QUEUE_NAME);

module.exports = provizyonQueue;