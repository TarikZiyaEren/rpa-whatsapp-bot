const env = require("../config/env");

function toNumber(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calculateDynamicWorkerLimit(queueLength) {
  const minWorkers = toNumber(env.MIN_WORKERS, 1);
  const maxWorkers = toNumber(env.MAX_WORKERS, 5);
  const upThreshold = Math.max(1, toNumber(env.SCALE_UP_QUEUE_THRESHOLD, 5));
  const downThreshold = Math.max(1, toNumber(env.SCALE_DOWN_QUEUE_THRESHOLD, 1));

  const q = Math.max(0, Number(queueLength) || 0);

  if (q === 0) {
    return minWorkers;
  }

  const scaleUp = Math.floor(q / upThreshold);
  const scaleDown = q <= downThreshold ? -1 : 0;

  const calculated = minWorkers + scaleUp + scaleDown;

  return clamp(calculated, minWorkers, maxWorkers);
}

function shouldScaleUp(queueLength, activeWorkers) {
  const upThreshold = Math.max(1, Number(env.SCALE_UP_QUEUE_THRESHOLD) || 5);
  const q = Math.max(0, Number(queueLength) || 0);

  if (q === 0) return false;

  return q >= upThreshold && activeWorkers < calculateDynamicWorkerLimit(q);
}

function shouldScaleDown(queueLength, activeWorkers) {
  const minWorkers = toNumber(env.MIN_WORKERS, 1);
  const downThreshold = Math.max(1, Number(env.SCALE_DOWN_QUEUE_THRESHOLD) || 1);
  const q = Math.max(0, Number(queueLength) || 0);

  if (activeWorkers <= minWorkers) return false;

  return q <= downThreshold;
}

module.exports = {
  calculateDynamicWorkerLimit,
  shouldScaleUp,
  shouldScaleDown,
};