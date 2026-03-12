const { addFeedback, listFeedback } = require("./feedbackStore");

function safeUpper(value) {
  return String(value || "").toUpperCase();
}

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function parseEksikBelgeler(value) {
  if (!value) return [];

  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value)
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
}

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

function ageBucketFromValue(yas) {
  const n = Number(yas || 0);
  if (!Number.isFinite(n) || n <= 0) return "BILINMIYOR";
  if (n < 18) return "0-17";
  if (n < 40) return "18-39";
  if (n < 65) return "40-64";
  return "65+";
}

function extractNoteTags(doktorNotu = "") {
  const text = normalizeText(doktorNotu);
  const tags = [];

  const RULES = [
    ["diyabet", ["diyabet", "dm", "tip 2 diyabet", "seker hastaligi"]],
    ["hipertansiyon", ["hipertansiyon", "ht", "yuksek tansiyon"]],
    ["bobrek", ["bobrek", "renal", "kreatinin", "ure"]],
    ["diyaliz", ["diyaliz", "hemodiyaliz", "periton"]],
    ["kalp", ["kalp", "koroner", "kardiyak", "gogus agrisi"]],
    ["solunum", ["oksuruk", "nefes darligi", "dispne", "koah", "pnomoni", "zaturre"]],
    ["safra", ["safra", "kolesistit", "kolelitiazis"]],
    ["anemi", ["anemi", "kansizlik", "hemoglobin"]],
  ];

  for (const [tag, patterns] of RULES) {
    if (patterns.some((p) => text.includes(normalizeText(p)))) {
      tags.push(tag);
    }
  }

  return [...new Set(tags)];
}

function createEmptyPatternAnalysis() {
  return {
    islemRisk: {},
    providerRisk: {},
    belgeEksikligi: {},
    yasDagilimi: {},
    redNedeniDagilimi: {},
    notTagRisk: {},
    enRiskliIslemler: [],
    enRiskliProviderlar: [],
    enSikEksikBelgeler: [],
    enSikRedNedenleri: [],
    enRiskliNotEtiketleri: [],
  };
}

function analyzeRedPatterns(items) {
  const patternAnalysis = createEmptyPatternAnalysis();

  for (const item of items) {
    const sonuc = safeUpper(item.sonuc);
    const isRed = sonuc.includes("RED") && !sonuc.includes("ONAY");
    const islemKodu = item.islem_kodu || "BILINMIYOR";
    const provider = item.provider || "BILINMIYOR";
    const yasBandi = ageBucketFromValue(item.hasta_yas);
    const redNedeni = item.red_nedeni || item.hata_mesaji || null;
    const eksikBelgeler = parseEksikBelgeler(item.eksik_belgeler_json);
    const tags = extractNoteTags(item.doktor_notu);

    if (!patternAnalysis.islemRisk[islemKodu]) {
      patternAnalysis.islemRisk[islemKodu] = {
        red: 0,
        toplam: 0,
        redOrani: 0,
      };
    }

    if (!patternAnalysis.providerRisk[provider]) {
      patternAnalysis.providerRisk[provider] = {
        red: 0,
        toplam: 0,
        redOrani: 0,
      };
    }

    if (!patternAnalysis.yasDagilimi[yasBandi]) {
      patternAnalysis.yasDagilimi[yasBandi] = {
        grup: yasBandi,
        red: 0,
        toplam: 0,
        redOrani: 0,
      };
    }

    patternAnalysis.islemRisk[islemKodu].toplam += 1;
    patternAnalysis.providerRisk[provider].toplam += 1;
    patternAnalysis.yasDagilimi[yasBandi].toplam += 1;

    if (isRed) {
      patternAnalysis.islemRisk[islemKodu].red += 1;
      patternAnalysis.providerRisk[provider].red += 1;
      patternAnalysis.yasDagilimi[yasBandi].red += 1;

      if (redNedeni) {
        patternAnalysis.redNedeniDagilimi[redNedeni] =
          (patternAnalysis.redNedeniDagilimi[redNedeni] || 0) + 1;
      }

      for (const belge of eksikBelgeler) {
        patternAnalysis.belgeEksikligi[belge] =
          (patternAnalysis.belgeEksikligi[belge] || 0) + 1;
      }
    }

    for (const tag of tags) {
      const key = `${islemKodu}__${yasBandi}__${tag}`;

      if (!patternAnalysis.notTagRisk[key]) {
        patternAnalysis.notTagRisk[key] = {
          key,
          tag,
          islem_kodu: islemKodu,
          yas_grubu: yasBandi,
          red: 0,
          toplam: 0,
          redOrani: 0,
        };
      }

      patternAnalysis.notTagRisk[key].toplam += 1;
      if (isRed) patternAnalysis.notTagRisk[key].red += 1;
    }
  }

  for (const kod of Object.keys(patternAnalysis.islemRisk)) {
    const row = patternAnalysis.islemRisk[kod];
    row.redOrani = row.toplam ? Math.round((row.red / row.toplam) * 10000) / 10000 : 0;
  }

  for (const provider of Object.keys(patternAnalysis.providerRisk)) {
    const row = patternAnalysis.providerRisk[provider];
    row.redOrani = row.toplam ? Math.round((row.red / row.toplam) * 10000) / 10000 : 0;
  }

  for (const grup of Object.keys(patternAnalysis.yasDagilimi)) {
    const row = patternAnalysis.yasDagilimi[grup];
    row.redOrani = row.toplam ? Math.round((row.red / row.toplam) * 10000) / 10000 : 0;
  }

  for (const key of Object.keys(patternAnalysis.notTagRisk)) {
    const row = patternAnalysis.notTagRisk[key];
    row.redOrani = row.toplam ? Math.round((row.red / row.toplam) * 10000) / 10000 : 0;
  }

  const enRiskliIslemler = Object.entries(patternAnalysis.islemRisk)
    .map(([kod, data]) => ({ kod, ...data }))
    .sort((a, b) => {
      if (b.redOrani !== a.redOrani) return b.redOrani - a.redOrani;
      return b.red - a.red;
    })
    .slice(0, 10);

  const enRiskliProviderlar = Object.entries(patternAnalysis.providerRisk)
    .map(([provider, data]) => ({ provider, ...data }))
    .sort((a, b) => {
      if (b.redOrani !== a.redOrani) return b.redOrani - a.redOrani;
      return b.red - a.red;
    })
    .slice(0, 10);

  const enSikEksikBelgeler = Object.entries(patternAnalysis.belgeEksikligi)
    .map(([belge, adet]) => ({ belge, adet }))
    .sort((a, b) => b.adet - a.adet)
    .slice(0, 10);

  const enSikRedNedenleri = Object.entries(patternAnalysis.redNedeniDagilimi)
    .map(([neden, adet]) => ({ neden, adet }))
    .sort((a, b) => b.adet - a.adet)
    .slice(0, 10);

  const enRiskliNotEtiketleri = Object.values(patternAnalysis.notTagRisk)
    .sort((a, b) => {
      if (b.redOrani !== a.redOrani) return b.redOrani - a.redOrani;
      return b.red - a.red;
    })
    .slice(0, 10);

  return {
    ...patternAnalysis,
    enRiskliIslemler,
    enRiskliProviderlar,
    enSikEksikBelgeler,
    enSikRedNedenleri,
    enRiskliNotEtiketleri,
  };
}

async function recordLearningEvent(data) {
  try {
    await addFeedback({
      hospital_id: data.hospital_id ?? null,
      time: new Date().toISOString(),
      tc: data.tc ?? null,
      hasta_ad: data.hasta_ad ?? null,
      hasta_yas: data.hasta_yas ?? null,
      islem_kodu: data.islem_kodu ?? null,
      islem_adi: data.islem_adi ?? null,
      doktor_notu: data.doktor_notu ?? null,
      ai_risk: clamp(data.ai_risk ?? 0, 0, 1),
      ai_seviye: data.ai_seviye ?? null,
      ai_oneri: data.ai_oneri ?? null,
      sonuc: data.sonuc ?? null,
      hata_kodu: data.hata_kodu ?? null,
      hata_mesaji: data.hata_mesaji ?? null,
      red_nedeni: data.red_nedeni ?? data.hata_mesaji ?? null,
      eksik_belgeler_json: data.eksik_belgeler_json ?? null,
      retry_kullanildi: data.retry_kullanildi ? 1 : 0,
      retry_yeni_kod: data.retry_yeni_kod ?? null,
      retry_basarili: data.retry_basarili ? 1 : 0,
      provider: data.provider ?? null,
    });

    // ── Tenant istatistiklerini güncelle ──
    if (data.hospital_id && data.sonuc) {
      try {
        const { updateTenantStats } = require("../services/tenantModelService");
        await updateTenantStats(data.hospital_id, {
          islem_kodu: data.islem_kodu ?? null,
          provider: data.provider ?? null,
          sonuc: data.sonuc,
        });
      } catch (tenantErr) {
        console.warn("[AI_LEARNING] Tenant stats güncellenemedi:", tenantErr.message);
      }
    }
  } catch (err) {
    console.error("[AI_LEARNING] kayıt başarısız:", err.message);
  }
}

async function getLearningSummary(hospitalId = null) {
  try {
    const items = await listFeedback(5000, hospitalId);

    if (!items || !items.length) {
      return {
        total: 0,
        onay: 0,
        red: 0,
        retrySuccess: 0,
        avgRisk: 0,
        redRate: 0,
        calibrationError: 0,
        patternAnalysis: createEmptyPatternAnalysis(),
      };
    }

    const total = items.length;

    const onay = items.filter((x) => safeUpper(x.sonuc).includes("ONAY")).length;

    const red = items.filter(
      (x) => safeUpper(x.sonuc).includes("RED") && !safeUpper(x.sonuc).includes("ONAY")
    ).length;

    const retrySuccess = items.filter((x) => Number(x.retry_basarili) === 1).length;

    const avgRisk =
      Math.round(
        (items.reduce((sum, x) => sum + clamp(x.ai_risk || 0, 0, 1), 0) / total) * 100
      ) / 100;

    const actualRedRate = total ? red / total : 0;
    const calibrationError = Math.round(Math.abs(avgRisk - actualRedRate) * 10000) / 10000;
    const redRate = total ? Math.round(actualRedRate * 10000) / 10000 : 0;
    const patternAnalysis = analyzeRedPatterns(items);

    return {
      total,
      onay,
      red,
      retrySuccess,
      avgRisk,
      redRate,
      calibrationError,
      patternAnalysis,
    };
  } catch (err) {
    console.error("[AI_LEARNING] özet hesaplanamadı:", err.message);

    return {
      total: 0,
      onay: 0,
      red: 0,
      retrySuccess: 0,
      avgRisk: 0,
      redRate: 0,
      calibrationError: 0,
      patternAnalysis: createEmptyPatternAnalysis(),
    };
  }
}

module.exports = {
  recordLearningEvent,
  getLearningSummary,
  analyzeRedPatterns,
  extractNoteTags,
  ageBucketFromValue,
};