const { getDb, saveDb } = require("../db/core");
const { uid, mapExecRows } = require("../db/utils");

async function addAuditLog({ hospital_id = null, kullanici, ip, islem, detay }) {
  const db = await getDb();

  db.run(
    `
    INSERT INTO audit_log (
      id,
      hospital_id,
      zaman,
      kullanici,
      ip,
      islem,
      detay
    )
    VALUES (?,?,?,?,?,?,?)
    `,
    [
      uid(),
      hospital_id,
      new Date().toISOString(),
      kullanici ?? "sistem",
      ip ?? null,
      islem,
      detay ?? null,
    ]
  );

  await saveDb();
}

async function listAuditLog(limit = 200, hospitalId = null) {
  const db = await getDb();

  const r = hospitalId
    ? db.exec(
        `SELECT * FROM audit_log WHERE hospital_id=? ORDER BY zaman DESC LIMIT ?`,
        [hospitalId, limit]
      )
    : db.exec(`SELECT * FROM audit_log ORDER BY zaman DESC LIMIT ?`, [limit]);

  return mapExecRows(r);
}

module.exports = {
  addAuditLog,
  listAuditLog,
};