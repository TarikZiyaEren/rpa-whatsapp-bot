function belgeImzala(belge, imzalayan = "sistem") {
  return {
    imzaId: `SIG-${Date.now()}`,
    belgeNo: belge.belgeNo,
    imzalayan,
    sertifikaNo: `MOCK-CERT-${Date.now()}`,
    imzaZamani: new Date().toISOString(),
  };
}

module.exports = { belgeImzala };