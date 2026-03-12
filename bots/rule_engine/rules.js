/**
 * Deterministik Kural Tanımları
 *
 * Her kural:
 *  - id:          Benzersiz kural numarası (KURAL-001 vb.)
 *  - ad:          Kısa kural adı
 *  - kategori:    islem | klinik | belge | yas | not | kombinasyon
 *  - kosul:       (veri) => boolean — tetiklenme şartı
 *  - riskEtkisi:  Tetiklendiğinde risk skoruna katkısı (0-1 arası)
 *  - aciklama:    (veri) => string — insan-okunur açıklama
 *  - oneri:       (veri) => string — ne yapılmalı
 */

const YUKSEK_RISK_KODLARI = new Set([
  "520.030", "531.020", "640.010", "680.010", "800.010",
]);

const RISK_KELIMELER = [
  "kronik", "ameliyat", "operasyon", "yoğun bakım",
  "kanser", "tümör", "diyaliz", "transplant",
  "metastaz", "sepsis", "entübasyon",
];

const EKSIK_BELGE_PATTERNS = [
  /epikriz\s*yok/i,
  /rapor\s*eklenmemi/i,
  /imza\s*eksik/i,
  /belge\s*eksik/i,
];

function notLower(veri) {
  return String(veri.doktorNotu || "").toLowerCase();
}

const KURAL_TANIMLARI = [
  // --- İŞLEM KURALLARI ---
  {
    id: "KURAL-001",
    ad: "Yüksek riskli SUT kodu",
    kategori: "islem",
    kosul: (v) => YUKSEK_RISK_KODLARI.has(v.islemKodu),
    riskEtkisi: 0.30,
    aciklama: (v) => `SUT kodu ${v.islemKodu} yüksek riskli işlem listesinde.`,
    oneri: () => "Uzman hekim onayı ve destekleyici belge ile gönderin.",
  },
  {
    id: "KURAL-002",
    ad: "Cerrahi işlem kodu",
    kategori: "islem",
    kosul: (v) => /^(800|720|640)\./.test(v.islemKodu || ""),
    riskEtkisi: 0.20,
    aciklama: (v) => `İşlem kodu ${v.islemKodu} cerrahi kategorisinde.`,
    oneri: () => "Preop değerlendirme ve cerrahi konsültasyon ekleyin.",
  },
  {
    id: "KURAL-003",
    ad: "Diyaliz işlem kodu",
    kategori: "islem",
    kosul: (v) => v.islemKodu === "680.010",
    riskEtkisi: 0.25,
    aciklama: () => "Hemodiyaliz işlemi — nefroloji raporu ve endikasyon belgesi gerekli.",
    oneri: () => "Nefroloji raporu ve diyaliz endikasyon belgesi ekleyin.",
  },

  // --- KLİNİK UYUMSUZLUK KURALLARI ---
  {
    id: "KURAL-010",
    ad: "İşlem-klinik uyumsuzluğu: Kardiyoloji",
    kategori: "kombinasyon",
    kosul: (v) => {
      const not = notLower(v);
      const kardiyoNot = /kalp|koroner|kardiyak|göğüs ağrısı|hipertansiyon/.test(not);
      const kardiyoIslem = /^520\.020/.test(v.islemKodu || "");
      // Klinik not kardiyoloji gösteriyorsa ama işlem dahiliye ise
      return kardiyoNot && !kardiyoIslem && /^520\.010/.test(v.islemKodu || "");
    },
    riskEtkisi: 0.25,
    aciklama: (v) =>
      `Doktor notunda kardiyolojik bulgular var ama işlem kodu (${v.islemKodu}) dahiliye. İşlem-klinik uyumsuzluğu.`,
    oneri: () => "Kardiyoloji muayene kodu (520.020) kullanmayı değerlendirin.",
  },
  {
    id: "KURAL-011",
    ad: "İşlem-klinik uyumsuzluğu: Nefroloji",
    kategori: "kombinasyon",
    kosul: (v) => {
      const not = notLower(v);
      const nefroNot = /böbrek|renal|kreatinin|diyaliz|nefr/.test(not);
      const nefroIslem = /^(520\.040|680\.)/.test(v.islemKodu || "");
      return nefroNot && !nefroIslem && !/680\./.test(v.islemKodu || "");
    },
    riskEtkisi: 0.20,
    aciklama: (v) =>
      `Doktor notunda nefrolojik bulgular var ama işlem kodu (${v.islemKodu}) nefroloji değil. İşlem-klinik uyumsuzluğu.`,
    oneri: () => "Nefroloji kodu (520.040) veya diyaliz kodu (680.010) kullanmayı değerlendirin.",
  },
  {
    id: "KURAL-012",
    ad: "İşlem-klinik uyumsuzluğu: Solunum",
    kategori: "kombinasyon",
    kosul: (v) => {
      const not = notLower(v);
      const solunumNot = /öksürük|nefes darlığı|koah|pnömoni|zaturre|akciğer/.test(not);
      const solunumIslem = /^520\.050/.test(v.islemKodu || "");
      return solunumNot && !solunumIslem && /^520\.010/.test(v.islemKodu || "");
    },
    riskEtkisi: 0.20,
    aciklama: (v) =>
      `Doktor notunda solunum bulguları var ama işlem kodu (${v.islemKodu}) göğüs hastalıkları değil.`,
    oneri: () => "Göğüs hastalıkları muayene kodu (520.050) kullanmayı değerlendirin.",
  },
  {
    id: "KURAL-013",
    ad: "İşlem-klinik uyumsuzluğu: Cerrahi",
    kategori: "kombinasyon",
    kosul: (v) => {
      const not = notLower(v);
      const cerrahiNot = /safra|kolesist|kolelitiaz|apandis|herni|fıtık/.test(not);
      const cerrahiIslem = /^(800|520\.060)/.test(v.islemKodu || "");
      return cerrahiNot && !cerrahiIslem;
    },
    riskEtkisi: 0.20,
    aciklama: (v) =>
      `Doktor notunda cerrahi endikasyon var ama işlem kodu (${v.islemKodu}) cerrahi kategorisinde değil.`,
    oneri: () => "Genel cerrahi (520.060) veya ilgili cerrahi işlem kodunu kullanın.",
  },

  // --- BELGE KURALLARI ---
  {
    id: "KURAL-020",
    ad: "Eksik belge ifadesi tespit edildi",
    kategori: "belge",
    kosul: (v) => {
      const not = notLower(v);
      return EKSIK_BELGE_PATTERNS.some((p) => p.test(not));
    },
    riskEtkisi: 0.40,
    aciklama: () => "Doktor notunda açık eksik belge ifadesi bulundu (epikriz yok, rapor eklenmemiş vb.).",
    oneri: () => "Eksik belgeleri tamamlayın ve notu güncelleyin.",
  },
  {
    id: "KURAL-021",
    ad: "Çok sayıda destekleyici belge gerekli",
    kategori: "belge",
    kosul: (v) => {
      // Bu kuralın dışarıdan hesaplanan belge sayısına bağlı olması gerekir
      // Basit yaklaşım: birden fazla risk kelimesi = birden fazla belge ihtiyacı
      const not = notLower(v);
      let count = 0;
      for (const k of RISK_KELIMELER) {
        if (not.includes(k)) count++;
      }
      return count >= 3;
    },
    riskEtkisi: 0.15,
    aciklama: () => "Doktor notunda birden fazla risk alanı tespit edildi — birden fazla destekleyici belge gerekebilir.",
    oneri: () => "Her risk alanı için ilgili belgeyi (rapor, konsültasyon, lab) ekleyin.",
  },

  // --- YAŞ KURALLARI ---
  {
    id: "KURAL-030",
    ad: "İleri yaş + yoğun bakım riski",
    kategori: "yas",
    kosul: (v) => v.hastaYas && v.hastaYas >= 65 && notLower(v).includes("yoğun"),
    riskEtkisi: 0.25,
    aciklama: (v) => `Hasta ${v.hastaYas} yaşında ve yoğun bakım ihtiyacı tespit edildi — yüksek risk.`,
    oneri: () => "Epikriz, yoğun bakım yatış notu ve uzman değerlendirmesi ekleyin.",
  },
  {
    id: "KURAL-031",
    ad: "İleri yaş ile yüksek riskli işlem",
    kategori: "yas",
    kosul: (v) => v.hastaYas && v.hastaYas >= 65 && YUKSEK_RISK_KODLARI.has(v.islemKodu),
    riskEtkisi: 0.20,
    aciklama: (v) => `Hasta ${v.hastaYas} yaşında ve yüksek riskli bir işlem (${v.islemKodu}) talep edildi.`,
    oneri: () => "Yaşa uygun klinik değerlendirme ve risk analizi ekleyin.",
  },
  {
    id: "KURAL-032",
    ad: "Pediatrik hasta — ek dikkat",
    kategori: "yas",
    kosul: (v) => v.hastaYas != null && v.hastaYas < 18,
    riskEtkisi: 0.10,
    aciklama: (v) => `Hasta ${v.hastaYas} yaşında (pediatrik) — ek onay ve çocuk doktoru notu gerekebilir.`,
    oneri: () => "Çocuk doktoru değerlendirme notu ve ebeveyn onayı ekleyin.",
  },

  // --- DOKTOR NOTU KURALLARI ---
  {
    id: "KURAL-040",
    ad: "Doktor notu boş",
    kategori: "not",
    kosul: (v) => !String(v.doktorNotu || "").trim(),
    riskEtkisi: 0.15,
    aciklama: () => "Doktor notu boş — klinik gerekçe olmadan provizyon reddedilebilir.",
    oneri: () => "Tanı, endikasyon ve klinik gerekçeyi içeren doktor notu ekleyin.",
  },
  {
    id: "KURAL-041",
    ad: "Doktor notu çok kısa",
    kategori: "not",
    kosul: (v) => {
      const not = String(v.doktorNotu || "").trim();
      return not.length > 0 && not.length < 25;
    },
    riskEtkisi: 0.10,
    aciklama: () => "Doktor notu 25 karakterden kısa — yeterli klinik açıklama içermiyor olabilir.",
    oneri: () => "Notu genişletin: tanı, endikasyon, muayene bulguları ekleyin.",
  },
  {
    id: "KURAL-042",
    ad: "Doktor notunda tanı ifadesi yok",
    kategori: "not",
    kosul: (v) => {
      const not = notLower(v);
      return not.length >= 25 && !/kronik|akut|tanı|teşhis|diagnosis/.test(not);
    },
    riskEtkisi: 0.08,
    aciklama: () => "Doktor notunda açık tanı ifadesi bulunamadı.",
    oneri: () => "Tanıyı destekleyen klinik ifade ekleyin (örn: kronik/akut hastalık adı).",
  },
  {
    id: "KURAL-043",
    ad: "Doktor notunda endikasyon yok",
    kategori: "not",
    kosul: (v) => {
      const not = notLower(v);
      return not.length >= 25 && !not.includes("endikasyon");
    },
    riskEtkisi: 0.05,
    aciklama: () => "Doktor notunda açık endikasyon ifadesi bulunamadı.",
    oneri: () => "İşlemin neden gerekli olduğunu belirten endikasyon ifadesi ekleyin.",
  },

  // --- RISK KELİME KURALLARI ---
  {
    id: "KURAL-050",
    ad: "Onkolojik ifade tespit edildi",
    kategori: "klinik",
    kosul: (v) => /kanser|tümör|metastaz|onkoloji|kemoterapi|radyoterapi/.test(notLower(v)),
    riskEtkisi: 0.25,
    aciklama: () => "Doktor notunda onkolojik ifade tespit edildi — ek belge ve onay gerekebilir.",
    oneri: () => "Patoloji raporu, onkoloji konsültasyonu ve tedavi planı ekleyin.",
  },
  {
    id: "KURAL-051",
    ad: "Transplant/nakil ifadesi tespit edildi",
    kategori: "klinik",
    kosul: (v) => /transplant|nakil|organ nakli/.test(notLower(v)),
    riskEtkisi: 0.30,
    aciklama: () => "Doktor notunda transplant/organ nakli ifadesi — özel onay süreci gerektirir.",
    oneri: () => "Transplant merkezi onayı, HLA uyum raporu ve etik kurul kararı ekleyin.",
  },
  {
    id: "KURAL-052",
    ad: "Sepsis/entübasyon — kritik durum",
    kategori: "klinik",
    kosul: (v) => /sepsis|entübasyon|septik/.test(notLower(v)),
    riskEtkisi: 0.20,
    aciklama: () => "Doktor notunda kritik durum ifadesi (sepsis/entübasyon) — acil işlem olabilir.",
    oneri: () => "Yoğun bakım yatış notu ve enfeksiyon hastalıkları konsültasyonu ekleyin.",
  },
  {
    id: "KURAL-053",
    ad: "Kronik böbrek yetmezliği ifadesi",
    kategori: "klinik",
    kosul: (v) => /kronik böbrek|kby|böbrek yetmezliği|renal yetmezlik/.test(notLower(v)),
    riskEtkisi: 0.15,
    aciklama: () => "Doktor notunda kronik böbrek yetmezliği ifadesi — nefroloji belgeleri gerekli.",
    oneri: () => "Nefroloji raporu, GFR değeri ve diyaliz endikasyonu belgesi ekleyin.",
  },
  {
    id: "KURAL-054",
    ad: "Diyabet ifadesi",
    kategori: "klinik",
    kosul: (v) => /diyabet|diabetes|hba1c|insülin|kan şekeri/.test(notLower(v)),
    riskEtkisi: 0.08,
    aciklama: () => "Doktor notunda diyabet ifadesi tespit edildi.",
    oneri: () => "HbA1c değeri ve dahiliye/endokrin konsültasyon notu ekleyin.",
  },
  {
    id: "KURAL-055",
    ad: "Hipertansiyon ifadesi",
    kategori: "klinik",
    kosul: (v) => /hipertansiyon|tansiyon yüksek|hta/.test(notLower(v)),
    riskEtkisi: 0.05,
    aciklama: () => "Doktor notunda hipertansiyon ifadesi tespit edildi.",
    oneri: () => "Tansiyon takip değerleri ve kardiyoloji notu ekleyin.",
  },
];

module.exports = { KURAL_TANIMLARI, YUKSEK_RISK_KODLARI, RISK_KELIMELER, EKSIK_BELGE_PATTERNS };
