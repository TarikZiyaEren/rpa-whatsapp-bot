const { getDb, saveDb } = require("../db/core");
const { uid } = require("../db/utils");
const { hashPassword, verifyPassword } = require("../db/crypto");

function isAdminIdentity(user) {
  return (
    user &&
    (
      user.role === "admin" ||
      String(user.username || "").toLowerCase() === "admin"
    )
  );
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function normalizeRole(role) {
  const allowed = ["admin", "operator", "viewer", "kvkk_officer"];
  const value = String(role || "operator").trim().toLowerCase();
  return allowed.includes(value) ? value : "operator";
}

function normalizeHospitalId(hospitalId) {
  const value = String(hospitalId || "").trim();
  return value || null;
}

async function ensureUserSchema() {
  const db = await getDb();

  try {
    db.exec(`SELECT created_at FROM users LIMIT 1`);
  } catch {
    db.run(`ALTER TABLE users ADD COLUMN created_at TEXT`);
  }

  try {
    db.exec(`SELECT updated_at FROM users LIMIT 1`);
  } catch {
    db.run(`ALTER TABLE users ADD COLUMN updated_at TEXT`);
  }

  try {
    db.exec(`SELECT aktif FROM users LIMIT 1`);
  } catch {
    db.run(`ALTER TABLE users ADD COLUMN aktif INTEGER DEFAULT 1`);
  }

  await saveDb();
}

async function findUser(username) {
  await ensureUserSchema();
  const db = await getDb();
  const normalizedUsername = normalizeUsername(username);

  const r = db.exec(`SELECT * FROM users WHERE lower(username)=?`, [normalizedUsername]);

  if (!r[0]?.values?.length) return null;

  const row = r[0].values[0];

  const user = {
    id: row[0],
    hospital_id: row[1],
    username: row[2],
    password_hash: row[3],
    role: row[4],
  };

  if (row.length > 5) user.created_at = row[5] || null;
  if (row.length > 6) user.updated_at = row[6] || null;
  if (row.length > 7) user.aktif = Number(row[7]) === 1 ? 1 : 0;
  else user.aktif = 1;

  return user;
}

async function verifyUser(username, password) {
  const user = await findUser(username);
  if (!user) return null;
  if (Number(user.aktif) !== 1) return null;

  return verifyPassword(password, user.password_hash) ? user : null;
}

async function listUsers(hospitalId = null) {
  await ensureUserSchema();
  const db = await getDb();
  const normalizedHospitalId = normalizeHospitalId(hospitalId);

  const r = normalizedHospitalId
    ? db.exec(
        `
        SELECT id, hospital_id, username, role, created_at, updated_at, aktif
        FROM users
        WHERE hospital_id=?
        ORDER BY username
        `,
        [normalizedHospitalId]
      )
    : db.exec(
        `
        SELECT id, hospital_id, username, role, created_at, updated_at, aktif
        FROM users
        ORDER BY username
        `
      );

  if (!r[0]) return [];

  return r[0].values.map(
    ([id, hospital_id, username, role, created_at, updated_at, aktif]) => ({
      id,
      hospital_id,
      username,
      role,
      created_at: created_at || null,
      updated_at: updated_at || null,
      aktif: Number(aktif) === 1 ? 1 : 0,
    })
  );
}

async function getUserById(userId) {
  await ensureUserSchema();
  const db = await getDb();
  const r = db.exec(
    `
    SELECT id, hospital_id, username, role, created_at, updated_at, aktif
    FROM users
    WHERE id=?
    `,
    [userId]
  );

  if (!r[0]?.values?.length) return null;

  const [id, hospital_id, username, role, created_at, updated_at, aktif] = r[0].values[0];

  return {
    id,
    hospital_id,
    username,
    role,
    created_at: created_at || null,
    updated_at: updated_at || null,
    aktif: Number(aktif) === 1 ? 1 : 0,
  };
}

async function createUser(username, password, role = "operator", hospitalId = null) {
  await ensureUserSchema();
  const db = await getDb();

  const normalizedUsername = normalizeUsername(username);
  const normalizedRole = normalizeRole(role);
  const normalizedHospitalId = normalizeHospitalId(hospitalId);
  const now = new Date().toISOString();

  if (!normalizedUsername) {
    throw new Error("Kullanıcı adı zorunlu.");
  }

  if (!password || !String(password).trim()) {
    throw new Error("Şifre zorunlu.");
  }

  const existing = await findUser(normalizedUsername);
  if (existing) {
    throw new Error("Bu kullanıcı adı zaten kayıtlı.");
  }

  if (!normalizedHospitalId) {
    throw new Error("Kullanıcı için hastane seçmek zorunlu.");
  }

  const hash = hashPassword(password);

  db.run(
    `
    INSERT INTO users (
      id,
      hospital_id,
      username,
      password_hash,
      role,
      created_at,
      updated_at,
      aktif
    )
    VALUES (?,?,?,?,?,?,?,?)
    `,
    [uid(), normalizedHospitalId, normalizedUsername, hash, normalizedRole, now, now, 1]
  );

  await saveDb();
}

async function updateUserHospital(userId, hospitalId) {
  await ensureUserSchema();
  const db = await getDb();
  const user = await getUserById(userId);
  const normalizedHospitalId = normalizeHospitalId(hospitalId);

  if (!user) {
    throw new Error("Kullanıcı bulunamadı.");
  }

  if (!normalizedHospitalId) {
    throw new Error("Yeni hastane seçmek zorunlu.");
  }

  db.run(
    `UPDATE users SET hospital_id=?, updated_at=? WHERE id=?`,
    [normalizedHospitalId, new Date().toISOString(), userId]
  );

  await saveDb();
}

async function updateUserStatus(userId, aktif) {
  await ensureUserSchema();
  const db = await getDb();
  const user = await getUserById(userId);

  if (!user) {
    throw new Error("Kullanıcı bulunamadı.");
  }

  if (isAdminIdentity(user) && Number(aktif) !== 1) {
    throw new Error("Admin kullanıcısı pasifleştirilemez.");
  }

  db.run(
    `UPDATE users SET aktif=?, updated_at=? WHERE id=?`,
    [Number(aktif) === 1 ? 1 : 0, new Date().toISOString(), userId]
  );

  await saveDb();
}

async function updateUserRole(userId, role) {
  await ensureUserSchema();
  const db = await getDb();
  const user = await getUserById(userId);

  if (!user) {
    throw new Error("Kullanıcı bulunamadı.");
  }

  const normalizedRole = normalizeRole(role);

  if (isAdminIdentity(user) && normalizedRole !== "admin") {
    throw new Error("Admin kullanıcısının rolü değiştirilemez.");
  }

  db.run(
    `UPDATE users SET role=?, updated_at=? WHERE id=?`,
    [normalizedRole, new Date().toISOString(), userId]
  );

  await saveDb();
}

async function deleteUser(userId) {
  const db = await getDb();
  const user = await getUserById(userId);

  if (!user) {
    throw new Error("Kullanıcı bulunamadı.");
  }

  if (isAdminIdentity(user)) {
    throw new Error("Admin kullanıcısı silinemez.");
  }

  db.run(`DELETE FROM users WHERE id=?`, [userId]);
  await saveDb();
}

module.exports = {
  findUser,
  verifyUser,
  listUsers,
  getUserById,
  createUser,
  updateUserHospital,
  updateUserStatus,
  updateUserRole,
  deleteUser,
};