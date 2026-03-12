const { extractIcdCandidates } = require("./icdExtractor");
const { tumSutKodlari, icdyeGoreSutOner } = require("./mapper");

function fallbackSuggestion(doktorNotu = "") {
  const not = String(doktorNotu).toLowerCase();
  const tum = tumSutKodlari();

  const eslesmeler = tum.filter((s) => {
    const ad = String(s.ad || "").toLowerCase();

    if (not.includes("dahiliye") && ad.includes("dahiliye")) return true;
    if (not.includes("böbrek") && (ad.includes("nefroloji") || ad.includes("diyaliz") || ad.includes("biyokimya"))) return true;
    if (not.includes("diyaliz") && ad.includes("diyaliz")) return true;
    if (not.includes("kan") && (ad.includes("kan") || ad.includes("biyokimya"))) return true;
    if (not.includes("kalp") && (ad.includes("kardiyo") || ad.includes("ekg") || ad.includes("eko"))) return true;
    if (not.includes("öksürük") && (ad.includes("akciğer") || ad.includes("göğüs") || ad.includes("toraks"))) return true;
    if (not.includes("safra") && (ad.includes("cerrahi") || ad.includes("kolesistektomi"))) return true;
    if (not.includes("diyabet") && (ad.includes("hba1c") || ad.includes("dahiliye"))) return true;

    return false;
  });

  return eslesmeler.slice(0, 5).map((x) => ({
    kod: x.sutKodu,
    ad: x.ad,
    kaynak: "fallback",
  }));
}

function islemOner(doktorNotu = "", options = {}) {
  const icdResult = extractIcdCandidates(doktorNotu);
  const primaryIcd = icdResult.primary?.icd || null;

  let oneriler = [];

  if (primaryIcd) {
    oneriler = icdyeGoreSutOner(primaryIcd, {
      yas: options.yas,
      doktorNotu,
    }).map((x) => ({
      kod: x.sutKodu,
      ad: x.ad,
      aciklama: x.aciklama,
      belgeler: x.belgeler,
      score: x.score,
      kaynak: "icd+sut",
      icd: primaryIcd,
    }));
  }

  if (!oneriler.length) {
    oneriler = fallbackSuggestion(doktorNotu);
  }

  return {
    doktorNotu,
    icd: icdResult.primary || null,
    icdAdaylari: icdResult.candidates || [],
    confidence: icdResult.confidence || 0,
    oneriler: oneriler.slice(0, 5),
    aciklama: icdResult.reason,
  };
}

module.exports = { islemOner };