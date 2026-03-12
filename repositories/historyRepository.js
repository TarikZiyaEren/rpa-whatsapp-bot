const crypto = require("crypto");
const { initDb, saveDb } = require("../db/core");

function ensureHistory(db) {
  if (!Array.isArray(db.history)) {
    db.history = [];
  }
}

function normalizeHospitalId(hospitalId) {
  if (hospitalId === null || hospitalId === undefined) {
    return null;
  }

  const normalized = String(hospitalId).trim();
  return normalized || null;
}

function assertHospitalId(hospitalId) {
  const normalized = normalizeHospitalId(hospitalId);

  if (!normalized) {
    throw new Error("historyRepository: hospitalId zorunludur.");
  }

  return normalized;
}

function normalizePositiveInt(value, fallback, max) {
  const num = Number(value);

  if (!Number.isInteger(num) || num <= 0) {
    return fallback;
  }

  return Math.min(num, max);
}

function normalizeHistoryItem(item) {
  if (!item || typeof item !== "object") {
    throw new Error("historyRepository: gecerli bir history kaydi gerekli.");
  }

  return {
    hastaAdi: item.hastaAdi ?? null,
    tcKimlikNo: item.tcKimlikNo ?? null,
    provizyonTipi: item.provizyonTipi ?? null,
    brans: item.brans ?? null,
    doktor: item.doktor ?? null,
    sonuc: item.sonuc ?? null,
    sonucKodu: item.sonucKodu ?? null,
    mesaj: item.mesaj ?? null,
    hata: item.hata ?? null,
    kaynak: item.kaynak ?? null,
    provider: item.provider ?? null,

    islem_kodu: item.islem_kodu ?? null,
    islem_adi: item.islem_adi ?? null,

    elapsedMs: Number.isFinite(Number(item.elapsedMs)) ? Number(item.elapsedMs) : null,
    needsHuman: !!item.needsHuman,

    hasta_yas: Number.isFinite(Number(item.hasta_yas)) ? Number(item.hasta_yas) : null,
    ai_risk: item.ai_risk != null && item.ai_risk !== "" ? Number(item.ai_risk) : null,
    ai_seviye: item.ai_seviye ?? null,

    red_nedeni: item.red_nedeni ?? null,
    eksik_belgeler_json: item.eksik_belgeler_json ?? "[]",

    retry_kullanildi: !!item.retry_kullanildi,
    retry_basarili: !!item.retry_basarili,
    retry_yeni_kod: item.retry_yeni_kod ?? null,

    takip_no: item.takip_no ?? null,
    provider_response_code: item.provider_response_code ?? null,
    provider_response_message: item.provider_response_message ?? null,

    doktor_notu: item.doktor_notu ?? null,
    icd_kodu: item.icd_kodu ?? null,
    sut_oneri_json: item.sut_oneri_json ?? "[]",

    metadata:
      item.metadata && typeof item.metadata === "object"
        ? item.metadata
        : {},
  };
}

function filterByHospital(items, hospitalId) {
  const normalizedHospitalId = assertHospitalId(hospitalId);
  return items.filter((x) => String(x.hospitalId || "").trim() === normalizedHospitalId);
}

function sortByCreatedAtDesc(items) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

/**
 * Tenant-safe kayıt ekleme
 * hospitalId ZORUNLU
 */
async function addHistory(item, hospitalId) {
  const normalizedHospitalId = assertHospitalId(hospitalId);

  const db = await initDb();
  ensureHistory(db);

  const safeItem = normalizeHistoryItem(item);

  const record = {
    id: crypto.randomUUID(),
    hospitalId: normalizedHospitalId,
    createdAt: new Date().toISOString(),
    ...safeItem,
  };

  db.history.unshift(record);
  await saveDb(db);

  return record;
}

/**
 * Tenant-safe listeleme
 * hospitalId ZORUNLU
 */
async function listHistory(limit = 30, hospitalId) {
  const normalizedHospitalId = assertHospitalId(hospitalId);

  const db = await initDb();
  ensureHistory(db);

  const safeLimit = normalizePositiveInt(limit, 30, 500);
  const items = filterByHospital(db.history, normalizedHospitalId);

  return sortByCreatedAtDesc(items).slice(0, safeLimit);
}

/**
 * Tenant-safe istatistik
 * hospitalId ZORUNLU
 */
async function getStats(hospitalId) {
  const normalizedHospitalId = assertHospitalId(hospitalId);

  const db = await initDb();
  ensureHistory(db);

  const items = filterByHospital(db.history, normalizedHospitalId);

  const total = items.length;
  const ok = items.filter(
    (x) => typeof x.sonuc === "string" && x.sonuc.toUpperCase().includes("ONAY")
  ).length;

  const red = items.filter(
    (x) =>
      typeof x.sonuc === "string" &&
      x.sonuc.toUpperCase().includes("RED") &&
      !x.sonuc.toUpperCase().includes("ONAY")
  ).length;

  const aiBloke = items.filter(
    (x) => typeof x.sonuc === "string" && x.sonuc.toUpperCase().includes("AI BLOKE")
  ).length;

  return {
    total,
    ok,
    red,
    aiBloke,
    fail: total - ok,
  };
}

/**
 * Tenant-safe günlük sayımlar
 * hospitalId ZORUNLU
 */
async function getDailyCounts(days = 7, hospitalId) {
  const normalizedHospitalId = assertHospitalId(hospitalId);

  const db = await initDb();
  ensureHistory(db);

  const safeDays = normalizePositiveInt(days, 7, 365);
  const items = filterByHospital(db.history, normalizedHospitalId);

  const result = [];
  const now = new Date();

  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const day = `${yyyy}-${mm}-${dd}`;

    const count = items.filter((x) => {
      if (!x.createdAt) return false;
      return String(x.createdAt).slice(0, 10) === day;
    }).length;

    result.push({
      date: day,
      count,
    });
  }

  return result;
}

/**
 * Sadece admin/debug için kullan.
 * Uygulama normal akışında bunu route'lara açma.
 */
async function listAllHistory(limit = 100) {
  const db = await initDb();
  ensureHistory(db);

  const safeLimit = normalizePositiveInt(limit, 100, 1000);
  return sortByCreatedAtDesc(db.history).slice(0, safeLimit);
}

module.exports = {
  addHistory,
  listHistory,
  getStats,
  getDailyCounts,
  listAllHistory,
};