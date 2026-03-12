const { getDb, saveDb } = require("../db/core");
const { uid, mapExecRows } = require("../db/utils");

const STANDART_SAATLER = ["09:00", "10:30", "11:00", "14:00", "15:30"];

function normalizeHospitalId(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  return v || null;
}

async function addRandevu(row) {
  const db = await getDb();
  const id = uid();

  db.run(
    `
    INSERT INTO randevular
    (id, hospital_id, telefon, tc, ad, poliklinik, tarih, saat, durum, olusturma_zamani)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    `,
    [
      id,
      normalizeHospitalId(row.hospitalId),
      row.telefon,
      row.tc ?? null,
      row.ad,
      row.poliklinik,
      row.tarih,
      row.saat,
      row.durum ?? "aktif",
      new Date().toISOString(),
    ]
  );

  await saveDb();
  return id;
}

async function getRandevularByTarih(tarih, hospitalId = null) {
  const db = await getDb();

  let query = `SELECT * FROM randevular WHERE tarih=? AND durum='aktif'`;
  const params = [tarih];

  if (hospitalId) {
    query += ` AND hospital_id=?`;
    params.push(normalizeHospitalId(hospitalId));
  }

  query += ` ORDER BY saat`;

  return mapExecRows(db.exec(query, params));
}

async function getRandevularByTelefon(telefon, hospitalId = null) {
  const db = await getDb();

  let query = `SELECT * FROM randevular WHERE telefon=?`;
  const params = [telefon];

  if (hospitalId) {
    query += ` AND hospital_id=?`;
    params.push(normalizeHospitalId(hospitalId));
  }

  query += ` ORDER BY tarih DESC, saat DESC`;

  return mapExecRows(db.exec(query, params));
}

async function getRandevularByTarihPoliklinik(tarih, poliklinik, hospitalId = null) {
  const db = await getDb();

  let query = `
    SELECT * FROM randevular
    WHERE tarih=? AND poliklinik=? AND durum='aktif'
  `;
  const params = [tarih, poliklinik];

  if (hospitalId) {
    query += ` AND hospital_id=?`;
    params.push(normalizeHospitalId(hospitalId));
  }

  query += ` ORDER BY saat`;

  return mapExecRows(db.exec(query, params));
}

async function getAvailableSlots(tarih, poliklinik, hospitalId = null) {
  const mevcut = await getRandevularByTarihPoliklinik(tarih, poliklinik, hospitalId);
  const doluSaatler = new Set(mevcut.map((x) => x.saat));
  return STANDART_SAATLER.filter((saat) => !doluSaatler.has(saat));
}

async function iptalRandevu(id, hospitalId = null) {
  const db = await getDb();

  if (hospitalId) {
    db.run(
      `UPDATE randevular SET durum='iptal' WHERE id=? AND hospital_id=?`,
      [id, normalizeHospitalId(hospitalId)]
    );
  } else {
    db.run(`UPDATE randevular SET durum='iptal' WHERE id=?`, [id]);
  }

  await saveDb();
}

module.exports = {
  addRandevu,
  getRandevularByTarih,
  getRandevularByTelefon,
  getRandevularByTarihPoliklinik,
  getAvailableSlots,
  iptalRandevu,
};