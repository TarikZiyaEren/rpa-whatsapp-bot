const env = require("./env");

function isEnabled(name, defaultValue = true) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value === "true";
}

module.exports = {
  screenshots: isEnabled("FEATURE_SCREENSHOTS", true),
  videoRecording: isEnabled("FEATURE_VIDEO_RECORDING", true),
  selfLearning: isEnabled("FEATURE_SELF_LEARNING", true),
  whatsapp: isEnabled("FEATURE_WHATSAPP", true),
  ivr: isEnabled("FEATURE_IVR", true),
  eImza: isEnabled("FEATURE_E_IMZA", true),
  kvkk: isEnabled("FEATURE_KVKK", true),
  audit: isEnabled("FEATURE_AUDIT", true),
  redOnleme: isEnabled("FEATURE_RED_ONLEME", true),
  redCozum: isEnabled("FEATURE_RED_COZUM", true),
  icdSut: isEnabled("FEATURE_ICD_SUT", true),
  klinikVeri: isEnabled("FEATURE_KLINIK_VERI", true),
};