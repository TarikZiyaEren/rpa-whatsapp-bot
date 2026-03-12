/**
 * HL7 FHIR R4 istemcisi
 * FHIR_URL=http://localhost:5000 → fake sunucu
 * FHIR_URL=https://gercek.fhir.tr → gerçek sunucu
 *
 * Eğer FHIR erişilemezse akıllı mock fallback devreye girer.
 */

const FHIR_URL = process.env.FHIR_URL || "http://localhost:5000";
const FHIR_TOKEN = process.env.FHIR_TOKEN || "";

async function fhirGet(path) {
  const resp = await fetch(`${FHIR_URL}${path}`, {
    headers: {
      Accept: "application/fhir+json",
      ...(FHIR_TOKEN ? { Authorization: `Bearer ${FHIR_TOKEN}` } : {}),
    },
  });

  if (!resp.ok) {
    throw new Error(`FHIR ${path} → ${resp.status}`);
  }

  return resp.json();
}

function tcSonIki(tc) {
  const s = String(tc || "").replace(/\D/g, "");
  return s.slice(-2);
}

function normalizeFlag(flag) {
  const f = String(flag || "").trim().toLowerCase();

  if (["high", "h", "hh", "critical-high", "critical_high"].includes(f)) {
    return "high";
  }
  if (["low", "l", "ll", "critical-low", "critical_low"].includes(f)) {
    return "low";
  }
  return "normal";
}

function senaryoSec(tc) {
  const son = tcSonIki(tc);

  if (["10", "11", "12", "13"].includes(son)) return "bobrek";
  if (["20", "21", "22", "23"].includes(son)) return "kardiyak";
  if (["30", "31", "32", "33"].includes(son)) return "onkoloji";
  if (["40", "41", "42", "43"].includes(son)) return "ameliyat";
  if (["50", "51", "52", "53"].includes(son)) return "solunum";

  return "genel";
}

function scenarioFromHastaId(hastaId) {
  const raw = String(hastaId || "");

  if (raw.startsWith("mock-")) {
    return senaryoSec(raw.replace("mock-", ""));
  }

  return "genel";
}

function hashNumberFromTc(tc) {
  const digits = String(tc || "").replace(/\D/g, "");
  let sum = 0;

  for (let i = 0; i < digits.length; i++) {
    sum += Number(digits[i]) * (i + 1);
  }

  return sum;
}

function mockHasta(tc) {
  const scenario = senaryoSec(tc);
  const seed = hashNumberFromTc(tc);

  const erkekAdlar = ["Ahmet", "Mehmet", "Ali", "Hasan", "Mustafa", "Emre", "Burak", "Tarık"];
  const kadinAdlar = ["Ayşe", "Fatma", "Zeynep", "Elif", "Merve", "Seda", "Ece", "Buse"];
  const soyadlar = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Arslan", "Koç", "Aydın"];

  let cinsiyet = "female";
  if (["bobrek", "ameliyat", "solunum"].includes(scenario)) {
    cinsiyet = "male";
  }

  const adHavuzu = cinsiyet === "male" ? erkekAdlar : kadinAdlar;
  const ad = adHavuzu[seed % adHavuzu.length];
  const soyad = soyadlar[(seed * 3) % soyadlar.length];

  const yil = 1955 + (seed % 40);
  const ay = String((seed % 12) + 1).padStart(2, "0");
  const gun = String((seed % 28) + 1).padStart(2, "0");

  return {
    id: `mock-${tc}`,
    ad: `${ad} ${soyad}`,
    dogum: `${yil}-${ay}-${gun}`,
    cinsiyet,
    tc: String(tc || ""),
    scenario,
  };
}

function mockEpikrizler(hastaId) {
  const scenario = scenarioFromHastaId(hastaId);

  const map = {
    bobrek: [
      {
        id: "epi-bobrek-1",
        tarih: "2026-02-20",
        icerik:
          "Kronik böbrek yetmezliği evre 4. Kreatinin yüksek. Nefroloji kontrolü önerildi. Diyaliz değerlendirmesi planlandı.",
      },
      {
        id: "epi-bobrek-2",
        tarih: "2026-01-11",
        icerik:
          "Hastada renal fonksiyon bozukluğu mevcut. Üre ve kreatinin yüksek seyrediyor. Yakın takip önerildi.",
      },
      {
        id: "epi-bobrek-3",
        tarih: "2025-12-03",
        icerik:
          "Laboratuvar bulgularında eGFR düşüklüğü izlendi. Nefroloji poliklinik kontrolü önerildi.",
      },
    ],
    kardiyak: [
      {
        id: "epi-kalp-1",
        tarih: "2026-02-10",
        icerik:
          "Göğüs ağrısı yakınması ile başvurdu. Kardiyoloji değerlendirmesi yapıldı. EKG ve ekokardiyografi önerildi.",
      },
      {
        id: "epi-kalp-2",
        tarih: "2025-12-22",
        icerik:
          "Hipertansiyon ve koroner arter hastalığı öyküsü mevcut. Düzenli kardiyoloji kontrolü önerildi.",
      },
    ],
    onkoloji: [
      {
        id: "epi-onko-1",
        tarih: "2026-02-05",
        icerik:
          "Onkoloji takibinde. Tümör nedeniyle ileri değerlendirme planlandı. Patoloji raporu ve görüntüleme sonuçları mevcut.",
      },
      {
        id: "epi-onko-2",
        tarih: "2026-01-17",
        icerik:
          "Kanser tedavi süreci devam ediyor. Metastaz açısından yakın takip önerildi.",
      },
    ],
    ameliyat: [
      {
        id: "epi-cerrahi-1",
        tarih: "2026-02-26",
        icerik:
          "Safra taşı nedeniyle operasyon planlandı. Cerrahi konsültasyon yapıldı. Preop laboratuvar ve anestezi değerlendirmesi istendi.",
      },
      {
        id: "epi-cerrahi-2",
        tarih: "2026-02-01",
        icerik:
          "Batın USG bulguları operasyon ile uyumlu. Kolesistektomi açısından hazırlık sürüyor.",
      },
    ],
    solunum: [
      {
        id: "epi-solunum-1",
        tarih: "2026-02-08",
        icerik:
          "Nefes darlığı ve öksürük şikayeti mevcut. KOAH alevlenmesi / pnömoni açısından değerlendirme yapıldı.",
      },
      {
        id: "epi-solunum-2",
        tarih: "2026-01-04",
        icerik:
          "Akciğer grafisi önerildi. Solunum sistemi muayene bulguları izlem gerektiriyor.",
      },
    ],
    genel: [
      {
        id: "epi-genel-1",
        tarih: "2026-02-15",
        icerik: "Genel dahiliye kontrolü. Klinik durumu stabil. Rutin takip önerildi.",
      },
    ],
  };

  return map[scenario] || map.genel;
}

function mockTeshisler(hastaId) {
  const scenario = scenarioFromHastaId(hastaId);

  const map = {
    bobrek: [
      { id: "con-1", kod: "N18.4", ad: "Kronik böbrek yetmezliği evre 4", durum: "active" },
      { id: "con-2", kod: "N19", ad: "Böbrek yetmezliği", durum: "active" },
    ],
    kardiyak: [
      { id: "con-3", kod: "I10", ad: "Hipertansiyon", durum: "active" },
      { id: "con-4", kod: "I25.9", ad: "Koroner arter hastalığı", durum: "active" },
    ],
    onkoloji: [
      { id: "con-5", kod: "C80.1", ad: "Malign neoplazm", durum: "active" },
      { id: "con-6", kod: "R59.0", ad: "Lenf nodu büyümesi", durum: "active" },
    ],
    ameliyat: [
      { id: "con-7", kod: "K80.2", ad: "Safra taşı", durum: "active" },
      { id: "con-8", kod: "K81.0", ad: "Akut kolesistit", durum: "active" },
    ],
    solunum: [
      { id: "con-9", kod: "J44.1", ad: "KOAH akut alevlenme", durum: "active" },
      { id: "con-10", kod: "R05", ad: "Öksürük", durum: "active" },
    ],
    genel: [
      { id: "con-11", kod: "Z00.0", ad: "Genel muayene", durum: "active" },
    ],
  };

  return map[scenario] || map.genel;
}

function mockIlaclar(hastaId) {
  const scenario = scenarioFromHastaId(hastaId);

  const map = {
    bobrek: [
      { ilac: "Furosemid", tarih: "2026-02-20" },
      { ilac: "Kalsiyum asetat", tarih: "2026-02-20" },
      { ilac: "Eritropoietin", tarih: "2026-02-18" },
    ],
    kardiyak: [
      { ilac: "Aspirin", tarih: "2026-02-10" },
      { ilac: "Metoprolol", tarih: "2026-02-10" },
      { ilac: "Ramipril", tarih: "2026-02-10" },
    ],
    onkoloji: [
      { ilac: "Ondansetron", tarih: "2026-02-05" },
      { ilac: "Deksametazon", tarih: "2026-02-05" },
    ],
    ameliyat: [
      { ilac: "Sefazolin", tarih: "2026-02-26" },
      { ilac: "Parasetamol", tarih: "2026-02-26" },
    ],
    solunum: [
      { ilac: "Salbutamol", tarih: "2026-02-08" },
      { ilac: "Budesonid", tarih: "2026-02-08" },
      { ilac: "Amoksisilin-klavulanat", tarih: "2026-02-08" },
    ],
    genel: [
      { ilac: "Vitamin D", tarih: "2026-02-15" },
    ],
  };

  return map[scenario] || map.genel;
}

function mockLabSonuclari(hastaId) {
  const scenario = scenarioFromHastaId(hastaId);

  const map = {
    bobrek: [
      { test: "Kreatinin", deger: "3.2", birim: "mg/dL", referans: "0.7-1.2", tarih: "2026-02-20", flag: "high" },
      { test: "Üre", deger: "78", birim: "mg/dL", referans: "10-50", tarih: "2026-02-20", flag: "high" },
      { test: "eGFR", deger: "22", birim: "mL/min", referans: ">60", tarih: "2026-02-20", flag: "low" },
      { test: "Potasyum", deger: "5.7", birim: "mmol/L", referans: "3.5-5.1", tarih: "2026-02-20", flag: "high" },
    ],
    kardiyak: [
      { test: "Troponin", deger: "0.02", birim: "ng/mL", referans: "0-0.04", tarih: "2026-02-10", flag: "normal" },
      { test: "LDL", deger: "164", birim: "mg/dL", referans: "<100", tarih: "2026-02-10", flag: "high" },
    ],
    onkoloji: [
      { test: "Hemoglobin", deger: "10.1", birim: "g/dL", referans: "12-16", tarih: "2026-02-05", flag: "low" },
      { test: "CRP", deger: "18", birim: "mg/L", referans: "0-5", tarih: "2026-02-05", flag: "high" },
    ],
    ameliyat: [
      { test: "Hemogram", deger: "Uygun", birim: "", referans: "", tarih: "2026-02-26", flag: "normal" },
      { test: "INR", deger: "1.0", birim: "", referans: "0.8-1.2", tarih: "2026-02-26", flag: "normal" },
    ],
    solunum: [
      { test: "WBC", deger: "14.2", birim: "10^3/uL", referans: "4-10", tarih: "2026-02-08", flag: "high" },
      { test: "CRP", deger: "24", birim: "mg/L", referans: "0-5", tarih: "2026-02-08", flag: "high" },
      { test: "Oksijen satürasyonu", deger: "90", birim: "%", referans: "95-100", tarih: "2026-02-08", flag: "low" },
    ],
    genel: [
      { test: "Glukoz", deger: "96", birim: "mg/dL", referans: "70-100", tarih: "2026-02-15", flag: "normal" },
    ],
  };

  return (map[scenario] || map.genel).map((x) => ({
    ...x,
    flag: normalizeFlag(x.flag),
  }));
}

function mockGoruntulemeler(hastaId) {
  const scenario = scenarioFromHastaId(hastaId);

  const map = {
    bobrek: [
      { tur: "USG", bolge: "Böbrek", sonuc: "Parankim eko artışı mevcut.", tarih: "2026-02-19" },
      { tur: "USG", bolge: "Üriner sistem", sonuc: "Kronik parankimal değişiklikler izleniyor.", tarih: "2026-01-15" },
    ],
    kardiyak: [
      { tur: "EKG", bolge: "Kalp", sonuc: "Sinüs ritmi, nonspesifik ST değişikliği.", tarih: "2026-02-10" },
      { tur: "EKO", bolge: "Kalp", sonuc: "EF %55, hafif LVH.", tarih: "2026-02-11" },
    ],
    onkoloji: [
      { tur: "BT", bolge: "Toraks/Abdomen", sonuc: "Kitle lehine bulgular.", tarih: "2026-02-05" },
    ],
    ameliyat: [
      { tur: "USG", bolge: "Batın", sonuc: "Safra kesesinde taş ve duvar kalınlaşması.", tarih: "2026-02-01" },
    ],
    solunum: [
      { tur: "Akciğer Grafisi", bolge: "Toraks", sonuc: "İnfiltrasyon alanları mevcut.", tarih: "2026-02-08" },
      { tur: "BT", bolge: "Toraks", sonuc: "Enfeksiyon ile uyumlu infiltratif görünüm.", tarih: "2026-02-09" },
    ],
    genel: [
      { tur: "Grafi", bolge: "Genel", sonuc: "Belirgin patoloji izlenmedi.", tarih: "2026-02-15" },
    ],
  };

  return map[scenario] || map.genel;
}

function mockProsedurler(hastaId) {
  const scenario = scenarioFromHastaId(hastaId);

  const map = {
    bobrek: [
      { kod: "571.060", ad: "Serum Kreatinin", tarih: "2026-02-20" },
      { kod: "571.070", ad: "Üre Testi", tarih: "2026-02-20" },
      { kod: "520.040", ad: "Nefroloji Muayenesi", tarih: "2026-02-20" },
    ],
    kardiyak: [
      { kod: "610.030", ad: "Elektrokardiyografi (EKG)", tarih: "2026-02-10" },
      { kod: "610.010", ad: "Ekokardiyografi", tarih: "2026-02-11" },
    ],
    onkoloji: [
      { kod: "571.010", ad: "Tam Kan Sayımı", tarih: "2026-02-05" },
    ],
    ameliyat: [
      { kod: "800.010", ad: "Laparoskopik Kolesistektomi", tarih: "2026-02-26" },
    ],
    solunum: [
      { kod: "610.020", ad: "Akciğer Grafisi", tarih: "2026-02-08" },
      { kod: "520.015", ad: "Göğüs Hastalıkları Muayenesi", tarih: "2026-02-08" },
    ],
    genel: [
      { kod: "520.010", ad: "Dahiliye Muayenesi", tarih: "2026-02-15" },
    ],
  };

  return map[scenario] || map.genel;
}

async function hastaGetir(tc) {
  try {
    const bundle = await fhirGet(
      `/Patient?identifier=urn:oid:2.16.840.1.113883.4.3.792|${tc}`
    );

    const entry = bundle.entry?.[0]?.resource;
    if (!entry) {
      throw new Error(`TC ${tc} için hasta bulunamadı.`);
    }

    return {
      id: entry.id,
      ad: entry.name?.[0]?.text || "",
      dogum: entry.birthDate || "",
      cinsiyet: entry.gender || "",
      tc: String(tc || ""),
      source: "FHIR",
    };
  } catch (_e) {
    return {
      ...mockHasta(tc),
      source: "FHIR_MOCK",
    };
  }
}

async function epikrizlerGetir(hastaId) {
  if (String(hastaId || "").startsWith("mock-")) {
    return mockEpikrizler(hastaId);
  }

  try {
    const bundle = await fhirGet(
      `/DocumentReference?patient=${hastaId}&type=34133-9&_count=10`
    );

    return (bundle.entry || []).map((e) => ({
      id: e.resource.id,
      tarih: e.resource.date,
      icerik: e.resource.content?.[0]?.attachment?.data
        ? Buffer.from(e.resource.content[0].attachment.data, "base64").toString()
        : e.resource.description || "",
    }));
  } catch (_e) {
    return [];
  }
}

async function teshislerGetir(hastaId) {
  if (String(hastaId || "").startsWith("mock-")) {
    return mockTeshisler(hastaId);
  }

  try {
    const bundle = await fhirGet(`/Condition?patient=${hastaId}&_count=20`);

    return (bundle.entry || []).map((e) => ({
      id: e.resource.id,
      kod: e.resource.code?.coding?.[0]?.code || "",
      ad: e.resource.code?.coding?.[0]?.display || "",
      durum: e.resource.clinicalStatus?.coding?.[0]?.code || "",
    }));
  } catch (_e) {
    return [];
  }
}

async function ilaclarGetir(hastaId) {
  if (String(hastaId || "").startsWith("mock-")) {
    return mockIlaclar(hastaId);
  }

  try {
    const bundle = await fhirGet(`/MedicationRequest?patient=${hastaId}&_count=20`);

    return (bundle.entry || []).map((e) => ({
      ilac: e.resource.medicationCodeableConcept?.text || "",
      tarih: e.resource.authoredOn || "",
    }));
  } catch (_e) {
    return [];
  }
}

async function labSonuclariGetir(hastaId) {
  if (String(hastaId || "").startsWith("mock-")) {
    return mockLabSonuclari(hastaId);
  }

  try {
    const bundle = await fhirGet(`/Observation?patient=${hastaId}&category=laboratory&_count=20`);

    return (bundle.entry || []).map((e) => ({
      test: e.resource.code?.text || e.resource.code?.coding?.[0]?.display || "",
      deger:
        e.resource.valueQuantity?.value != null
          ? String(e.resource.valueQuantity.value)
          : (e.resource.valueString || ""),
      birim: e.resource.valueQuantity?.unit || "",
      referans: e.resource.referenceRange?.[0]?.text || "",
      tarih: e.resource.effectiveDateTime || e.resource.issued || "",
      flag: normalizeFlag(
        e.resource.interpretation?.[0]?.coding?.[0]?.code ||
        e.resource.interpretation?.[0]?.text ||
        "normal"
      ),
    }));
  } catch (_e) {
    return [];
  }
}

async function goruntulemelerGetir(hastaId) {
  if (String(hastaId || "").startsWith("mock-")) {
    return mockGoruntulemeler(hastaId);
  }

  try {
    const bundle = await fhirGet(`/DiagnosticReport?patient=${hastaId}&_count=20`);

    return (bundle.entry || []).map((e) => ({
      tur: e.resource.code?.text || e.resource.code?.coding?.[0]?.display || "Rapor",
      bolge: e.resource.category?.[0]?.text || "",
      sonuc: e.resource.conclusion || "",
      tarih: e.resource.effectiveDateTime || e.resource.issued || "",
    }));
  } catch (_e) {
    return [];
  }
}

async function prosedurlerGetir(hastaId) {
  if (String(hastaId || "").startsWith("mock-")) {
    return mockProsedurler(hastaId);
  }

  try {
    const bundle = await fhirGet(`/Procedure?patient=${hastaId}&_count=20`);

    return (bundle.entry || []).map((e) => ({
      kod: e.resource.code?.coding?.[0]?.code || "",
      ad: e.resource.code?.text || e.resource.code?.coding?.[0]?.display || "",
      tarih: e.resource.performedDateTime || "",
    }));
  } catch (_e) {
    return [];
  }
}

module.exports = {
  hastaGetir,
  epikrizlerGetir,
  teshislerGetir,
  ilaclarGetir,
  labSonuclariGetir,
  goruntulemelerGetir,
  prosedurlerGetir,
};