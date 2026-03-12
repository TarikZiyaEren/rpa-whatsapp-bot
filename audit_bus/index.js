function auditEvent(log = () => {}, tip, detay = {}) {
  const satir = `📘 [AUDIT] ${tip} | ${JSON.stringify(detay)}`;
  log(satir);
  return {
    zaman: new Date().toISOString(),
    tip,
    detay,
  };
}

module.exports = { auditEvent };