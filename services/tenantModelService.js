/**
 * Tenant-Aware Öğrenen Model Servisi
 *
 * Her hastane/kurum için ayrı ML ağırlıkları, işlem kodu ve provider
 * bazlı red/onay istatistikleri tutar. Zamanla kurum verisinden öğrenir.
 *
 * "Sistem her kurumda zamanla o kurumun işleyişine uyum sağlar."
 */

const { getDb, saveDb } = require("../db/core");
const { mapExecRows } = require("../db/utils");

// ── Varsayılan ML Ağırlıkları (yeni tenant'lar için başlangıç) ──────
const DEFAULT_AGIRLIKLAR = {
  yuksek_risk_kodu: 0.35,
  risk_kelime_basina: 0.12,
  eksik_belge: 0.40,
  yas_65_yogun: 0.25,
  gecmis_red_basina: 0.06,
  gecmis_red_max: 0.25,
  doktor_notu_yok: 0.10,
  ameliyat_kodu: 0.20,
  diyaliz_kodu: 0.30,
};

const DEFAULT_META = {
  egitimSayisi: 0,
  sonGuncelleme: null,
  dogrulukOrani: null,
  retrainSayaci: 0,
};

// ── Yardımcılar ─────────────────────────────────────────────────────

function normalizeHospitalId(value) {
  if (value === null || value === undefined) return null;
  const n = String(value).trim();
  return n || null;
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function clamp(val, min = 0, max = 1) {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function oran(red, toplam) {
  if (!toplam) return 0;
  return Math.round((red / toplam) * 10000) / 10000;
}

function sonucRedMi(sonuc) {
  const s = String(sonuc || "").toUpperCase();
  return s.includes("RED") && !s.includes("ONAY");
}

function sonucOnayMi(sonuc) {
  return String(sonuc || "").toUpperCase().includes("ONAY");
}

// ── Tablo Oluşturma (güvenlik için) ─────────────────────────────────

async function ensureTenantTables() {
  const db = await getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS tenant_models (
      hospital_id TEXT PRIMARY KEY,
      agirliklar_json TEXT NOT NULL,
      meta_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tenant_procedure_stats (
      hospital_id TEXT NOT NULL,
      islem_kodu TEXT NOT NULL,
      toplam INTEGER DEFAULT 0,
      red INTEGER DEFAULT 0,
      onay INTEGER DEFAULT 0,
      red_orani REAL DEFAULT 0,
      son_guncelleme TEXT,
      PRIMARY KEY (hospital_id, islem_kodu)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tenant_provider_stats (
      hospital_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      toplam INTEGER DEFAULT 0,
      red INTEGER DEFAULT 0,
      onay INTEGER DEFAULT 0,
      red_orani REAL DEFAULT 0,
      son_guncelleme TEXT,
      PRIMARY KEY (hospital_id, provider)
    );
  `);
}

// ── Model CRUD ──────────────────────────────────────────────────────

async function getOrCreateTenantModel(hospitalId) {
  const hId = normalizeHospitalId(hospitalId);
  if (!hId) return { agirliklar: { ...DEFAULT_AGIRLIKLAR }, meta: { ...DEFAULT_META } };

  await ensureTenantTables();
  const db = await getDb();

  const rows = mapExecRows(
    db.exec("SELECT * FROM tenant_models WHERE hospital_id = ?", [hId])
  );

  if (rows.length > 0) {
    const row = rows[0];
    return {
      agirliklar: safeJsonParse(row.agirliklar_json, { ...DEFAULT_AGIRLIKLAR }),
      meta: safeJsonParse(row.meta_json, { ...DEFAULT_META }),
    };
  }

  // Yoksa yeni oluştur
  const now = new Date().toISOString();
  const agirliklar = { ...DEFAULT_AGIRLIKLAR };
  const meta = { ...DEFAULT_META };

  db.run(
    `INSERT INTO tenant_models (hospital_id, agirliklar_json, meta_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [hId, JSON.stringify(agirliklar), JSON.stringify(meta), now, now]
  );
  await saveDb();

  return { agirliklar, meta };
}

async function saveTenantModel(hospitalId, agirliklar, meta) {
  const hId = normalizeHospitalId(hospitalId);
  if (!hId) return;

  await ensureTenantTables();
  const db = await getDb();
  const now = new Date().toISOString();

  const existing = mapExecRows(
    db.exec("SELECT hospital_id FROM tenant_models WHERE hospital_id = ?", [hId])
  );

  if (existing.length > 0) {
    db.run(
      `UPDATE tenant_models SET agirliklar_json = ?, meta_json = ?, updated_at = ?
       WHERE hospital_id = ?`,
      [JSON.stringify(agirliklar), JSON.stringify(meta), now, hId]
    );
  } else {
    db.run(
      `INSERT INTO tenant_models (hospital_id, agirliklar_json, meta_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [hId, JSON.stringify(agirliklar), JSON.stringify(meta), now, now]
    );
  }

  await saveDb();
}

// ── İstatistik Güncelleme ───────────────────────────────────────────

async function updateTenantStats(hospitalId, { islem_kodu, provider, sonuc }) {
  const hId = normalizeHospitalId(hospitalId);
  if (!hId) return;

  await ensureTenantTables();
  const db = await getDb();
  const now = new Date().toISOString();
  const isRed = sonucRedMi(sonuc);
  const isOnay = sonucOnayMi(sonuc);

  // ── Procedure Stats (UPSERT) ──
  if (islem_kodu) {
    const procRows = mapExecRows(
      db.exec(
        "SELECT * FROM tenant_procedure_stats WHERE hospital_id = ? AND islem_kodu = ?",
        [hId, islem_kodu]
      )
    );

    if (procRows.length > 0) {
      const row = procRows[0];
      const newToplam = (Number(row.toplam) || 0) + 1;
      const newRed = (Number(row.red) || 0) + (isRed ? 1 : 0);
      const newOnay = (Number(row.onay) || 0) + (isOnay ? 1 : 0);

      db.run(
        `UPDATE tenant_procedure_stats
         SET toplam = ?, red = ?, onay = ?, red_orani = ?, son_guncelleme = ?
         WHERE hospital_id = ? AND islem_kodu = ?`,
        [newToplam, newRed, newOnay, oran(newRed, newToplam), now, hId, islem_kodu]
      );
    } else {
      db.run(
        `INSERT INTO tenant_procedure_stats (hospital_id, islem_kodu, toplam, red, onay, red_orani, son_guncelleme)
         VALUES (?, ?, 1, ?, ?, ?, ?)`,
        [hId, islem_kodu, isRed ? 1 : 0, isOnay ? 1 : 0, isRed ? 1 : 0, now]
      );
    }
  }

  // ── Provider Stats (UPSERT) ──
  if (provider) {
    const provRows = mapExecRows(
      db.exec(
        "SELECT * FROM tenant_provider_stats WHERE hospital_id = ? AND provider = ?",
        [hId, provider]
      )
    );

    if (provRows.length > 0) {
      const row = provRows[0];
      const newToplam = (Number(row.toplam) || 0) + 1;
      const newRed = (Number(row.red) || 0) + (isRed ? 1 : 0);
      const newOnay = (Number(row.onay) || 0) + (isOnay ? 1 : 0);

      db.run(
        `UPDATE tenant_provider_stats
         SET toplam = ?, red = ?, onay = ?, red_orani = ?, son_guncelleme = ?
         WHERE hospital_id = ? AND provider = ?`,
        [newToplam, newRed, newOnay, oran(newRed, newToplam), now, hId, provider]
      );
    } else {
      db.run(
        `INSERT INTO tenant_provider_stats (hospital_id, provider, toplam, red, onay, red_orani, son_guncelleme)
         VALUES (?, ?, 1, ?, ?, ?, ?)`,
        [hId, provider, isRed ? 1 : 0, isOnay ? 1 : 0, isRed ? 1 : 0, now]
      );
    }
  }

  // ── Retrain sayacı kontrolü ──
  const model = await getOrCreateTenantModel(hId);
  model.meta.retrainSayaci = (model.meta.retrainSayaci || 0) + 1;

  if (model.meta.retrainSayaci >= 50) {
    model.meta.retrainSayaci = 0;
    await saveTenantModel(hId, model.agirliklar, model.meta);
    await retrainTenantModel(hId);
  } else {
    await saveTenantModel(hId, model.agirliklar, model.meta);
  }

  await saveDb();
}

// ── Model Yeniden Eğitim ────────────────────────────────────────────

async function retrainTenantModel(hospitalId) {
  const hId = normalizeHospitalId(hospitalId);
  if (!hId) return;

  try {
    const db = await getDb();

    // Geçmiş verileri al (history tablosundan)
    const historyRows = mapExecRows(
      db.exec(
        "SELECT * FROM history WHERE hospital_id = ? ORDER BY time DESC LIMIT 500",
        [hId]
      )
    );

    if (!Array.isArray(historyRows) || historyRows.length < 20) {
      console.log(`[TENANT_MODEL] ${hId}: Yeterli veri yok (${historyRows.length} kayıt), retrain atlandı.`);
      return;
    }

    // ai_feedback tablosundan da veri al
    const feedbackRows = mapExecRows(
      db.exec(
        "SELECT * FROM ai_feedback WHERE hospital_id = ? ORDER BY time DESC LIMIT 500",
        [hId]
      )
    );

    const allRows = [...historyRows, ...feedbackRows];

    let toplamKayit = 0;
    let dogruTahmin = 0;

    const model = await getOrCreateTenantModel(hId);
    const agirliklar = { ...model.agirliklar };

    // İşlem kodu bazlı red oranlarından öğren
    const procStats = mapExecRows(
      db.exec(
        "SELECT * FROM tenant_procedure_stats WHERE hospital_id = ? AND toplam >= 5",
        [hId]
      )
    );

    // Yüksek red oranlı işlem kodlarını belirle
    const yuksekRedliIslemler = new Set();
    for (const ps of procStats) {
      if (Number(ps.red_orani) >= 0.5 && Number(ps.toplam) >= 5) {
        yuksekRedliIslemler.add(ps.islem_kodu);
      }
    }

    // Back-test ile doğruluk hesapla
    for (const kayit of allRows) {
      if (!kayit.sonuc) continue;

      const gercekRed = sonucRedMi(kayit.sonuc) ? 1 : 0;
      const kod = kayit.islem_kodu || "";
      const not = String(kayit.doktor_notu || kayit.hata || "").toLowerCase();
      const yas = Number(kayit.hasta_yas) || 0;

      // Basit skor hesapla (mevcut ağırlıklarla)
      let skor = 0;

      if (yuksekRedliIslemler.has(kod)) {
        skor += agirliklar.yuksek_risk_kodu;
      }

      const riskKelimeler = ["kronik", "ameliyat", "operasyon", "yoğun bakım", "kanser", "diyaliz"];
      const riskSayisi = riskKelimeler.filter((k) => not.includes(k)).length;
      skor += riskSayisi * agirliklar.risk_kelime_basina;

      if (!not.trim() || not.trim().length < 10) {
        skor += agirliklar.doktor_notu_yok;
      }

      if (yas >= 65 && not.includes("yoğun")) {
        skor += agirliklar.yas_65_yogun;
      }

      skor = clamp(skor, 0, 1);
      const tahmin = skor >= 0.5 ? 1 : 0;

      if (tahmin === gercekRed) dogruTahmin++;
      toplamKayit++;
    }

    const dogruluk = toplamKayit > 0 ? dogruTahmin / toplamKayit : null;

    // Doğruluk düşükse ağırlıkları ayarla
    if (dogruluk !== null && dogruluk < 0.75) {
      agirliklar.risk_kelime_basina = Math.min(agirliklar.risk_kelime_basina * 1.05, 0.25);
      agirliklar.gecmis_red_basina = Math.min(agirliklar.gecmis_red_basina * 1.05, 0.15);
      agirliklar.doktor_notu_yok = Math.min(agirliklar.doktor_notu_yok * 1.03, 0.20);
    } else if (dogruluk !== null && dogruluk > 0.90) {
      // Çok yüksek doğrulukta aşırı öğrenmeyi engelle
      agirliklar.risk_kelime_basina = Math.max(agirliklar.risk_kelime_basina * 0.98, 0.05);
    }

    // Provider bazlı risk profilinden ağırlık ayarla
    const provStats = mapExecRows(
      db.exec(
        "SELECT * FROM tenant_provider_stats WHERE hospital_id = ? AND toplam >= 10",
        [hId]
      )
    );

    const avgProviderRed = provStats.length > 0
      ? provStats.reduce((s, p) => s + Number(p.red_orani || 0), 0) / provStats.length
      : 0;

    // Kurum genelinde provider red oranı yüksekse, model bunu dikkate alsın
    if (avgProviderRed > 0.3) {
      agirliklar.gecmis_red_basina = Math.min(agirliklar.gecmis_red_basina * 1.02, 0.15);
    }

    const meta = {
      egitimSayisi: toplamKayit,
      sonGuncelleme: new Date().toISOString(),
      dogrulukOrani: dogruluk != null ? Math.round(dogruluk * 100) : null,
      retrainSayaci: 0,
    };

    await saveTenantModel(hId, agirliklar, meta);

    console.log(
      `[TENANT_MODEL] ${hId}: Retrain tamamlandı — Doğruluk: %${meta.dogrulukOrani} (${toplamKayit} kayıt)`
    );
  } catch (err) {
    console.error(`[TENANT_MODEL] ${hId}: Retrain hatası:`, err.message);
  }
}

// ── Kuruma Özel Risk Düzeltmesi ─────────────────────────────────────

async function getTenantRiskAdjustment(hospitalId, islem_kodu, provider) {
  const hId = normalizeHospitalId(hospitalId);
  if (!hId) return { adjustment: 0, reasons: [], procRedOrani: null, provRedOrani: null };

  await ensureTenantTables();
  const db = await getDb();

  let adjustment = 0;
  const reasons = [];
  let procRedOrani = null;
  let provRedOrani = null;

  // İşlem kodu bazlı
  if (islem_kodu) {
    const procRows = mapExecRows(
      db.exec(
        "SELECT * FROM tenant_procedure_stats WHERE hospital_id = ? AND islem_kodu = ?",
        [hId, islem_kodu]
      )
    );

    if (procRows.length > 0) {
      const ps = procRows[0];
      const toplam = Number(ps.toplam) || 0;
      procRedOrani = Number(ps.red_orani) || 0;

      if (toplam >= 5) {
        if (procRedOrani >= 0.6) {
          adjustment += 0.12;
          reasons.push(`Bu kurumda "${islem_kodu}" işleminin red oranı %${Math.round(procRedOrani * 100)} — yüksek risk.`);
        } else if (procRedOrani >= 0.35) {
          adjustment += 0.06;
          reasons.push(`Bu kurumda "${islem_kodu}" işleminin red oranı %${Math.round(procRedOrani * 100)} — orta risk.`);
        } else if (procRedOrani <= 0.1 && toplam >= 20) {
          adjustment -= 0.04;
          reasons.push(`Bu kurumda "${islem_kodu}" işlemi genelde onay alıyor (%${Math.round((1 - procRedOrani) * 100)} onay).`);
        }
      }
    }
  }

  // Provider bazlı
  if (provider) {
    const provRows = mapExecRows(
      db.exec(
        "SELECT * FROM tenant_provider_stats WHERE hospital_id = ? AND provider = ?",
        [hId, provider]
      )
    );

    if (provRows.length > 0) {
      const ps = provRows[0];
      const toplam = Number(ps.toplam) || 0;
      provRedOrani = Number(ps.red_orani) || 0;

      if (toplam >= 5) {
        if (provRedOrani >= 0.5) {
          adjustment += 0.08;
          reasons.push(`Bu kurumda "${provider}" provider'ının red oranı %${Math.round(provRedOrani * 100)} — yüksek.`);
        } else if (provRedOrani >= 0.3) {
          adjustment += 0.04;
          reasons.push(`Bu kurumda "${provider}" provider'ının red oranı %${Math.round(provRedOrani * 100)} — orta.`);
        } else if (provRedOrani <= 0.1 && toplam >= 20) {
          adjustment -= 0.03;
          reasons.push(`Bu kurumda "${provider}" genelde başarılı.`);
        }
      }
    }
  }

  adjustment = clamp(adjustment, -0.10, 0.20);

  return {
    adjustment: Math.round(adjustment * 100) / 100,
    reasons,
    procRedOrani,
    provRedOrani,
  };
}

// ── Model Durum Raporu ──────────────────────────────────────────────

async function getTenantModelStatus(hospitalId) {
  const hId = normalizeHospitalId(hospitalId);
  if (!hId) {
    return {
      aktif: false,
      mesaj: "hospitalId belirtilmedi.",
    };
  }

  const model = await getOrCreateTenantModel(hId);

  await ensureTenantTables();
  const db = await getDb();

  const procStats = mapExecRows(
    db.exec("SELECT COUNT(*) as cnt FROM tenant_procedure_stats WHERE hospital_id = ?", [hId])
  );
  const provStats = mapExecRows(
    db.exec("SELECT COUNT(*) as cnt FROM tenant_provider_stats WHERE hospital_id = ?", [hId])
  );

  return {
    aktif: true,
    hospitalId: hId,
    agirliklar: model.agirliklar,
    meta: model.meta,
    islemKoduSayisi: Number(procStats[0]?.cnt || 0),
    providerSayisi: Number(provStats[0]?.cnt || 0),
  };
}

// ── Kurum İçgörüleri ────────────────────────────────────────────────

async function getTenantInsights(hospitalId) {
  const hId = normalizeHospitalId(hospitalId);
  if (!hId) {
    return {
      enRiskliIslemler: [],
      enRiskliProviderlar: [],
      enBasariliIslemler: [],
      enBasariliProviderlar: [],
      ozet: null,
    };
  }

  await ensureTenantTables();
  const db = await getDb();

  // En riskli işlemler (red oranı yüksek, yeterli örneklem)
  const riskliIslemler = mapExecRows(
    db.exec(
      `SELECT * FROM tenant_procedure_stats
       WHERE hospital_id = ? AND toplam >= 3
       ORDER BY red_orani DESC, red DESC
       LIMIT 10`,
      [hId]
    )
  );

  // En riskli provider'lar
  const riskliProviderlar = mapExecRows(
    db.exec(
      `SELECT * FROM tenant_provider_stats
       WHERE hospital_id = ? AND toplam >= 3
       ORDER BY red_orani DESC, red DESC
       LIMIT 10`,
      [hId]
    )
  );

  // En başarılı işlemler (onay oranı yüksek)
  const basariliIslemler = mapExecRows(
    db.exec(
      `SELECT * FROM tenant_procedure_stats
       WHERE hospital_id = ? AND toplam >= 5
       ORDER BY red_orani ASC, onay DESC
       LIMIT 10`,
      [hId]
    )
  );

  // En başarılı provider'lar
  const basariliProviderlar = mapExecRows(
    db.exec(
      `SELECT * FROM tenant_provider_stats
       WHERE hospital_id = ? AND toplam >= 5
       ORDER BY red_orani ASC, onay DESC
       LIMIT 10`,
      [hId]
    )
  );

  // Genel özet
  const totalProc = mapExecRows(
    db.exec(
      "SELECT SUM(toplam) as t, SUM(red) as r, SUM(onay) as o FROM tenant_procedure_stats WHERE hospital_id = ?",
      [hId]
    )
  );

  const model = await getOrCreateTenantModel(hId);
  const t = totalProc[0] || {};

  return {
    enRiskliIslemler: riskliIslemler.map((r) => ({
      islem_kodu: r.islem_kodu,
      toplam: Number(r.toplam),
      red: Number(r.red),
      onay: Number(r.onay),
      redOrani: Number(r.red_orani),
    })),
    enRiskliProviderlar: riskliProviderlar.map((r) => ({
      provider: r.provider,
      toplam: Number(r.toplam),
      red: Number(r.red),
      onay: Number(r.onay),
      redOrani: Number(r.red_orani),
    })),
    enBasariliIslemler: basariliIslemler.map((r) => ({
      islem_kodu: r.islem_kodu,
      toplam: Number(r.toplam),
      red: Number(r.red),
      onay: Number(r.onay),
      redOrani: Number(r.red_orani),
    })),
    enBasariliProviderlar: basariliProviderlar.map((r) => ({
      provider: r.provider,
      toplam: Number(r.toplam),
      red: Number(r.red),
      onay: Number(r.onay),
      redOrani: Number(r.red_orani),
    })),
    ozet: {
      toplamIslem: Number(t.t) || 0,
      toplamRed: Number(t.r) || 0,
      toplamOnay: Number(t.o) || 0,
      genelRedOrani: Number(t.t) > 0 ? oran(Number(t.r), Number(t.t)) : 0,
      modelDogruluk: model.meta.dogrulukOrani,
      sonRetrain: model.meta.sonGuncelleme,
      egitimSayisi: model.meta.egitimSayisi,
    },
  };
}

module.exports = {
  getOrCreateTenantModel,
  saveTenantModel,
  updateTenantStats,
  retrainTenantModel,
  getTenantRiskAdjustment,
  getTenantModelStatus,
  getTenantInsights,
  DEFAULT_AGIRLIKLAR,
};
