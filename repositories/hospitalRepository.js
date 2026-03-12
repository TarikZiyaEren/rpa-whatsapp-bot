const { getDb, saveDb } = require("../db/core");
const { uid, mapExecRows } = require("../db/utils");

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

function normalizePlan(value) {
  const allowed = ["starter", "growth", "enterprise"];
  const v = normalizeText(value).toLowerCase();
  return allowed.includes(v) ? v : "starter";
}

function normalizeStatus(value, fallback = 1) {
  if (value === undefined || value === null || value === "") return fallback ? 1 : 0;
  return Number(value) === 1 ? 1 : 0;
}

function safeExecRows(db, query, params = []) {
  try {
    return mapExecRows(db.exec(query, params));
  } catch (err) {
    console.error("[HOSPITAL REPO] Query hatası:", {
      query,
      params,
      hata: err.message,
    });
    console.error(err.stack);
    return [];
  }
}

async function ensureHospitalSchema() {
  const db = await getDb();

  try {
    db.exec(`SELECT plan FROM hospitals LIMIT 1`);
  } catch {
    console.log("[HOSPITAL REPO] hospitals.plan kolonu ekleniyor");
    db.run(`ALTER TABLE hospitals ADD COLUMN plan TEXT DEFAULT 'starter'`);
  }

  try {
    db.exec(`SELECT updated_at FROM hospitals LIMIT 1`);
  } catch {
    console.log("[HOSPITAL REPO] hospitals.updated_at kolonu ekleniyor");
    db.run(`ALTER TABLE hospitals ADD COLUMN updated_at TEXT`);
  }

  await saveDb();
}

function normalizeHospitalRow(row) {
  return {
    ...row,
    aktif: Number(row.aktif) === 1 ? 1 : 0,
    plan: row.plan || "starter",
    kod: String(row.kod || "").trim(),
  };
}

async function listHospitals() {
  await ensureHospitalSchema();
  const db = await getDb();
  const rows = safeExecRows(db, `SELECT * FROM hospitals ORDER BY ad ASC`);
  const hospitals = rows.map(normalizeHospitalRow);

  console.log("[HOSPITAL REPO] listHospitals:", hospitals.map((h) => ({
    id: h.id,
    ad: h.ad,
    kod: h.kod,
    aktif: h.aktif,
    plan: h.plan,
  })));

  return hospitals;
}

async function getHospitalById(hospitalId) {
  await ensureHospitalSchema();
  const db = await getDb();
  const rows = safeExecRows(db, `SELECT * FROM hospitals WHERE id=?`, [hospitalId]);
  const hospital = rows[0] || null;

  if (!hospital) {
    console.log("[HOSPITAL REPO] getHospitalById bulunamadı:", hospitalId);
    return null;
  }

  const normalized = normalizeHospitalRow(hospital);
  console.log("[HOSPITAL REPO] getHospitalById bulundu:", {
    id: normalized.id,
    ad: normalized.ad,
    kod: normalized.kod,
    aktif: normalized.aktif,
  });

  return normalized;
}

async function getHospitalByCode(kod) {
  await ensureHospitalSchema();
  const db = await getDb();
  const normalizedKod = normalizeCode(kod);

  const rows = safeExecRows(db, `SELECT * FROM hospitals WHERE UPPER(kod)=?`, [normalizedKod]);
  const hospital = rows[0] || null;

  if (!hospital) {
    console.log("[HOSPITAL REPO] getHospitalByCode bulunamadı:", normalizedKod);
    return null;
  }

  const normalized = normalizeHospitalRow(hospital);
  console.log("[HOSPITAL REPO] getHospitalByCode bulundu:", {
    id: normalized.id,
    ad: normalized.ad,
    kod: normalized.kod,
    aktif: normalized.aktif,
  });

  return normalized;
}

async function getDefaultHospital() {
  const hospitals = await listHospitals();
  const aktifler = hospitals.filter((h) => Number(h.aktif) === 1);

  if (aktifler.length === 0) {
    console.warn("[HOSPITAL REPO] Aktif hastane yok");
    return null;
  }

  const varsayilan =
    aktifler.find((h) => String(h.kod || "").trim().toUpperCase() === "DEFAULT") ||
    aktifler[0];

  console.log("[HOSPITAL REPO] Varsayılan hastane:", {
    id: varsayilan?.id || null,
    ad: varsayilan?.ad || null,
    kod: varsayilan?.kod || null,
  });

  return varsayilan || null;
}

async function getHospitalMap() {
  const hospitals = await listHospitals();

  return hospitals.reduce((acc, hospital) => {
    acc[hospital.id] = hospital;
    return acc;
  }, {});
}

async function isHospitalActive(hospitalId) {
  if (!hospitalId) return false;

  const hospital = await getHospitalById(hospitalId);
  if (!hospital) return false;

  return Number(hospital.aktif) === 1;
}

async function updateHospitalStatus(hospitalId, aktif) {
  await ensureHospitalSchema();
  const db = await getDb();

  db.run(
    `UPDATE hospitals SET aktif=?, updated_at=? WHERE id=?`,
    [normalizeStatus(aktif), new Date().toISOString(), hospitalId]
  );

  await saveDb();

  console.log("[HOSPITAL REPO] updateHospitalStatus:", {
    hospitalId,
    aktif: normalizeStatus(aktif),
  });
}

async function updateHospitalPlan(hospitalId, plan) {
  await ensureHospitalSchema();
  const db = await getDb();

  db.run(
    `UPDATE hospitals SET plan=?, updated_at=? WHERE id=?`,
    [normalizePlan(plan), new Date().toISOString(), hospitalId]
  );

  await saveDb();

  console.log("[HOSPITAL REPO] updateHospitalPlan:", {
    hospitalId,
    plan: normalizePlan(plan),
  });
}

async function createHospital(ad, kod, options = {}) {
  await ensureHospitalSchema();
  const db = await getDb();

  const normalizedAd = normalizeText(ad);
  const normalizedKod = normalizeCode(kod);
  const plan = normalizePlan(options.plan);
  const aktif = normalizeStatus(options.aktif, 1);

  if (!normalizedAd) {
    throw new Error("Hastane adı zorunlu.");
  }

  if (!normalizedKod) {
    throw new Error("Hastane kodu zorunlu.");
  }

  const existingByCode = await getHospitalByCode(normalizedKod);
  if (existingByCode) {
    throw new Error("Bu hastane kodu zaten kayıtlı.");
  }

  const id = uid();
  const now = new Date().toISOString();

  db.run(
    `
    INSERT INTO hospitals (id, ad, kod, aktif, plan, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?)
    `,
    [id, normalizedAd, normalizedKod, aktif, plan, now, now]
  );

  await saveDb();

  console.log("[HOSPITAL REPO] createHospital:", {
    id,
    ad: normalizedAd,
    kod: normalizedKod,
    aktif,
    plan,
  });

  return id;
}

module.exports = {
  listHospitals,
  getHospitalById,
  getHospitalByCode,
  getDefaultHospital,
  getHospitalMap,
  isHospitalActive,
  createHospital,
  updateHospitalStatus,
  updateHospitalPlan,
};