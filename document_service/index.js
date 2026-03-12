function belgeHazirla({ hasta, islem, doktorNotu, takipNo }) {
  return {
    belgeNo: `DOC-${Date.now()}`,
    belgeTipi: "PROVIZYON_BILGI_FORMU",
    takipNo,
    icerik: {
      hasta,
      islem,
      doktorNotu: doktorNotu || "",
    },
    olusturmaZamani: new Date().toISOString(),
  };
}

module.exports = { belgeHazirla };