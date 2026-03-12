const { getDb, saveDb } = require("../db/core");
const { uid, mapExecRows } = require("../db/utils");

async function ensureLearningTable() {
  const db = await getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS ai_feedback (
      id TEXT PRIMARY KEY,
      hospital_id TEXT,
      time TEXT NOT NULL,
      tc TEXT,
      hasta_ad TEXT,
      hasta_yas INTEGER,
      islem_kodu TEXT,
      islem_adi TEXT,
      doktor_notu TEXT,
      ai_risk REAL,
      ai_seviye TEXT,
      ai_oneri TEXT,
      sonuc TEXT,
      hata_kodu TEXT,
      hata_mesaji TEXT,
      red_nedeni TEXT,
      eksik_belgeler_json TEXT,
      retry_kullanildi INTEGER DEFAULT 0,
      retry_yeni_kod TEXT,
      retry_basarili INTEGER DEFAULT 0,
      provider TEXT
    );
  `);

  const cols = db.exec(`PRAGMA table_info(ai_feedback)`);
  const columnNames = cols[0]?.values?.map((row) => row[1]) || [];

  const requiredColumns = [
    { name: "hospital_id", type: "TEXT" },
    { name: "hasta_yas", type: "INTEGER" },
    { name: "red_nedeni", type: "TEXT" },
    { name: "eksik_belgeler_json", type: "TEXT" },
  ];

  let changed = false;

  for (const col of requiredColumns) {
    if (!columnNames.includes(col.name)) {
      db.run(`ALTER TABLE ai_feedback ADD COLUMN ${col.name} ${col.type}`);
      changed = true;
    }
  }

  if (changed) {
    await saveDb();
  }
}

async function addFeedback(row) {
  await ensureLearningTable();
  const db = await getDb();

  db.run(
    `
    INSERT INTO ai_feedback (
      id,
      hospital_id,
      time,
      tc,
      hasta_ad,
      hasta_yas,
      islem_kodu,
      islem_adi,
      doktor_notu,
      ai_risk,
      ai_seviye,
      ai_oneri,
      sonuc,
      hata_kodu,
      hata_mesaji,
      red_nedeni,
      eksik_belgeler_json,
      retry_kullanildi,
      retry_yeni_kod,
      retry_basarili,
      provider
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `,
    [
      uid(),
      row.hospital_id ?? null,
      row.time,
      row.tc ?? null,
      row.hasta_ad ?? null,
      row.hasta_yas ?? null,
      row.islem_kodu ?? null,
      row.islem_adi ?? null,
      row.doktor_notu ?? null,
      row.ai_risk ?? null,
      row.ai_seviye ?? null,
      row.ai_oneri ?? null,
      row.sonuc ?? null,
      row.hata_kodu ?? null,
      row.hata_mesaji ?? null,
      row.red_nedeni ?? null,
      row.eksik_belgeler_json ?? null,
      row.retry_kullanildi ? 1 : 0,
      row.retry_yeni_kod ?? null,
      row.retry_basarili ? 1 : 0,
      row.provider ?? null,
    ]
  );

  await saveDb();
}

async function listFeedback(limit = 200, hospitalId = null) {
  await ensureLearningTable();
  const db = await getDb();

  const r = hospitalId
    ? db.exec(
        `SELECT * FROM ai_feedback WHERE hospital_id=? ORDER BY time DESC LIMIT ?`,
        [hospitalId, limit]
      )
    : db.exec(`SELECT * FROM ai_feedback ORDER BY time DESC LIMIT ?`, [limit]);

  return mapExecRows(r);
}

module.exports = {
  ensureLearningTable,
  addFeedback,
  listFeedback,
};