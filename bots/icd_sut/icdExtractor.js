const ICD_RULES = [
  {
    icd: "N18.4",
    ad: "Kronik böbrek yetmezliği evre 4",
    kategori: "Üriner",
    score: 0.95,
    patterns: [
      /kronik böbrek yetmezliği.*evre\s*4/i,
      /kböy.*evre\s*4/i,
      /ckd.*stage\s*4/i,
    ],
    keywords: ["kronik", "böbrek", "yetmezliği", "evre 4"],
  },
  {
    icd: "N18.5",
    ad: "Kronik böbrek yetmezliği evre 5",
    kategori: "Üriner",
    score: 0.95,
    patterns: [
      /kronik böbrek yetmezliği.*evre\s*5/i,
      /kböy.*evre\s*5/i,
      /ckd.*stage\s*5/i,
    ],
    keywords: ["kronik", "böbrek", "yetmezliği", "evre 5"],
  },
  {
    icd: "N18.6",
    ad: "Son dönem böbrek yetmezliği / diyaliz",
    kategori: "Üriner",
    score: 0.97,
    patterns: [
      /hemodiyaliz/i,
      /periton diyalizi/i,
      /diyaliz hastası/i,
      /esrd/i,
    ],
    keywords: ["diyaliz"],
  },
  {
    icd: "N19",
    ad: "Böbrek yetmezliği",
    kategori: "Üriner",
    score: 0.72,
    patterns: [
      /böbrek yetmezliği/i,
      /renal yetmezlik/i,
      /renal failure/i,
    ],
    keywords: ["böbrek", "yetmezliği"],
  },
  {
    icd: "I10",
    ad: "Hipertansiyon",
    kategori: "Kardiyovasküler",
    score: 0.9,
    patterns: [
      /hipertansiyon/i,
      /\bht\b/i,
      /yüksek tansiyon/i,
    ],
    keywords: ["hipertansiyon"],
  },
  {
    icd: "I25.9",
    ad: "Koroner arter hastalığı",
    kategori: "Kardiyovasküler",
    score: 0.84,
    patterns: [
      /koroner arter/i,
      /koroner hastal/i,
      /iskemik kalp/i,
      /\bcad\b/i,
    ],
    keywords: ["koroner", "kalp"],
  },
  {
    icd: "I50.0",
    ad: "Konjestif kalp yetmezliği",
    kategori: "Kardiyovasküler",
    score: 0.88,
    patterns: [
      /kalp yetmezliği/i,
      /konjestif kalp yetmezliği/i,
      /\bchf\b/i,
    ],
    keywords: ["kalp", "yetmezliği"],
  },
  {
    icd: "J18.9",
    ad: "Pnömoni",
    kategori: "Solunum",
    score: 0.86,
    patterns: [
      /pnömoni/i,
      /zatürre/i,
      /pneumonia/i,
    ],
    keywords: ["pnömoni"],
  },
  {
    icd: "J44.1",
    ad: "KOAH akut alevlenme",
    kategori: "Solunum",
    score: 0.84,
    patterns: [
      /koah/i,
      /\bcopd\b/i,
      /akut alevlenme/i,
    ],
    keywords: ["koah"],
  },
  {
    icd: "R05",
    ad: "Öksürük",
    kategori: "Semptom",
    score: 0.6,
    patterns: [
      /öksürük/i,
      /\bcough\b/i,
    ],
    keywords: ["öksürük"],
  },
  {
    icd: "R06.0",
    ad: "Dispne",
    kategori: "Semptom",
    score: 0.78,
    patterns: [
      /dispne/i,
      /nefes darlığı/i,
      /dyspnea/i,
    ],
    keywords: ["nefes", "darlığı"],
  },
  {
    icd: "R07.4",
    ad: "Göğüs ağrısı",
    kategori: "Semptom",
    score: 0.8,
    patterns: [
      /göğüs ağrısı/i,
      /chest pain/i,
    ],
    keywords: ["göğüs", "ağrı"],
  },
  {
    icd: "M54.5",
    ad: "Bel ağrısı",
    kategori: "Kas-İskelet",
    score: 0.84,
    patterns: [
      /bel ağrısı/i,
      /lomber ağrı/i,
      /low back pain/i,
    ],
    keywords: ["bel", "ağrı"],
  },
  {
    icd: "M17.1",
    ad: "Diz osteoartriti",
    kategori: "Kas-İskelet",
    score: 0.8,
    patterns: [
      /gonartroz/i,
      /diz osteoartrit/i,
      /diz kireçlenme/i,
    ],
    keywords: ["diz"],
  },
  {
    icd: "D64.9",
    ad: "Anemi",
    kategori: "Hematoloji",
    score: 0.82,
    patterns: [
      /anemi/i,
      /kansızlık/i,
      /hemoglobin düş/i,
    ],
    keywords: ["anemi"],
  },
  {
    icd: "E11.9",
    ad: "Tip 2 diabetes mellitus",
    kategori: "Endokrin",
    score: 0.86,
    patterns: [
      /tip 2 diyabet/i,
      /diabetes mellitus/i,
      /tip 2 dm/i,
      /diyabet/i,
      /şeker hastalığı/i,
    ],
    keywords: ["diyabet"],
  },
  {
    icd: "E78.5",
    ad: "Hiperlipidemi",
    kategori: "Endokrin",
    score: 0.76,
    patterns: [
      /hiperlipidemi/i,
      /kolesterol yüksek/i,
      /dislipidemi/i,
    ],
    keywords: ["kolesterol"],
  },
  {
    icd: "K80.2",
    ad: "Safra taşı",
    kategori: "Sindirim",
    score: 0.85,
    patterns: [
      /safra taşı/i,
      /kolelitiazis/i,
      /gallstone/i,
    ],
    keywords: ["safra", "taş"],
  },
  {
    icd: "K81.0",
    ad: "Akut kolesistit",
    kategori: "Sindirim",
    score: 0.86,
    patterns: [
      /akut kolesistit/i,
      /safra kesesi iltihabı/i,
      /cholecystitis/i,
    ],
    keywords: ["kolesistit"],
  },
];

function normalizeText(text = "") {
  return String(text || "")
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c");
}

function keywordScore(note, keywords = []) {
  if (!keywords.length) return 0;
  let matched = 0;

  for (const kw of keywords) {
    if (note.includes(normalizeText(kw))) matched += 1;
  }

  return matched / keywords.length;
}

function extractIcdCandidates(doktorNotu = "") {
  const raw = String(doktorNotu || "").trim();
  const note = normalizeText(raw);

  if (!note) {
    return {
      primary: null,
      candidates: [],
      confidence: 0,
      reason: "Doktor notu boş",
    };
  }

  const candidates = [];

  for (const rule of ICD_RULES) {
    let score = 0;
    const patternMatched = rule.patterns.some((p) => p.test(raw));
    const kwScore = keywordScore(note, rule.keywords);

    if (patternMatched) score += rule.score;
    score += kwScore * 0.35;

    if (score > 0.45) {
      candidates.push({
        icd: rule.icd,
        ad: rule.ad,
        kategori: rule.kategori,
        confidence: Math.min(0.99, Math.round(score * 100) / 100),
      });
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);

  return {
    primary: candidates[0] || null,
    candidates: candidates.slice(0, 5),
    confidence: candidates[0]?.confidence || 0,
    reason: candidates[0]
      ? `En güçlü eşleşme: ${candidates[0].icd} - ${candidates[0].ad}`
      : "Eşleşen ICD bulunamadı",
  };
}

module.exports = {
  extractIcdCandidates,
};