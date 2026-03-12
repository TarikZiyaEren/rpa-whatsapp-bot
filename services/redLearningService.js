const { listHistory } = require("../repositories/historyRepository");
const {
  extractNoteTags,
  ageBucketFromValue,
} = require("../ai_learning/learningService");

function normalizeHospitalId(hospitalId) {
  if (hospitalId === null || hospitalId === undefined) {
    return null;
  }

  const normalized = String(hospitalId).trim();
  return normalized || null;
}

function safeUpper(value) {
  return String(value || "").toUpperCase();
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function safeNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function sonucRedMi(sonuc) {
  const s = safeUpper(sonuc);
  return s.includes("RED") && !s.includes("ONAY");
}

function sonucOnayMi(sonuc) {
  return safeUpper(sonuc).includes("ONAY");
}

function yasGrubu(yas) {
  return ageBucketFromValue(yas).toLowerCase();
}

function oran(red, total) {
  if (!total) return 0;
  return Math.round((red / total) * 10000) / 10000;
}

function parseEksikBelgeler(item) {
  try {
    const parsed = item.eksik_belgeler_json
      ? JSON.parse(item.eksik_belgeler_json)
      : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function scoreFromRate(rate, sampleSize, minSample = 3) {
  if (!sampleSize || sampleSize <= 0) return 0;
  const confidence = Math.min(1, sampleSize / Math.max(minSample, 10));
  return clamp(rate * (0.45 + confidence * 0.55), 0, 1);
}

function normalizeHistoryItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    sonuc: safeString(item.sonuc, ""),
    provider: safeString(item.provider || item.kaynak, "BILINMIYOR"),
    islem_kodu: safeString(item.islem_kodu, "BILINMIYOR"),
    islem_adi: safeString(item.islem_adi, "Bilinmeyen İşlem"),
    doktor_notu: safeString(item.doktor_notu, ""),
    red_nedeni: safeString(item.red_nedeni, ""),
    hasta_yas: safeNumber(item.hasta_yas, null),
    ai_risk: safeNumber(item.ai_risk, null),
    elapsedMs: safeNumber(item.elapsedMs, null),
  }));
}

function buildTrainingSnapshot(items) {
  const normalizedItems = normalizeHistoryItems(items);

  const byIslem = {};
  const byProvider = {};
  const byRedNedeni = {};
  const byEksikBelge = {};
  const byYasGrubu = {};
  const byKeywordCombo = {};
  const byProcProvider = {};
  const byProcAge = {};

  for (const item of normalizedItems) {
    const isRed = sonucRedMi(item.sonuc);
    const isOk = sonucOnayMi(item.sonuc);
    const proc = item.islem_kodu || "BILINMIYOR";
    const provider = item.provider || "BILINMIYOR";
    const redNedeni = item.red_nedeni || null;
    const ageBucket = yasGrubu(item.hasta_yas);
    const tags = extractNoteTags(item.doktor_notu || "");
    const eksikBelgeler = parseEksikBelgeler(item);
    const procProviderKey = `${proc}__${provider}`;
    const procAgeKey = `${proc}__${ageBucket}`;

    if (!byIslem[proc]) {
      byIslem[proc] = {
        kod: proc,
        ad: item.islem_adi || "Bilinmeyen İşlem",
        toplam: 0,
        red: 0,
        onay: 0,
      };
    }
    byIslem[proc].toplam += 1;
    if (isRed) byIslem[proc].red += 1;
    if (isOk) byIslem[proc].onay += 1;

    if (!byProvider[provider]) {
      byProvider[provider] = { provider, toplam: 0, red: 0, onay: 0 };
    }
    byProvider[provider].toplam += 1;
    if (isRed) byProvider[provider].red += 1;
    if (isOk) byProvider[provider].onay += 1;

    if (!byYasGrubu[ageBucket]) {
      byYasGrubu[ageBucket] = { grup: ageBucket, toplam: 0, red: 0 };
    }
    byYasGrubu[ageBucket].toplam += 1;
    if (isRed) byYasGrubu[ageBucket].red += 1;

    if (!byProcProvider[procProviderKey]) {
      byProcProvider[procProviderKey] = {
        key: procProviderKey,
        islem_kodu: proc,
        provider,
        toplam: 0,
        red: 0,
      };
    }
    byProcProvider[procProviderKey].toplam += 1;
    if (isRed) byProcProvider[procProviderKey].red += 1;

    if (!byProcAge[procAgeKey]) {
      byProcAge[procAgeKey] = {
        key: procAgeKey,
        islem_kodu: proc,
        yas_grubu: ageBucket,
        toplam: 0,
        red: 0,
      };
    }
    byProcAge[procAgeKey].toplam += 1;
    if (isRed) byProcAge[procAgeKey].red += 1;

    if (redNedeni) {
      if (!byRedNedeni[redNedeni]) {
        byRedNedeni[redNedeni] = { neden: redNedeni, adet: 0 };
      }
      byRedNedeni[redNedeni].adet += 1;
    }

    for (const belge of eksikBelgeler) {
      const key = safeString(belge);
      if (!key) continue;

      if (!byEksikBelge[key]) {
        byEksikBelge[key] = { belge: key, adet: 0 };
      }
      byEksikBelge[key].adet += 1;
    }

    for (const tag of tags) {
      const comboKey = `${proc}__${tag}__${ageBucket}`;

      if (!byKeywordCombo[comboKey]) {
        byKeywordCombo[comboKey] = {
          islem_kodu: proc,
          etiket: tag,
          yas_grubu: ageBucket,
          toplam: 0,
          red: 0,
          ornek_red_nedeni: redNedeni || null,
        };
      }

      byKeywordCombo[comboKey].toplam += 1;
      if (isRed) byKeywordCombo[comboKey].red += 1;
    }
  }

  const islemRiskleri = Object.values(byIslem)
    .map((x) => ({
      ...x,
      redOrani: oran(x.red, x.toplam),
    }))
    .sort((a, b) => b.redOrani - a.redOrani || b.red - a.red || b.toplam - a.toplam);

  const providerRiskleri = Object.values(byProvider)
    .map((x) => ({
      ...x,
      redOrani: oran(x.red, x.toplam),
    }))
    .sort((a, b) => b.redOrani - a.redOrani || b.red - a.red || b.toplam - a.toplam);

  const yasRiskleri = Object.values(byYasGrubu)
    .map((x) => ({
      ...x,
      redOrani: oran(x.red, x.toplam),
    }))
    .sort((a, b) => b.redOrani - a.redOrani || b.red - a.red || b.toplam - a.toplam);

  const procProviderRiskleri = Object.values(byProcProvider)
    .map((x) => ({
      ...x,
      redOrani: oran(x.red, x.toplam),
    }))
    .sort((a, b) => b.redOrani - a.redOrani || b.red - a.red || b.toplam - a.toplam);

  const procAgeRiskleri = Object.values(byProcAge)
    .map((x) => ({
      ...x,
      redOrani: oran(x.red, x.toplam),
    }))
    .sort((a, b) => b.redOrani - a.redOrani || b.red - a.red || b.toplam - a.toplam);

  const redNedeniDagilimi = Object.values(byRedNedeni).sort((a, b) => b.adet - a.adet);

  const eksikBelgeDagilimi = Object.values(byEksikBelge).sort((a, b) => b.adet - a.adet);

  const keywordPatternleri = Object.values(byKeywordCombo)
    .map((x) => ({
      ...x,
      redOrani: oran(x.red, x.toplam),
    }))
    .filter((x) => x.toplam >= 1)
    .sort((a, b) => b.redOrani - a.redOrani || b.red - a.red || b.toplam - a.toplam);

  return {
    totalRecords: normalizedItems.length,
    islemRiskleri,
    providerRiskleri,
    yasRiskleri,
    procProviderRiskleri,
    procAgeRiskleri,
    redNedeniDagilimi,
    eksikBelgeDagilimi,
    keywordPatternleri,
    enRiskliIslemler: islemRiskleri.slice(0, 10),
    enRiskliProviderlar: providerRiskleri.slice(0, 10),
    enSikEksikBelgeler: eksikBelgeDagilimi.slice(0, 10),
    enSikRedNedenleri: redNedeniDagilimi.slice(0, 10),
    yasDagilimi: yasRiskleri,
  };
}

async function buildRedLearningSummary(hospitalId = null, limit = 5000) {
  const normalizedHospitalId = normalizeHospitalId(hospitalId);

  if (!normalizedHospitalId) {
    return buildTrainingSnapshot([]);
  }

  try {
    const items = await listHistory(limit, normalizedHospitalId);
    return buildTrainingSnapshot(items);
  } catch (err) {
    if (String(err.message || "").includes("hospitalId zorunludur")) {
      return buildTrainingSnapshot([]);
    }
    throw err;
  }
}

async function getRiskPrediction(input = {}, hospitalId = null) {
  const {
    islem_kodu,
    provider,
    doktor_notu,
    hasta_yas,
  } = input;

  const normalizedHospitalId = normalizeHospitalId(hospitalId);
  const summary = await buildRedLearningSummary(normalizedHospitalId, 5000);

  const proc = safeString(islem_kodu, "BILINMIYOR");
  const prov = safeString(provider, "BILINMIYOR");
  const ageBucket = yasGrubu(hasta_yas);
  const tags = extractNoteTags(doktor_notu || "");

  const procStats = summary.islemRiskleri.find((x) => x.kod === proc) || null;
  const providerStats = summary.providerRiskleri.find((x) => x.provider === prov) || null;
  const ageStats = summary.yasRiskleri.find((x) => x.grup === ageBucket) || null;
  const procProviderStats =
    summary.procProviderRiskleri.find(
      (x) => x.islem_kodu === proc && x.provider === prov
    ) || null;
  const procAgeStats =
    summary.procAgeRiskleri.find(
      (x) => x.islem_kodu === proc && x.yas_grubu === ageBucket
    ) || null;

  let risk = 0.08;
  let featureCount = 0;
  const reasons = [];
  const features = [];

  if (procStats && procStats.toplam >= 1) {
    const score = scoreFromRate(procStats.redOrani, procStats.toplam, 5) * 0.34;
    risk += score;
    featureCount += 1;
    features.push({
      ad: "islem_gecmisi",
      agirlik: 0.34,
      ornek: procStats.toplam,
      redOrani: procStats.redOrani,
      katkisi: Math.round(score * 10000) / 10000,
    });
    reasons.push(`İşlem geçmiş red oranı: %${Math.round(procStats.redOrani * 100)}`);
  }

  if (providerStats && providerStats.toplam >= 1) {
    const score = scoreFromRate(providerStats.redOrani, providerStats.toplam, 5) * 0.18;
    risk += score;
    featureCount += 1;
    features.push({
      ad: "provider_gecmisi",
      agirlik: 0.18,
      ornek: providerStats.toplam,
      redOrani: providerStats.redOrani,
      katkisi: Math.round(score * 10000) / 10000,
    });
    reasons.push(`Provider geçmiş red oranı: %${Math.round(providerStats.redOrani * 100)}`);
  }

  if (ageStats && ageStats.toplam >= 1) {
    const score = scoreFromRate(ageStats.redOrani, ageStats.toplam, 5) * 0.1;
    risk += score;
    featureCount += 1;
    features.push({
      ad: "yas_grubu_gecmisi",
      agirlik: 0.1,
      ornek: ageStats.toplam,
      redOrani: ageStats.redOrani,
      katkisi: Math.round(score * 10000) / 10000,
    });
    reasons.push(`Yaş grubu (${ageBucket}) red oranı: %${Math.round(ageStats.redOrani * 100)}`);
  }

  if (procProviderStats && procProviderStats.toplam >= 1) {
    const score = scoreFromRate(procProviderStats.redOrani, procProviderStats.toplam, 4) * 0.22;
    risk += score;
    featureCount += 1;
    features.push({
      ad: "islem_provider_bilesimi",
      agirlik: 0.22,
      ornek: procProviderStats.toplam,
      redOrani: procProviderStats.redOrani,
      katkisi: Math.round(score * 10000) / 10000,
    });
    reasons.push("İşlem-provider kombinasyonunda red paterni bulundu");
  }

  if (procAgeStats && procAgeStats.toplam >= 1) {
    const score = scoreFromRate(procAgeStats.redOrani, procAgeStats.toplam, 4) * 0.1;
    risk += score;
    featureCount += 1;
    features.push({
      ad: "islem_yas_bilesimi",
      agirlik: 0.1,
      ornek: procAgeStats.toplam,
      redOrani: procAgeStats.redOrani,
      katkisi: Math.round(score * 10000) / 10000,
    });
    reasons.push("İşlem-yaş grubu kombinasyonunda red paterni bulundu");
  }

  for (const tag of tags) {
    const match = summary.keywordPatternleri.find(
      (x) =>
        x.islem_kodu === proc &&
        x.etiket === tag &&
        x.yas_grubu === ageBucket
    );

    if (match && match.toplam >= 1) {
      const score = scoreFromRate(match.redOrani, match.toplam, 3) * 0.08;
      risk += score;
      featureCount += 1;
      features.push({
        ad: `not_etiketi:${tag}`,
        agirlik: 0.08,
        ornek: match.toplam,
        redOrani: match.redOrani,
        katkisi: Math.round(score * 10000) / 10000,
      });
      reasons.push(`Doktor notu etiketi '${tag}' için red paterni bulundu`);
    }
  }

  if (!safeString(doktor_notu)) {
    risk += 0.06;
    features.push({
      ad: "doktor_notu_bos",
      agirlik: 0.06,
      ornek: 0,
      redOrani: null,
      katkisi: 0.06,
    });
    reasons.push("Doktor notu boş olduğu için risk artırıldı");
  } else if (safeString(doktor_notu).length < 25) {
    risk += 0.03;
    features.push({
      ad: "doktor_notu_kisa",
      agirlik: 0.03,
      ornek: 0,
      redOrani: null,
      katkisi: 0.03,
    });
    reasons.push("Doktor notu kısa olduğu için açıklama gücü zayıf");
  }

  const confidenceBase = Math.min(1, summary.totalRecords / 300);
  const featureConfidence = Math.min(1, featureCount / 5);
  const confidence =
    Math.round(((confidenceBase * 0.6) + (featureConfidence * 0.4)) * 100) / 100;

  risk = clamp(risk, 0.02, 0.99);

  let seviye = "DÜŞÜK";
  if (risk >= 0.7) seviye = "YÜKSEK";
  else if (risk >= 0.4) seviye = "ORTA";

  return {
    model: "historical-risk-v2",
    risk: Math.round(risk * 100) / 100,
    seviye,
    confidence,
    reasons: [...new Set(reasons)],
    features,
    topReasons: summary.redNedeniDagilimi.slice(0, 3),
    topMissingDocs: summary.eksikBelgeDagilimi.slice(0, 5),
    procStats,
    providerStats,
    ageStats,
    procProviderStats,
    procAgeStats,
    trainingStats: {
      totalRecords: summary.totalRecords,
      distinctProcedures: summary.islemRiskleri.length,
      distinctProviders: summary.providerRiskleri.length,
      keywordPatterns: summary.keywordPatternleri.length,
    },
  };
}

module.exports = {
  buildRedLearningSummary,
  getRiskPrediction,
};