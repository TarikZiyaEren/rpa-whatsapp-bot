/**
 * Kural tabanlı red riski tespiti.
 * AI çağrısından önce çalışır — hızlı ve ücretsiz.
 */

const YUKSEK_RISK_KODLARI = new Set([
  "520.030", "531.020", "640.010", "680.010", "800.010",
]);

const RISK_KELIMELER = [
  "kronik", "ameliyat", "operasyon", "yoğun bakım",
  "kanser", "tümör", "diyaliz", "transplant",
  "metastaz", "sepsis", "entübasyon",
];

const EKSIK_BELGE_PATTERN = [
  /epikriz\s*yok/i,
  /rapor\s*eklenmemi/i,
  /imza\s*eksik/i,
  /belge\s*eksik/i,
];

function uniq(items = []) {
  return [...new Set(items.filter(Boolean).map((x) => String(x).trim()))];
}

function tahminiBelgeleriBul(veri) {
  const notLower = String(veri.doktorNotu || "").toLowerCase();
  const islemKodu = String(veri.islemKodu || "").trim();
  const belgeler = [];
  const nedenler = [];

  if (!notLower) {
    nedenler.push("Doktor notu boş olduğu için belge tahmini sınırlı yapıldı.");
  }

  if (notLower.includes("ameliyat") || notLower.includes("operasyon")) {
    belgeler.push("Cerrahi konsültasyon");
    belgeler.push("Preop laboratuvar sonuçları");
    nedenler.push("Ameliyat / operasyon ifadesi nedeniyle cerrahi evrak önerildi.");
  }

  if (notLower.includes("yoğun bakım")) {
    belgeler.push("Yoğun bakım yatış notu");
    belgeler.push("Epikriz");
    nedenler.push("Yoğun bakım ifadesi nedeniyle yatış ve epikriz belgesi önerildi.");
  }

  if (
    notLower.includes("kanser") ||
    notLower.includes("tümör") ||
    notLower.includes("metastaz")
  ) {
    belgeler.push("Patoloji raporu");
    belgeler.push("Onkoloji raporu");
    nedenler.push("Onkolojik ifade nedeniyle rapor/patoloji evrakı önerildi.");
  }

  if (
    notLower.includes("diyaliz") ||
    notLower.includes("hemodiyaliz") ||
    islemKodu === "680.010"
  ) {
    belgeler.push("Nefroloji raporu");
    belgeler.push("Diyaliz endikasyon belgesi");
    nedenler.push("Diyaliz ilişkili işlem nedeniyle nefroloji belgeleri önerildi.");
  }

  if (
    notLower.includes("kalp") ||
    notLower.includes("koroner") ||
    notLower.includes("kardiyak") ||
    notLower.includes("göğüs ağrısı")
  ) {
    belgeler.push("EKG");
    belgeler.push("Kardiyoloji konsültasyon notu");
    nedenler.push("Kardiyak ifade nedeniyle EKG ve konsültasyon önerildi.");
  }

  if (
    notLower.includes("öksürük") ||
    notLower.includes("nefes darlığı") ||
    notLower.includes("koah") ||
    notLower.includes("pnömoni") ||
    notLower.includes("zaturre")
  ) {
    belgeler.push("Akciğer grafisi");
    belgeler.push("Solunum muayene notu");
    nedenler.push("Solunum ilişkili ifade nedeniyle görüntüleme / muayene notu önerildi.");
  }

  if (
    notLower.includes("böbrek") ||
    notLower.includes("kreatinin") ||
    notLower.includes("üre") ||
    notLower.includes("renal")
  ) {
    belgeler.push("Kreatinin sonucu");
    belgeler.push("Üre sonucu");
    nedenler.push("Böbrek fonksiyon ifadesi nedeniyle lab sonuçları önerildi.");
  }

  if (
    notLower.includes("anemi") ||
    notLower.includes("kansızlık") ||
    notLower.includes("hemoglobin")
  ) {
    belgeler.push("Hemogram sonucu");
    nedenler.push("Hematolojik ifade nedeniyle hemogram önerildi.");
  }

  if (
    notLower.includes("safra") ||
    notLower.includes("kolesistit") ||
    notLower.includes("kolelitiazis") ||
    islemKodu === "800.010"
  ) {
    belgeler.push("Batın USG");
    belgeler.push("Cerrahi konsültasyon");
    belgeler.push("Preop laboratuvar sonuçları");
    nedenler.push("Safra / kolesistektomi ilişkisi nedeniyle görüntüleme ve cerrahi belgeler önerildi.");
  }

  for (const pattern of EKSIK_BELGE_PATTERN) {
    if (pattern.test(notLower)) {
      belgeler.push("Epikriz");
      belgeler.push("İmzalı rapor");
      nedenler.push("Notta açık eksik belge ifadesi bulundu.");
      break;
    }
  }

  if (YUKSEK_RISK_KODLARI.has(islemKodu)) {
    belgeler.push("Uzman hekim notu");
    nedenler.push("Yüksek riskli işlem kodu nedeniyle uzman notu önerildi.");
  }

  return {
    eksikBelgeler: uniq(belgeler),
    belgeNedenleri: uniq(nedenler),
  };
}

function kuralTabanliRiskHesapla(veri) {
  const uyarilar = [];
  let risk = 0;

  if (YUKSEK_RISK_KODLARI.has(veri.islemKodu)) {
    risk += 0.3;
    uyarilar.push(`Yüksek riskli SUT kodu: ${veri.islemKodu}`);
  }

  const notLower = (veri.doktorNotu || "").toLowerCase();

  for (const kelime of RISK_KELIMELER) {
    if (notLower.includes(kelime)) {
      risk += 0.12;
      uyarilar.push(`Risk kelimesi tespit edildi: "${kelime}"`);
    }
  }

  for (const pattern of EKSIK_BELGE_PATTERN) {
    if (pattern.test(notLower)) {
      risk += 0.4;
      uyarilar.push("Eksik belge uyarısı tespit edildi.");
    }
  }

  if (veri.hastaYas && veri.hastaYas >= 65 && notLower.includes("yoğun")) {
    risk += 0.2;
    uyarilar.push("65+ hasta + yoğun bakım — yüksek risk.");
  }

  const belgeAnalizi = tahminiBelgeleriBul(veri);

  if (belgeAnalizi.eksikBelgeler.length >= 3) {
    risk += 0.1;
    uyarilar.push("Birden fazla kritik belge ihtiyacı öngörüldü.");
  }

  return {
    riskSkoru: Math.min(risk, 1.0),
    uyarilar,
    aiGerekli: risk > 0.2,
    eksikBelgeler: belgeAnalizi.eksikBelgeler,
    belgeNedenleri: belgeAnalizi.belgeNedenleri,
  };
}

module.exports = {
  kuralTabanliRiskHesapla,
  tahminiBelgeleriBul,
};