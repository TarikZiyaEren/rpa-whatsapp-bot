const fs = require("fs");
const initSqlJs = require("sql.js");

const env = require("../config/env");
const { createTables } = require("./schema");
const { uid } = require("./utils");
const { hashPassword } = require("./crypto");

let SQL;
let db;

function getColumnNames(tableName) {
  const result = db.exec(`PRAGMA table_info(${tableName})`);
  if (!result[0]) return [];
  return result[0].values.map((row) => row[1]);
}

function ensureColumn(tableName, columnName, sqlType) {
  const cols = getColumnNames(tableName);
  if (!cols.includes(columnName)) {
    console.log(`[DB] Kolon ekleniyor: ${tableName}.${columnName} (${sqlType})`);
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlType}`);
  }
}

async function saveDb() {
  if (!db) return;

  try {
    fs.writeFileSync(env.DB_PATH, Buffer.from(db.export()));
    console.log("[DB] Veritabanı kaydedildi:", env.DB_PATH);
  } catch (err) {
    console.error("[DB] saveDb hatası:", err.message);
    throw err;
  }
}

async function ensureDefaultHospital() {
  const existing = db.exec(`SELECT id FROM hospitals WHERE kod='default'`);

  if (existing[0]?.values?.length) {
    const existingId = existing[0].values[0][0];
    console.log("[DB] Default hospital zaten var:", existingId);
    return existingId;
  }

  const hospitalId = uid();

  db.run(
    `INSERT INTO hospitals (id, ad, kod, aktif, created_at) VALUES (?,?,?,?,?)`,
    [hospitalId, "Varsayılan Hastane", "default", 1, new Date().toISOString()]
  );

  console.log("[DB] Default hospital oluşturuldu:", hospitalId);
  return hospitalId;
}

function hospitalExists(hospitalId) {
  if (!hospitalId) return false;
  const r = db.exec(`SELECT id FROM hospitals WHERE id=?`, [hospitalId]);
  return !!r[0]?.values?.length;
}

async function runMigrations(defaultHospitalId) {
  console.log("[DB] Migration başladı...");

  ensureColumn("users", "hospital_id", "TEXT");
  ensureColumn("history", "hospital_id", "TEXT");
  ensureColumn("credentials", "hospital_id", "TEXT");
  ensureColumn("kvkk_log", "hospital_id", "TEXT");
  ensureColumn("randevular", "hospital_id", "TEXT");
  ensureColumn("audit_log", "hospital_id", "TEXT");

  ensureColumn("history", "islem_kodu", "TEXT");
  ensureColumn("history", "islem_adi", "TEXT");
  ensureColumn("history", "hasta_yas", "INTEGER");
  ensureColumn("history", "ai_risk", "REAL");
  ensureColumn("history", "ai_seviye", "TEXT");
  ensureColumn("history", "red_nedeni", "TEXT");
  ensureColumn("history", "eksik_belgeler_json", "TEXT");
  ensureColumn("history", "retry_kullanildi", "INTEGER DEFAULT 0");
  ensureColumn("history", "retry_basarili", "INTEGER DEFAULT 0");
  ensureColumn("history", "retry_yeni_kod", "TEXT");
  ensureColumn("history", "takip_no", "TEXT");
  ensureColumn("history", "provider_response_code", "TEXT");
  ensureColumn("history", "provider_response_message", "TEXT");
  ensureColumn("history", "doktor_notu", "TEXT");
  ensureColumn("history", "icd_kodu", "TEXT");
  ensureColumn("history", "sut_oneri_json", "TEXT");

  const aiFeedbackExists = db.exec(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='ai_feedback'`
  );

  if (aiFeedbackExists[0]?.values?.length) {
    ensureColumn("ai_feedback", "hospital_id", "TEXT");
    ensureColumn("ai_feedback", "hasta_yas", "INTEGER");
    ensureColumn("ai_feedback", "red_nedeni", "TEXT");
    ensureColumn("ai_feedback", "eksik_belgeler_json", "TEXT");
  }

  db.run(`UPDATE users SET hospital_id=NULL WHERE username='admin' OR role='admin'`);

  db.run(
    `UPDATE users
     SET hospital_id=?
     WHERE (hospital_id IS NULL OR hospital_id='')
       AND username != 'admin'
       AND role != 'admin'`,
    [defaultHospitalId]
  );

  const usersResult = db.exec(
    `SELECT id, username, role, hospital_id FROM users WHERE username != 'admin' AND role != 'admin'`
  );

  const users = usersResult[0]?.values || [];
  for (const [userId, _username, _role, hospitalId] of users) {
    if (!hospitalId || !hospitalExists(hospitalId)) {
      db.run(`UPDATE users SET hospital_id=? WHERE id=?`, [defaultHospitalId, userId]);
    }
  }

  db.run(`UPDATE history SET hospital_id=? WHERE hospital_id IS NULL OR hospital_id=''`, [defaultHospitalId]);
  db.run(`UPDATE credentials SET hospital_id=? WHERE hospital_id IS NULL OR hospital_id=''`, [defaultHospitalId]);
  db.run(`UPDATE kvkk_log SET hospital_id=? WHERE hospital_id IS NULL OR hospital_id=''`, [defaultHospitalId]);
  db.run(`UPDATE randevular SET hospital_id=? WHERE hospital_id IS NULL OR hospital_id=''`, [defaultHospitalId]);
  db.run(`UPDATE audit_log SET hospital_id=? WHERE hospital_id IS NULL OR hospital_id=''`, [defaultHospitalId]);

  if (aiFeedbackExists[0]?.values?.length) {
    db.run(`UPDATE ai_feedback SET hospital_id=? WHERE hospital_id IS NULL OR hospital_id=''`, [defaultHospitalId]);
  }

  console.log("[DB] Migration tamamlandı");
}

async function ensureAdminUser() {
  const adminExists = db.exec(`SELECT id FROM users WHERE username='admin'`);

  if (!adminExists[0]?.values?.length) {
    const adminHash = hashPassword(env.ADMIN_PASS);

    db.run(
      `INSERT INTO users (id, hospital_id, username, password_hash, role) VALUES (?,?,?,?,?)`,
      [uid(), null, "admin", adminHash, "admin"]
    );

    console.log("[DB] Admin kullanıcı oluşturuldu");
    return;
  }

  db.run(`UPDATE users SET hospital_id=NULL WHERE username='admin' OR role='admin'`);
  console.log("[DB] Admin kullanıcı kontrolü tamam");
}

async function initDb() {
  if (db) return db;

  try {
    console.log("[DB] SQL.js başlatılıyor...");
    SQL = await initSqlJs();

    const data = fs.existsSync(env.DB_PATH) ? fs.readFileSync(env.DB_PATH) : null;
    db = data ? new SQL.Database(data) : new SQL.Database();

    console.log("[DB] Veritabanı açıldı:", data ? "mevcut dosya" : "yeni veritabanı");

    createTables(db);
    console.log("[DB] createTables tamamlandı");

    const defaultHospitalId = await ensureDefaultHospital();
    await runMigrations(defaultHospitalId);
    await ensureAdminUser();
    await saveDb();

    console.log("[DB] initDb tamamlandı");
    return db;
  } catch (err) {
    console.error("[DB] initDb hatası:", err.message);
    console.error(err.stack);
    throw err;
  }
}

async function getDb() {
  await initDb();
  return db;
}

module.exports = {
  initDb,
  getDb,
  saveDb,
};