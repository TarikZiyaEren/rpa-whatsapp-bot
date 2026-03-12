const express = require("express");

const app = express();
app.use(express.json());

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .trim();
}

function tcSonIki(tc) {
  return String(tc || "").replace(/\D/g, "").slice(-2);
}

function hastaSenaryosu(tc) {
  const sonIki = tcSonIki(tc);

  if (["90", "91", "92", "93"].includes(sonIki)) return "kapsam_disi";
  if (["94", "95", "96"].includes(sonIki)) return "belge_eksik";
  if (["97", "98"].includes(sonIki)) return "islem_uygunsuz";
  if (["99"].includes(sonIki)) return "manuel_inceleme";

  return "normal";
}

function takipNoUret() {
  return `SGK-TKP-${Date.now()}`;
}

function onayCevabi(mesaj = "Provizyon onaylandı") {
  return {
    basarili: true,
    takipNo: takipNoUret(),
    durum: "ONAY",
    mesaj,
  };
}

function redCevabi(hataKodu, hataMesaji, mesaj = "Provizyon reddedildi") {
  return {
    basarili: true,
    takipNo: takipNoUret(),
    durum: "RED",
    mesaj,
    hataKodu,
    hataMesaji,
  };
}

function hataCevabi(hataKodu, hataMesaji) {
  return {
    basarili: false,
    hataKodu,
    hataMesaji,
  };
}

function eksikBelgeVarMi(doktorNotu) {
  const not = normalizeText(doktorNotu);

  return (
    not.includes("epikriz yok") ||
    not.includes("rapor eklenmemis") ||
    not.includes("rapor eklenmemi") ||
    not.includes("imza eksik") ||
    not.includes("belge eksik")
  );
}

function hipertansiyonSenaryosu(islemKodu, doktorNotu) {
  const not = normalizeText(doktorNotu);

  if (!not.includes("hipertansiyon")) return null;

  if (islemKodu === "520.020") {
    return redCevabi(
      "SGK-208",
      "İşlem klinik bilgi ile uyumsuz",
      "İlk tercih işlem reddedildi"
    );
  }

  if (islemKodu === "520.010") {
    return onayCevabi("Alternatif işlem ile provizyon onaylandı");
  }

  if (["610.010", "610.030"].includes(islemKodu)) {
    return redCevabi(
      "SGK-208",
      "Ön değerlendirme muayenesi olmadan ileri işlem uygun değil"
    );
  }

  return null;
}

function bobrekSenaryosu(islemKodu, doktorNotu) {
  const not = normalizeText(doktorNotu);

  if (
    !not.includes("bobrek") &&
    !not.includes("renal") &&
    !not.includes("kreatinin") &&
    !not.includes("diyaliz")
  ) {
    return null;
  }

  if (["680.010", "680.020", "571.060", "571.070", "520.010"].includes(islemKodu)) {
    return onayCevabi("Böbrek ilişkili işlem onaylandı");
  }

  return redCevabi("SGK-208", "İşlem böbrek kliniği ile uyumsuz");
}

function solunumSenaryosu(islemKodu, doktorNotu) {
  const not = normalizeText(doktorNotu);

  if (
    !not.includes("oksuruk") &&
    !not.includes("nefes darligi") &&
    !not.includes("koah") &&
    !not.includes("pnomoni")
  ) {
    return null;
  }

  if (["520.010", "610.020"].includes(islemKodu)) {
    return onayCevabi("Solunum ilişkili işlem onaylandı");
  }

  return redCevabi("SGK-208", "İşlem solunum kliniği ile uyumsuz");
}

function genelUygunlukKontrolu(islemKodu) {
  if (islemKodu === "999.999") {
    return redCevabi("SGK-208", "İşlem SGK kurallarına uygun değil");
  }

  return null;
}

function sgkKararVer(body) {
  const tc = String(body?.hasta?.tc || "").replace(/\D/g, "");
  const islemKodu = String(body?.islem?.kodu || "").trim();
  const doktorNotu = String(body?.doktorNotu || "");
  const senaryo = hastaSenaryosu(tc);

  if (!tc || tc.length !== 11) {
    return hataCevabi("SGK-001", "Geçersiz TC");
  }

  if (!islemKodu) {
    return hataCevabi("SGK-002", "İşlem kodu zorunlu");
  }

  if (senaryo === "kapsam_disi") {
    return redCevabi("SGK-102", "Hasta kapsam dışı");
  }

  if (senaryo === "manuel_inceleme") {
    return redCevabi("SGK-500", "Provizyon manuel incelemeye alındı");
  }

  if (senaryo === "belge_eksik" || eksikBelgeVarMi(doktorNotu)) {
    return redCevabi("SGK-301", "Eksik belge / epikriz nedeniyle işlem reddedildi");
  }

  const genelKontrol = genelUygunlukKontrolu(islemKodu);
  if (genelKontrol) return genelKontrol;

  const hipertansiyonKarari = hipertansiyonSenaryosu(islemKodu, doktorNotu);
  if (hipertansiyonKarari) return hipertansiyonKarari;

  const bobrekKarari = bobrekSenaryosu(islemKodu, doktorNotu);
  if (bobrekKarari) return bobrekKarari;

  const solunumKarari = solunumSenaryosu(islemKodu, doktorNotu);
  if (solunumKarari) return solunumKarari;

  if (senaryo === "islem_uygunsuz") {
    return redCevabi("SGK-208", "İşlem klinik bilgi ile uyumsuz");
  }

  return onayCevabi("Provizyon onaylandı");
}

app.post("/sgk/provizyon", (req, res) => {
  const sonuc = sgkKararVer(req.body);
  res.json(sonuc);
});

const PORT = 4000;

app.listen(PORT, () => {
  console.log(`Mock SGK Gateway çalışıyor: http://127.0.0.1:${PORT}`);
});