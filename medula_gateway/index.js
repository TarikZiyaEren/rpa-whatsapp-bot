const { medulaGatewayPayload } = require("./mapper");
const { provizyonOrkestreEt } = require("./orchestrator");

async function medulaGatewayProvizyonAl({ hasta, islem, doktorNotu }, log = () => {}) {
  log("🏛️ MEDULA Gateway payload hazırlanıyor...");

  const payload = medulaGatewayPayload({ hasta, islem, doktorNotu });

  log("📡 SGK/MEDULA entegrasyon katmanına istek gönderiliyor...");
  const sonuc = await provizyonOrkestreEt(payload, log);

  if (!sonuc?.basarili) {
    log(`⚠️ Gateway yanıtı RED: ${sonuc?.hataKodu || "BILINMEYEN_HATA"}`);
    return {
      basarili: false,
      durum: sonuc?.durum || "RED",
      takipNo: sonuc?.takipNo || null,
      mesaj: sonuc?.mesaj || null,
      hataKodu: sonuc?.hataKodu || "BILINMEYEN_HATA",
      hataMesaji: sonuc?.hataMesaji || "Provizyon reddedildi.",
      belge: null,
      imza: null,
    };
  }

  log(`✅ Gateway yanıtı alındı: ${sonuc.durum}`);
  return sonuc;
}

module.exports = { medulaGatewayProvizyonAl };
