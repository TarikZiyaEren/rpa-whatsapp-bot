const { kvkkTara, riskOzeti }           = require("./scanner");
const { aydinlatmaMetniUret, silmeTalebiOlustur } = require("./aydinlatma");
const { raporOlustur }                  = require("./rapor");
const { listHistory } = require("../../repositories/historyRepository");
const { addKvkkLog } = require("../../repositories/kvkkRepository");

async function kvkkTaramaCalistir(progress = () => {}) {
  progress("🔍 KVKK taraması başlıyor...");

  const kayitlar = await listHistory(500);
  progress(`📋 ${kayitlar.length} kayıt taranıyor...`);

  const ihlaller = kvkkTara(kayitlar);
  const ozet     = riskOzeti(ihlaller);

  progress(`⚠️ ${ihlaller.length} potansiyel ihlal tespit edildi.`);
  progress(`Risk seviyesi: ${ozet.seviye}`);

  // İhlalleri logla
  for (const ih of ihlaller) {
    await addKvkkLog({
      time:          new Date().toISOString(),
      tip:           ih.kural_kodu,
      aciklama:      ih.aciklama,
      risk_seviyesi: ih.risk,
      tc:            ih.tc,
      islem:         ih.oneri,
      durum:         "tespit_edildi",
    });
  }

  const taranmaZamani = new Date().toLocaleString("tr-TR");
  const rapor = raporOlustur(ihlaller, ozet, taranmaZamani);

  progress("✅ Tarama tamamlandı.");

  return { ihlaller, ozet, rapor };
}

async function aydinlatmaMetniGetir(hasta) {
  return aydinlatmaMetniUret(hasta);
}

async function silmeTalebiOlusturAl(tc, ad, sebep) {
  return silmeTalebiOlustur(tc, ad, sebep);
}

module.exports = { kvkkTaramaCalistir, aydinlatmaMetniGetir, silmeTalebiOlusturAl };