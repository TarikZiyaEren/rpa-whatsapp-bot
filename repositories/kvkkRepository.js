const { getDb, saveDb } = require("../db/core");
const { uid, mapExecRows } = require("../db/utils");

async function addKvkkLog(row) {
  const db = await getDb();
  const id = uid();

  db.run(
    `
    INSERT INTO kvkk_log (
      id,
      hospital_id,
      time,
      tip,
      aciklama,
      risk_seviyesi,
      tc,
      islem,
      durum
    )
    VALUES (?,?,?,?,?,?,?,?,?)
    `,
    [
      id,
      row.hospital_id ?? null,
      row.time,
      row.tip,
      row.aciklama ?? null,
      row.risk_seviyesi ?? null,
      row.tc ?? null,
      row.islem ?? null,
      row.durum ?? "beklemede",
    ]
  );

  await saveDb();
  return id;
}

async function listKvkkLog(limit = 100, hospitalId = null) {
  const db = await getDb();

  const r = hospitalId
    ? db.exec(
        `SELECT * FROM kvkk_log WHERE hospital_id=? ORDER BY time DESC LIMIT ?`,
        [hospitalId, limit]
      )
    : db.exec(`SELECT * FROM kvkk_log ORDER BY time DESC LIMIT ?`, [limit]);

  return mapExecRows(r);
}

async function kvkkIstatistik(hospitalId = null) {
  const db = await getDb();

  const total = hospitalId
    ? db.exec(`SELECT COUNT(*) FROM kvkk_log WHERE hospital_id=?`, [hospitalId])[0]?.values[0][0] ?? 0
    : db.exec(`SELECT COUNT(*) FROM kvkk_log`)[0]?.values[0][0] ?? 0;

  const yuksek = hospitalId
    ? db.exec(
        `SELECT COUNT(*) FROM kvkk_log WHERE hospital_id=? AND risk_seviyesi='YÜKSEK'`,
        [hospitalId]
      )[0]?.values[0][0] ?? 0
    : db.exec(`SELECT COUNT(*) FROM kvkk_log WHERE risk_seviyesi='YÜKSEK'`)[0]?.values[0][0] ?? 0;

  const orta = hospitalId
    ? db.exec(
        `SELECT COUNT(*) FROM kvkk_log WHERE hospital_id=? AND risk_seviyesi='ORTA'`,
        [hospitalId]
      )[0]?.values[0][0] ?? 0
    : db.exec(`SELECT COUNT(*) FROM kvkk_log WHERE risk_seviyesi='ORTA'`)[0]?.values[0][0] ?? 0;

  const dusuk = hospitalId
    ? db.exec(
        `SELECT COUNT(*) FROM kvkk_log WHERE hospital_id=? AND risk_seviyesi='DÜŞÜK'`,
        [hospitalId]
      )[0]?.values[0][0] ?? 0
    : db.exec(`SELECT COUNT(*) FROM kvkk_log WHERE risk_seviyesi='DÜŞÜK'`)[0]?.values[0][0] ?? 0;

  return {
    total,
    yuksek,
    orta,
    dusuk,
  };
}

module.exports = {
  addKvkkLog,
  listKvkkLog,
  kvkkIstatistik,
};