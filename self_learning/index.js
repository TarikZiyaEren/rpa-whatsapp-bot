const { listHistory } = require("../repositories/historyRepository");
const { metinOzellikleri } = require("./features");

function normalizeHospitalId(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

async function ogrenmeAnaliziYap({ hasta, islem, doktorNotu, hospitalId }) {
  const normalizedHospitalId = normalizeHospitalId(hospitalId);

  if (!normalizedHospitalId) {
    return {
      ogrenmePuani: 0,
      genelRedOrani: 0,
      toplamKayit: 0,
      onaySayisi: 0,
      redSayisi: 0,
      nedenler: ["hospitalId olmadığı için self-learning analizi atlandı."],
    };
  }

  const gecmis = await listHistory(500, normalizedHospitalId);

  const ayniIslemGecmisi = gecmis.filter(
    (x) =>
      x?.sonuc &&
      typeof x.sonuc === "string" &&
      islem?.kodu &&
      (
        x?.islem_kodu === islem.kodu ||
        x?.metadata?.islemKodu === islem.kodu
      )
  );

  const ayniHastaGecmisi = gecmis.filter(
    (x) =>
      String(x?.tcKimlikNo || "") === String(hasta?.tc || "")
  );

  const havuz = ayniIslemGecmisi.length >= 5
    ? ayniIslemGecmisi
    : ayniHastaGecmisi.length >= 3
      ? ayniHastaGecmisi
      : gecmis;

  const toplam = havuz.length;
  const redSayisi = havuz.filter((x) =>
    String(x.sonuc || "").toUpperCase().includes("RED") &&
    !String(x.sonuc || "").toUpperCase().includes("ONAY")
  ).length;
  const onaySayisi = havuz.filter((x) =>
    String(x.sonuc || "").toUpperCase().includes("ONAY")
  ).length;

  const genelRedOrani = toplam > 0 ? redSayisi / toplam : 0;

  const oz = metinOzellikleri(doktorNotu);

  let ogrenmePuani = 0;
  const nedenler = [];

  if (ayniIslemGecmisi.length >= 5) {
    nedenler.push(`Aynı işlem koduna ait ${ayniIslemGecmisi.length} geçmiş kayıt bulundu.`);
  } else if (ayniHastaGecmisi.length >= 3) {
    nedenler.push(`Aynı hastaya ait ${ayniHastaGecmisi.length} geçmiş kayıt bulundu.`);
  } else {
    nedenler.push(`Genel tenant geçmişi kullanıldı (${gecmis.length} kayıt).`);
  }

  if (genelRedOrani >= 0.5) {
    ogrenmePuani += 0.08;
    nedenler.push("Geçmiş işlemlerde genel red oranı yüksek.");
  } else if (genelRedOrani <= 0.2 && toplam > 20) {
    ogrenmePuani -= 0.03;
    nedenler.push("Geçmiş işlemlerde genel onay oranı yüksek.");
  }

  if (oz.kronik) {
    ogrenmePuani += 0.04;
    nedenler.push("Doktor notunda kronik ifade örüntüsü bulundu.");
  }

  if (oz.diyaliz) {
    ogrenmePuani += 0.05;
    nedenler.push("Doktor notunda diyaliz ifadesi bulundu.");
  }

  if (oz.acil) {
    ogrenmePuani += 0.06;
    nedenler.push("Doktor notunda acil ifade örüntüsü bulundu.");
  }

  if (oz.kisaNot) {
    ogrenmePuani += 0.04;
    nedenler.push("Kısa doktor notları geçmişte daha riskli sonuçlar üretti.");
  }

  if (oz.bosNot) {
    ogrenmePuani += 0.06;
    nedenler.push("Boş doktor notu geçmiş veride daha yüksek belirsizlik üretti.");
  }

  ogrenmePuani = Math.max(-0.10, Math.min(0.15, ogrenmePuani));

  return {
    ogrenmePuani: Number(ogrenmePuani.toFixed(2)),
    genelRedOrani: Number(genelRedOrani.toFixed(2)),
    toplamKayit: toplam,
    onaySayisi,
    redSayisi,
    nedenler,
  };
}

module.exports = { ogrenmeAnaliziYap };