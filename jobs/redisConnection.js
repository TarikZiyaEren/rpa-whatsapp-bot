const IORedis = require("ioredis");
const env = require("../config/env");

const connection = new IORedis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  db: env.REDIS_DB,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

connection.on("connect", () => {
  console.log("🟢 Redis baglantisi kuruldu");
});

connection.on("error", (err) => {
  console.error("🔴 Redis hatasi:", err.message);
});

module.exports = connection;