function medulaProvizyonPayloadOlustur({ hasta, islem, doktorNotu }) {
  return {
    hasta: {
      tc: hasta.tc,
      ad: hasta.ad,
      dogum: hasta.dogum,
    },
    islem: {
      kodu: islem.kodu,
      adi: islem.adi,
    },
    klinik: {
      doktorNotu: doktorNotu || "",
    },
    istekZamani: new Date().toISOString(),
  };
}

module.exports = { medulaProvizyonPayloadOlustur }; 