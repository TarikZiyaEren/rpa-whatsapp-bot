const { getDb, saveDb } = require("../db/core");
const { uid, mapExecRows } = require("../db/utils");

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function futureIso(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function normalizeTelefon(value) {
  return String(value || "").trim();
}

function normalizeHospitalId(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  return v || null;
}

function safeParseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function cleanupExpiredSessions() {
  const db = await getDb();

  db.run(`DELETE FROM wa_sessions WHERE expires_at <= ?`, [nowIso()]);
  await saveDb();

  console.log("[WA][SESSION] Süresi dolan session'lar temizlendi");
}

async function getSession(telefon) {
  const normalizedTelefon = normalizeTelefon(telefon);

  console.log("[WA][SESSION] getSession çağrıldı:", {
    telefon: normalizedTelefon,
  });

  await cleanupExpiredSessions();

  const db = await getDb();
  const rows = mapExecRows(
    db.exec(`SELECT * FROM wa_sessions WHERE telefon=? LIMIT 1`, [normalizedTelefon])
  );

  const row = rows[0];
  if (!row) {
    console.log("[WA][SESSION] Session bulunamadı:", {
      telefon: normalizedTelefon,
    });
    return null;
  }

  const session = {
    id: row.id,
    telefon: row.telefon,
    hospitalId: row.hospital_id || null,
    adim: row.adim,
    veri: safeParseJson(row.veri_json, {}),
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };

  console.log("[WA][SESSION] Session bulundu:", session);

  return session;
}

async function saveSession(telefon, hospitalId, adim, veri = {}) {
  const db = await getDb();
  const normalizedTelefon = normalizeTelefon(telefon);
  const normalizedHospitalId = normalizeHospitalId(hospitalId);

  console.log("[WA][SESSION] saveSession çağrıldı:", {
    telefon: normalizedTelefon,
    hospitalId: normalizedHospitalId,
    adim,
    veri,
  });

  const existing = mapExecRows(
    db.exec(`SELECT id FROM wa_sessions WHERE telefon=? LIMIT 1`, [normalizedTelefon])
  )[0];

  const payload = [
    normalizedTelefon,
    normalizedHospitalId,
    adim,
    JSON.stringify(veri || {}),
    nowIso(),
    futureIso(SESSION_TIMEOUT_MS),
  ];

  if (existing) {
    db.run(
      `
      UPDATE wa_sessions
      SET telefon=?, hospital_id=?, adim=?, veri_json=?, updated_at=?, expires_at=?
      WHERE id=?
      `,
      [...payload, existing.id]
    );

    console.log("[WA][SESSION] Session güncellendi:", {
      id: existing.id,
      telefon: normalizedTelefon,
    });
  } else {
    const id = uid();

    db.run(
      `
      INSERT INTO wa_sessions (id, telefon, hospital_id, adim, veri_json, updated_at, expires_at)
      VALUES (?,?,?,?,?,?,?)
      `,
      [id, ...payload]
    );

    console.log("[WA][SESSION] Yeni session oluşturuldu:", {
      id,
      telefon: normalizedTelefon,
    });
  }

  await saveDb();
}

async function deleteSession(telefon) {
  const db = await getDb();
  const normalizedTelefon = normalizeTelefon(telefon);

  db.run(`DELETE FROM wa_sessions WHERE telefon=?`, [normalizedTelefon]);
  await saveDb();

  console.log("[WA][SESSION] Session silindi:", {
    telefon: normalizedTelefon,
  });
}

async function clearSessions() {
  const db = await getDb();
  db.run(`DELETE FROM wa_sessions`);
  await saveDb();

  console.log("[WA][SESSION] Tüm session'lar temizlendi");
}

module.exports = {
  getSession,
  saveSession,
  deleteSession,
  cleanupExpiredSessions,
  clearSessions,
};