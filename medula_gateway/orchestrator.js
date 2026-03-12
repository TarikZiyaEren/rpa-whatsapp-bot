const { sgkProvizyonIstegi } = require("../soap_adapter/client");
const { belgeHazirla } = require("../document_service");
const { belgeImzala } = require("../signature_service");
const { auditEvent } = require("../audit_bus");

async function provizyonOrkestreEt(payload, log = () => {}) {
  auditEvent(log, "SGK_ISTEK_HAZIR", {
    tc: payload?.hasta?.tc,
    islemKodu: payload?.islem?.kodu,
  });

  const sgkCevap = await sgkProvizyonIstegi(payload);

  auditEvent(log, "SGK_CEVAP_ALINDI", {
    durum: sgkCevap?.durum || null,
    hataKodu: sgkCevap?.hataKodu || null,
    takipNo: sgkCevap?.takipNo || null,
  });

  if (!sgkCevap.basarili) {
    return {
      basarili: false,
      durum: sgkCevap?.durum || "RED",
      takipNo: sgkCevap?.takipNo || null,
      mesaj: sgkCevap?.mesaj || null,
      hataKodu: sgkCevap?.hataKodu || "BILINMEYEN_HATA",
      hataMesaji: sgkCevap?.hataMesaji || "Provizyon reddedildi.",
    };
  }

  const belge = belgeHazirla({
    hasta: payload.hasta,
    islem: payload.islem,
    doktorNotu: payload.doktorNotu,
    takipNo: sgkCevap.takipNo,
  });

  auditEvent(log, "BELGE_URETILDI", {
    belgeNo: belge.belgeNo,
    takipNo: belge.takipNo,
  });

  const imza = belgeImzala(belge, "sistem");

  auditEvent(log, "BELGE_IMZALANDI", {
    belgeNo: belge.belgeNo,
    imzaId: imza.imzaId,
  });

  return {
    basarili: true,
    takipNo: sgkCevap.takipNo,
    durum: sgkCevap.durum,
    mesaj: sgkCevap.mesaj,
    hataKodu: sgkCevap.hataKodu || null,
    hataMesaji: sgkCevap.hataMesaji || null,
    belge,
    imza,
  };
}

module.exports = { provizyonOrkestreEt };