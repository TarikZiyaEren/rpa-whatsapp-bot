const { tumSutKodlari } = require("../icd_sut/mapper");
const { kurallariDegerlendir } = require("../rule_engine");

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function kelimelereAyir(text = "") {
  return normalizeText(text)
    .split(" ")
    .filter(Boolean);
}

function bransBul(islemAdi = "") {
  const ad = normalizeText(islemAdi);

  const bransMap = [
    { brans: "dahiliye", anahtarlar: ["dahiliye", "ic hastaliklari", "ic hastalik"] },
    { brans: "kardiyoloji", anahtarlar: ["kardiyoloji", "kalp"] },
    { brans: "ortopedi", anahtarlar: ["ortopedi", "travmatoloji", "kemik", "eklem"] },
    { brans: "nefroloji", anahtarlar: ["nefroloji", "bobrek", "diyaliz"] },
    { brans: "noroloji", anahtarlar: ["noroloji", "beyin", "sinir"] },
    { brans: "goz", anahtarlar: ["goz", "oftalmoloji"] },
    { brans: "kbb", anahtarlar: ["kbb", "kulak", "burun", "bogaz"] },
    { brans: "genel cerrahi", anahtarlar: ["genel cerrahi", "cerrahi"] },
    { brans: "cocuk", anahtarlar: ["cocuk", "pediatri"] },
    { brans: "kadin dogum", anahtarlar: ["kadin dogum", "jinekoloji", "gebelik"] },
  ];

  for (const item of bransMap) {
    if (item.anahtarlar.some(k => ad.includes(k))) {
      return item.brans;
    }
  }

  return null;
}

function metinBenzerlikPuani(islemAdi = "", sutAdi = "") {
  const a = kelimelereAyir(islemAdi);
  const b = kelimelereAyir(sutAdi);

  let puan = 0;

  for (const kelime of a) {
    if (b.includes(kelime)) {
      puan += 3;
    } else if (
      kelime.length >= 4 &&
      b.some(x => x.includes(kelime) || kelime.includes(x))
    ) {
      puan += 1;
    }
  }

  return puan;
}

function alternatifSutBul(mevcutKod, islemAdi = "") {
  const tum = tumSutKodlari();
  const hedefAd = normalizeText(islemAdi);
  const hedefBrans = bransBul(islemAdi);

  const adaylar = tum
    .filter(x => x?.sutKodu && x?.ad && x.sutKodu !== mevcutKod)
    .filter(x => {
      if (!hedefBrans) return true;
      return bransBul(x.ad) === hedefBrans;
    })
    .map(x => {
      const sutAdNorm = normalizeText(x.ad);
      const sutBrans = bransBul(x.ad);

      let puan = 0;

      if (hedefBrans && sutBrans && hedefBrans === sutBrans) {
        puan += 10;
      }

      puan += metinBenzerlikPuani(hedefAd, sutAdNorm);

      if (sutBrans && hedefBrans && sutBrans !== hedefBrans) {
        puan -= 5;
      }

      if (sutAdNorm.includes("muayene")) {
        puan += 1;
      }

      if (hedefAd && sutAdNorm === hedefAd) {
        puan += 20;
      }

      return {
        kod: x.sutKodu,
        ad: x.ad,
        puan,
      };
    })
    .filter(x => x.puan > 0)
    .sort((a, b) => b.puan - a.puan)
    .slice(0, 3)
    .map(({ kod, ad }) => ({ kod, ad }));

  return adaylar;
}

function doktorNotuOner(doktorNotu = "", islem = {}) {
  const not = String(doktorNotu || "").trim().toLowerCase();
  const islemAdi = String(islem?.adi || "");

  const oneriler = [];

  if (!not) {
    oneriler.push("Doktor notu boş. Klinik açıklama eklenmeli.");
    oneriler.push(`"${islemAdi || "İşlem"}" için tıbbi gerekçe açıkça yazılmalı.`);
    return oneriler;
  }

  if (not.length < 25) {
    oneriler.push("Doktor notu çok kısa. Endikasyon ve klinik gerekçe detaylandırılmalı.");
  }

  if (!not.includes("kronik") && !not.includes("akut") && !not.includes("tanı")) {
    oneriler.push("Tanıyı destekleyen klinik ifade eklenmeli.");
  }

  if (!not.includes("endikasyon")) {
    oneriler.push("İşlemin neden gerekli olduğunu belirten endikasyon eklenmeli.");
  }

  if (!not.includes("kontrol") && !not.includes("muayene") && !not.includes("degerlendirme")) {
    oneriler.push("Muayene/değerlendirme amacı notta daha açık belirtilmeli.");
  }

  return oneriler;
}

function belgeOner(hataKodu, rapor) {
  const eksik = rapor?.eksikBelgeler || [];
  if (eksik.length) return eksik;

  if (String(hataKodu || "").includes("102")) {
    return ["Provizyon kapsam belgesi", "Kimlik doğrulama kontrolü"];
  }

  if (String(hataKodu || "").includes("208")) {
    return ["Epikriz", "Doktor değerlendirme notu", "Uygun ICD-10 eşleşmesi"];
  }

  return ["Epikriz", "Doktor notu", "ICD-10 doğrulaması"];
}

async function redCozumOner({
  hataKodu,
  hataMesaji,
  hasta,
  islem,
  doktorNotu,
  rapor,
}) {
  const alternatifler = alternatifSutBul(islem?.kodu, islem?.adi);
  const notOnerileri = doktorNotuOner(doktorNotu, islem);
  const belgeler = belgeOner(hataKodu, rapor);

  const nedenler = [];

  if (String(hataKodu || "").includes("102")) {
    nedenler.push("Hasta kapsam dışında olabilir.");
    nedenler.push("İşlem, mevcut provizyon kuralları içinde karşılanmıyor olabilir.");
  }

  if (String(hataKodu || "").includes("208")) {
    nedenler.push("İşlem kodu MEDULA/SGK kurallarıyla uyumsuz olabilir.");
    nedenler.push("SUT kodu ile klinik açıklama arasında uyumsuzluk olabilir.");
  }

  if (!nedenler.length) {
    nedenler.push("Klinik açıklama ve işlem kodu birlikte tekrar kontrol edilmeli.");
  }

  // --- Kural motoru ile RED nedenlerini zenginleştir ---
  let kuralAnalizi = null;
  try {
    kuralAnalizi = kurallariDegerlendir({
      islemKodu: islem?.kodu,
      doktorNotu,
      hastaYas: hasta?.yas,
    });

    if (kuralAnalizi.tetiklenenSayisi > 0) {
      for (const t of kuralAnalizi.tetiklenenler) {
        nedenler.push(`[${t.kuralId}] ${t.aciklama}`);
      }
    }
  } catch {
    // Kural motoru başarısız olursa mevcut akışı bozma
  }

  // Kural motorundan gelen önerileri topla
  const kuralOnerileri = (kuralAnalizi?.tetiklenenler || [])
    .map((t) => t.oneri)
    .filter(Boolean);

  return {
    hataKodu,
    hataMesaji,
    nedenler: [...new Set(nedenler)],
    alternatifSutlar: alternatifler,
    doktorNotuOnerileri: notOnerileri,
    belgeOnerileri: belgeler,
    kuralOnerileri,
    kuralAnalizi: kuralAnalizi
      ? {
          tetiklenenler: kuralAnalizi.tetiklenenler,
          tetiklenenSayisi: kuralAnalizi.tetiklenenSayisi,
          kategoriOzeti: kuralAnalizi.kategoriOzeti,
        }
      : null,
    ozet: "RED sonrası düzeltme önerileri hazırlandı.",
  };
}

module.exports = { redCozumOner };