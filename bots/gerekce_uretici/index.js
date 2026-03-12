const { aiGerekceUret } = require("../red_onleme/nlp_provider");
const { generateGerekcePDF } = require("../../document_service/pdf_service");

async function gerekceyazAt(veri, progress = () => {}) {

  progress("📝 Gerekçe üretiliyor...");

  const teshisListesi =
    veri.teshisler?.map(t => t.ad).filter(Boolean).join(", ") || "—";

  const promptVeri = {
    hastaAd: veri.hasta.ad,
    hastaDogum: veri.hasta.dogum,
    islemAdi: veri.islem.adi,
    islemKodu: veri.islem.kodu,
    teshisler: teshisListesi,
    doktorNotu: veri.doktorNotu || "Doktor notu bulunmuyor."
  };

  let gerekce;

  try {
    gerekce = await aiGerekceUret(promptVeri);
  } catch (e) {
    progress(`⚠️ Gerekçe üretimi hatası: ${e.message}`);
    throw e;
  }

  progress("✅ Gerekçe üretildi.");

  const pdf = generateGerekcePDF({
    ...promptVeri,
    gerekce
  });

  progress(`📄 PDF oluşturuldu: ${pdf.belgeNo}`);

  return {
    gerekce,
    belgeNo: pdf.belgeNo,
    filePath: pdf.filePath
  };
}

module.exports = { gerekceyazAt };