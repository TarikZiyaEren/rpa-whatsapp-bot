import { getDB } from "../db/db.js";

export function analyzeRedPatterns(limit = 2000) {

  const db = getDB();

  const rows = db.prepare(`
    SELECT
      islem_kodu,
      provider,
      hasta_yas,
      sonuc,
      red_nedeni,
      eksik_belgeler_json
    FROM history
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);

  const patterns = {
    işlemRisk: {},
    providerRisk: {},
    belgeEksikliği: {},
    yaşDağılımı: {}
  };

  for (const r of rows) {

    const işlem = r.islem_kodu || "unknown";
    const provider = r.provider || "unknown";
    const yas = r.hasta_yas || 0;

    if (!patterns.işlemRisk[işlem]) {
      patterns.işlemRisk[işlem] = { red: 0, toplam: 0 };
    }

    if (!patterns.providerRisk[provider]) {
      patterns.providerRisk[provider] = { red: 0, toplam: 0 };
    }

    patterns.işlemRisk[işlem].toplam++;
    patterns.providerRisk[provider].toplam++;

    if (r.sonuc === "RED") {

      patterns.işlemRisk[işlem].red++;
      patterns.providerRisk[provider].red++;

      if (r.red_nedeni) {
        patterns.belgeEksikliği[r.red_nedeni] =
          (patterns.belgeEksikliği[r.red_nedeni] || 0) + 1;
      }

      if (r.eksik_belgeler_json) {
        try {
          const belgeler = JSON.parse(r.eksik_belgeler_json);

          for (const b of belgeler) {
            patterns.belgeEksikliği[b] =
              (patterns.belgeEksikliği[b] || 0) + 1;
          }

        } catch {}
      }
    }

    const yasBandı =
      yas < 18 ? "0-18"
      : yas < 40 ? "18-40"
      : yas < 65 ? "40-65"
      : "65+";

    patterns.yaşDağılımı[yasBandı] =
      (patterns.yaşDağılımı[yasBandı] || 0) + 1;
  }

  return patterns;
}