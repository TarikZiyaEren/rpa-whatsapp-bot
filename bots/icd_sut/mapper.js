/**
 * ICD-10 / SUT Kodu Eşleştirici
 * Gerçek uygulamada bu veriler bir DB'den veya resmi API'den gelir.
 * Demo için yaygın kodlar sabit tanımlanmıştır.
 */

// SUT kodu → { ad, icd10, aciklama, belgeler }
const SUT_TABLOSU = {
  "520.010": {
    ad: "Dahiliye Muayenesi",
    icd10: ["Z00.0", "E11.9", "E78.5", "D64.9", "N19"],
    aciklama: "Genel dahiliye poliklinik muayenesi",
    belgeler: ["Sevk belgesi (varsa)"],
  },
  "520.020": {
    ad: "Kardiyoloji Muayenesi",
    icd10: ["I10", "I25.9", "I50.0", "R07.4"],
    aciklama: "Kardiyoloji poliklinik muayenesi",
    belgeler: ["EKG (varsa)", "Önceki kardiyoloji raporu"],
  },
  "520.030": {
    ad: "Ortopedi Muayenesi",
    icd10: ["M54.5", "M17.1"],
    aciklama: "Ortopedi ve travmatoloji poliklinik muayenesi",
    belgeler: ["Radyoloji görüntüsü (varsa)"],
  },
  "520.040": {
    ad: "Nefroloji Muayenesi",
    icd10: ["N18.4", "N18.5", "N18.6", "N19"],
    aciklama: "Nefroloji poliklinik muayenesi",
    belgeler: ["Nefroloji değerlendirme notu", "Kreatinin / üre sonuçları"],
  },
  "520.050": {
    ad: "Göğüs Hastalıkları Muayenesi",
    icd10: ["J18.9", "J44.1", "R05", "R06.0"],
    aciklama: "Göğüs hastalıkları poliklinik muayenesi",
    belgeler: ["Akciğer grafisi (varsa)", "Solunum fonksiyon testi (varsa)"],
  },
  "520.060": {
    ad: "Genel Cerrahi Muayenesi",
    icd10: ["K80.2", "K81.0"],
    aciklama: "Genel cerrahi poliklinik muayenesi",
    belgeler: ["Batın USG", "Cerrahi değerlendirme notu"],
  },
  "571.010": {
    ad: "Tam Kan Sayımı",
    icd10: ["Z01.7", "D64.9"],
    aciklama: "Hemogram — CBC testi",
    belgeler: [],
  },
  "571.050": {
    ad: "Biyokimya Paneli",
    icd10: ["Z01.7", "N18.4", "N18.5", "N18.6", "N19", "R79.8"],
    aciklama: "Karaciğer, böbrek fonksiyon testleri",
    belgeler: [],
  },
  "571.060": {
    ad: "Serum Kreatinin",
    icd10: ["N18.4", "N18.5", "N18.6", "N19", "R79.8"],
    aciklama: "Böbrek fonksiyon değerlendirmesi için kreatinin testi",
    belgeler: [],
  },
  "571.070": {
    ad: "Üre Testi",
    icd10: ["N18.4", "N18.5", "N18.6", "N19", "R79.8"],
    aciklama: "Böbrek fonksiyon değerlendirmesi için üre testi",
    belgeler: [],
  },
  "571.080": {
    ad: "HbA1c",
    icd10: ["E11.9"],
    aciklama: "Diyabet takibi için HbA1c testi",
    belgeler: [],
  },
  "610.010": {
    ad: "Ekokardiyografi",
    icd10: ["I10", "I42.0", "I50.0"],
    aciklama: "Kardiyak ultrasonografi",
    belgeler: ["Kardiyoloji konsültasyon notu"],
  },
  "610.020": {
    ad: "Akciğer Grafisi",
    icd10: ["J18.9", "J44.1", "R05", "R06.0"],
    aciklama: "PA akciğer röntgeni",
    belgeler: [],
  },
  "610.030": {
    ad: "Elektrokardiyografi (EKG)",
    icd10: ["I10", "I25.9", "I50.0", "R07.4"],
    aciklama: "Kalp ritmi ve kardiyak değerlendirme testi",
    belgeler: [],
  },
  "610.040": {
    ad: "Toraks BT",
    icd10: ["J18.9", "J44.1", "R06.0"],
    aciklama: "Akciğer ve toraks değerlendirmesi için BT",
    belgeler: ["Uzman hekim istemi"],
  },
  "680.010": {
    ad: "Hemodiyaliz",
    icd10: ["N18.6", "N19"],
    aciklama: "Kronik böbrek yetmezliği hemodiyaliz seansı",
    belgeler: ["Nefroloji raporu", "Diyaliz endikasyon belgesi"],
  },
  "720.010": {
    ad: "Genel Anestezi",
    icd10: [],
    aciklama: "Genel anestezi uygulaması",
    belgeler: ["Anestezi konsültasyon formu", "Preoperatif lab sonuçları"],
  },
  "800.010": {
    ad: "Laparoskopik Kolesistektomi",
    icd10: ["K80.2", "K81.0"],
    aciklama: "Laparoskopik safra kesesi ameliyatı",
    belgeler: ["Batın USG", "Cerrahi konsültasyon", "Preop lab"],
  },
  "800.020": {
    ad: "Açık Kolesistektomi",
    icd10: ["K80.2", "K81.0"],
    aciklama: "Açık safra kesesi ameliyatı",
    belgeler: ["Batın USG", "Cerrahi konsültasyon", "Preop lab"],
  },
};

// ICD-10 kodu → { ad, kategori }
const ICD10_TABLOSU = {
  "Z00.0": { ad: "Genel muayene", kategori: "Önleyici" },
  "Z01.7": { ad: "Laboratuvar tetkiki", kategori: "Önleyici" },

  "I10": { ad: "Hipertansiyon", kategori: "Kardiyovasküler" },
  "I25.9": { ad: "Koroner arter hastalığı", kategori: "Kardiyovasküler" },
  "I42.0": { ad: "Dilate kardiyomiyopati", kategori: "Kardiyovasküler" },
  "I50.0": { ad: "Konjestif kalp yetmezliği", kategori: "Kardiyovasküler" },

  "M54.5": { ad: "Bel ağrısı", kategori: "Kas-İskelet" },
  "M17.1": { ad: "Diz osteoartriti", kategori: "Kas-İskelet" },

  "N18.4": { ad: "Kronik böbrek yetmezliği Evre 4", kategori: "Üriner" },
  "N18.5": { ad: "Kronik böbrek yetmezliği Evre 5", kategori: "Üriner" },
  "N18.6": { ad: "Kronik böbrek yetmezliği Evre 5", kategori: "Üriner" },
  "N19": { ad: "Böbrek yetmezliği", kategori: "Üriner" },

  "J18.9": { ad: "Pnömoni", kategori: "Solunum" },
  "J44.1": { ad: "KOAH akut alevlenme", kategori: "Solunum" },

  "R05": { ad: "Öksürük", kategori: "Semptom" },
  "R06.0": { ad: "Dispne", kategori: "Semptom" },
  "R07.4": { ad: "Göğüs ağrısı", kategori: "Semptom" },
  "R79.8": { ad: "Diğer anormal biyokimya bulguları", kategori: "Laboratuvar" },

  "D64.9": { ad: "Anemi", kategori: "Hematoloji" },

  "E11.9": { ad: "Tip 2 diabetes mellitus", kategori: "Endokrin" },
  "E78.5": { ad: "Hiperlipidemi", kategori: "Endokrin" },

  "K80.2": { ad: "Safra taşı", kategori: "Sindirim" },
  "K81.0": { ad: "Akut kolesistit", kategori: "Sindirim" },
};

/**
 * SUT kodundan bilgi getir
 * @param {string} sutKodu
 * @returns {{ sutKodu, ad, icd10Kodlar, icd10Aciklamalar, aciklama, belgeler } | null}
 */
function sutKodunuCoz(sutKodu) {
  if (!sutKodu) return null;
  const kayit = SUT_TABLOSU[sutKodu.trim()];
  if (!kayit) return null;

  const icd10Aciklamalar = kayit.icd10.map((kod) => ({
    kod,
    ad: ICD10_TABLOSU[kod]?.ad ?? "Bilinmiyor",
    kategori: ICD10_TABLOSU[kod]?.kategori ?? "Diğer",
  }));

  return {
    sutKodu: sutKodu.trim(),
    ad: kayit.ad,
    icd10Kodlar: kayit.icd10,
    icd10Aciklamalar,
    aciklama: kayit.aciklama,
    belgeler: kayit.belgeler,
  };
}

/**
 * ICD-10 kodundan bilgi getir
 * @param {string} icd10Kodu
 * @returns {{ kod, ad, kategori } | null}
 */
function icd10KodunuCoz(icd10Kodu) {
  if (!icd10Kodu) return null;
  const kayit = ICD10_TABLOSU[icd10Kodu.trim().toUpperCase()];
  if (!kayit) return null;
  return { kod: icd10Kodu.trim().toUpperCase(), ...kayit };
}

/**
 * İşlem adından SUT kodu öner (basit metin eşleştirme)
 * @param {string} islemAdi
 * @returns {Array<{ sutKodu, ad }>}
 */
function islemAdindenOner(islemAdi) {
  if (!islemAdi) return [];
  const ara = islemAdi.toLowerCase();

  return Object.entries(SUT_TABLOSU)
    .filter(([, v]) => v.ad.toLowerCase().includes(ara))
    .map(([k, v]) => ({ sutKodu: k, ad: v.ad }));
}

/**
 * ICD koduna göre uygun SUT öner
 * @param {string} icdKodu
 * @param {{ yas?: number, doktorNotu?: string }} options
 * @returns {Array<{ sutKodu, ad, aciklama, belgeler, icd10, score }>}
 */
function icdyeGoreSutOner(icdKodu, options = {}) {
  if (!icdKodu) return [];

  const yas = Number(options.yas || 0);
  const doktorNotu = String(options.doktorNotu || "").toLowerCase();

  const uygunlar = Object.entries(SUT_TABLOSU)
    .filter(([, v]) => Array.isArray(v.icd10) && v.icd10.includes(icdKodu))
    .map(([kod, v]) => {
      let score = 1;

      if (yas >= 65) score += 0.05;

      if (
        doktorNotu.includes("diyaliz") &&
        String(v.ad).toLowerCase().includes("diyaliz")
      ) {
        score += 0.25;
      }

      if (
        (doktorNotu.includes("kalp") || doktorNotu.includes("göğüs ağrısı")) &&
        (
          String(v.ad).toLowerCase().includes("kardiyo") ||
          String(v.ad).toLowerCase().includes("ekg") ||
          String(v.ad).toLowerCase().includes("eko")
        )
      ) {
        score += 0.2;
      }

      if (
        (doktorNotu.includes("böbrek") || doktorNotu.includes("kreatinin") || doktorNotu.includes("üre")) &&
        (
          String(v.ad).toLowerCase().includes("nefroloji") ||
          String(v.ad).toLowerCase().includes("kreatinin") ||
          String(v.ad).toLowerCase().includes("üre") ||
          String(v.ad).toLowerCase().includes("biyokimya")
        )
      ) {
        score += 0.2;
      }

      if (
        (doktorNotu.includes("öksürük") || doktorNotu.includes("dispne") || doktorNotu.includes("nefes")) &&
        (
          String(v.ad).toLowerCase().includes("göğüs") ||
          String(v.ad).toLowerCase().includes("akciğer") ||
          String(v.ad).toLowerCase().includes("toraks")
        )
      ) {
        score += 0.2;
      }

      if (
        (doktorNotu.includes("safra") || doktorNotu.includes("kolesistit") || doktorNotu.includes("karın")) &&
        (
          String(v.ad).toLowerCase().includes("cerrahi") ||
          String(v.ad).toLowerCase().includes("kolesistektomi")
        )
      ) {
        score += 0.2;
      }

      if (
        (doktorNotu.includes("şeker") || doktorNotu.includes("diyabet") || doktorNotu.includes("dm")) &&
        (
          String(v.ad).toLowerCase().includes("hba1c") ||
          String(v.ad).toLowerCase().includes("dahiliye")
        )
      ) {
        score += 0.15;
      }

      return {
        sutKodu: kod,
        ad: v.ad,
        aciklama: v.aciklama,
        belgeler: v.belgeler,
        icd10: v.icd10,
        score: Math.round(score * 100) / 100,
      };
    })
    .sort((a, b) => b.score - a.score);

  return uygunlar.slice(0, 5);
}

/**
 * ICD listesi çöz
 * @param {string[]} icdKodlari
 * @returns {Array<{ kod, ad, kategori }>}
 */
function icdListesiniCoz(icdKodlari = []) {
  return icdKodlari
    .map((kod) => icd10KodunuCoz(kod))
    .filter(Boolean);
}

/**
 * Tüm SUT kodlarını listele
 * @returns {Array<{ sutKodu, ad, icd10 }>}
 */
function tumSutKodlari() {
  return Object.entries(SUT_TABLOSU).map(([kod, v]) => ({
    sutKodu: kod,
    ad: v.ad,
    icd10: v.icd10,
  }));
}

module.exports = {
  sutKodunuCoz,
  icd10KodunuCoz,
  islemAdindenOner,
  tumSutKodlari,
  icdyeGoreSutOner,
  icdListesiniCoz,
};