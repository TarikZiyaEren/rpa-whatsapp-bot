const { initDb, saveDb } = require("./db/core");

const {
  findUser,
  verifyUser,
  listUsers,
  getUserById,
  createUser,
  updateUserHospital,
  updateUserStatus,
  updateUserRole,
  deleteUser,
} = require("./repositories/userRepository");

const {
  saveCredential,
  getCredential,
  listCredentials,
  listCredentialsByHospital,
} = require("./repositories/credentialRepository");

const {
  addHistory,
  listHistory,
  getStats,
  getDailyCounts,
  listAllHistory,
} = require("./repositories/historyRepository");

const {
  addRandevu,
  getRandevularByTarih,
  getRandevularByTelefon,
  iptalRandevu,
} = require("./repositories/randevuRepository");

const {
  addAuditLog,
  listAuditLog,
} = require("./repositories/auditRepository");

const {
  addKvkkLog,
  listKvkkLog,
  kvkkIstatistik,
} = require("./repositories/kvkkRepository");

const {
  listHospitals,
  getHospitalById,
  getHospitalByCode,
  getHospitalMap,
  isHospitalActive,
  createHospital,
  updateHospitalStatus,
  updateHospitalPlan,
} = require("./repositories/hospitalRepository");

module.exports = {
  initDb,
  saveDb,

  findUser,
  verifyUser,
  listUsers,
  getUserById,
  createUser,
  updateUserHospital,
  updateUserStatus,
  updateUserRole,
  deleteUser,

  saveCredential,
  getCredential,
  listCredentials,
  listCredentialsByHospital,

  addHistory,
  listHistory,
  getStats,
  getDailyCounts,
  listAllHistory,

  addRandevu,
  getRandevularByTarih,
  getRandevularByTelefon,
  iptalRandevu,

  addAuditLog,
  listAuditLog,

  addKvkkLog,
  listKvkkLog,
  kvkkIstatistik,

  listHospitals,
  getHospitalById,
  getHospitalByCode,
  getHospitalMap,
  isHospitalActive,
  createHospital,
  updateHospitalStatus,
  updateHospitalPlan,
};