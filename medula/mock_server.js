const express = require("express");

const app = express();
app.use(express.json());

function medulaKararVer(body) {
  const tc = String(body?.hasta?.tc || "");
  const sonRakam = Number(tc.slice(-1));
  const islemKodu = String(body?.islem?.kodu || "");

  if (!tc || tc.length !== 11) {
    return {
      basarili: false,
      hataKodu: "MEDULA-001",
      hataMesaji: "Geçersiz TC Kimlik Numarası",
    };
  }

  if (Number.isNaN(sonRakam)) {
    return {
      basarili: false,
      hataKodu: "MEDULA-002",
      hataMesaji: "TC formatı hatalı",
    };
  }

  // Demo için özel MEDULA kural hatası
  if (islemKodu === "999.999") {
    return {
      basarili: false,
      hataKodu: "MEDULA-208",
      hataMesaji: "İşlem MEDULA kurallarına uygun değil",
    };
  }

  if (sonRakam % 2 === 0) {
    return {
      basarili: true,
      takipNo: `TKP-${Date.now()}`,
      provizyonDurumu: "ONAY",
      mesaj: "Provizyon onaylandı",
    };
  }

  return {
    basarili: true,
    takipNo: `TKP-${Date.now()}`,
    provizyonDurumu: "RED",
    mesaj: "Provizyon reddedildi",
    hataKodu: "MEDULA-102",
    hataMesaji: "Hasta provizyon kapsamı dışında",
  };
}

app.post("/medula/provizyon", (req, res) => {
  const sonuc = medulaKararVer(req.body);
  res.json(sonuc);
});

const PORT = process.env.MEDULA_MOCK_PORT || 6000;
app.listen(PORT, () => {
  console.log(`Mock MEDULA servisi çalışıyor: http://127.0.0.1:${PORT}`);
});