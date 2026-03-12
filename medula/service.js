const { provizyonGonder } = require("./client");
const { medulaProvizyonPayloadOlustur } = require("./mapper");
const { medulaHataAcikla } = require("./errors");

async function medulaProvizyonAl({ hasta, islem, doktorNotu }, log = () => {}) {
  log("🏛️ MEDULA payload hazırlanıyor...");
  const payload = medulaProvizyonPayloadOlustur({ hasta, islem, doktorNotu });

  log("📡 MEDULA servisine istek gönderiliyor...");
  const cevap = await provizyonGonder(payload);

  if (!cevap.basarili) {
    const aciklama = medulaHataAcikla(cevap.hataKodu);
    throw new Error(`${cevap.hataKodu}: ${aciklama}`);
  }

  log(`✅ MEDULA yanıtı alındı: ${cevap.provizyonDurumu}`);

  return {
    ...cevap,
    hataAciklamasi: cevap.hataKodu ? medulaHataAcikla(cevap.hataKodu) : null,
  };
}

module.exports = { medulaProvizyonAl };