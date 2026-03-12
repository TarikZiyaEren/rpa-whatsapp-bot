const { kuralTabanliRiskHesapla } = require("./rules");
const { aiAnaliz } = require("./nlp_provider");
const { mlRiskAnaliz, mlRiskAnalizTenant } = require("./ml_model");
const { ogrenmeAnaliziYap } = require("../../self_learning");
const { getRiskPrediction } = require("../../services/redLearningService");
const { getTenantRiskAdjustment } = require("../../services/tenantModelService");
const { kurallariDegerlendir } = require("../rule_engine");
const { aciklamaUret } = require("../explainable_ai");

function normalizeHospitalId(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

async function redRiskiAnaliz(veri, progress = () => {}) {
  const hospitalId = normalizeHospitalId(veri?.hospitalId);
  let gecmisRedler = [];

  try {
    const { listHistory } = require("../../repositories/historyRepository");

    if (hospitalId) {
      const tumGecmis = await listHistory(200, hospitalId);

      gecmisRedler = tumGecmis.filter(
        (h) =>
          (h.tc === veri.hasta.tc || h.tcKimlikNo === veri.hasta.tc) &&
          typeof h.sonuc === "string" &&
          h.sonuc.toUpperCase().includes("RED") &&
          !h.sonuc.toUpperCase().includes("ONAY")
      );

      if (gecmisRedler.length > 0) {
        progress(`📂 Geçmişte ${gecmisRedler.length} red kaydı bulundu.`);
      }
    } else {
      progress("ℹ️ hospitalId olmadığı için tenant bazlı geçmiş red analizi atlandı.");
    }
  } catch (e) {
    progress(`⚠️ Geçmiş red verisi alınamadı: ${e.message}`);
  }

  const nedenler = [];

  progress("🔍 Kural tabanlı ön analiz başlıyor...");
  const kuralSonuc = kuralTabanliRiskHesapla({
    islemKodu: veri.islem?.kodu,
    doktorNotu: veri.doktorNotu,
    hastaYas: veri.hasta.yas,
  });

  progress(`📊 Kural skoru: ${(kuralSonuc.riskSkoru * 100).toFixed(0)}%`);

  for (const u of kuralSonuc.uyarilar || []) {
    progress(`  ⚠️ ${u}`);
    nedenler.push(u);
  }

  if (!kuralSonuc.uyarilar?.length) {
    nedenler.push("Kural tabanlı analizde kritik uyarı tespit edilmedi.");
  }

  if (Array.isArray(kuralSonuc.belgeNedenleri) && kuralSonuc.belgeNedenleri.length) {
    nedenler.push(...kuralSonuc.belgeNedenleri);
  }

  // --- Deterministik Kural Motoru ---
  progress("📋 Deterministik kural motoru çalıştırılıyor...");
  let kuralMotorSonuc = null;
  try {
    kuralMotorSonuc = kurallariDegerlendir({
      islemKodu: veri.islem?.kodu,
      doktorNotu: veri.doktorNotu,
      hastaYas: veri.hasta.yas,
    });

    if (kuralMotorSonuc.tetiklenenSayisi > 0) {
      progress(`📋 ${kuralMotorSonuc.tetiklenenSayisi}/${kuralMotorSonuc.kuralSayisi} kural tetiklendi:`);
      for (const t of kuralMotorSonuc.tetiklenenler) {
        progress(`  → ${t.kuralId}: ${t.aciklama}`);
        nedenler.push(`[${t.kuralId}] ${t.aciklama}`);
      }
    } else {
      progress("📋 Hiçbir deterministik kural tetiklenmedi.");
    }
  } catch (e) {
    progress(`⚠️ Kural motoru hatası: ${e.message}`);
  }

  if (veri.hasta?.yas != null) {
    if (veri.hasta.yas >= 65) {
      nedenler.push("Hasta yaşı ileri grupta olduğu için işlem dikkatli değerlendirilmelidir.");
    } else if (veri.hasta.yas < 18) {
      nedenler.push("Hasta pediatrik yaş grubunda olduğu için ek dikkat önerilir.");
    } else {
      nedenler.push("Hasta yaşı standart risk aralığında.");
    }
  }

  const doktorNotu = String(veri.doktorNotu || "").trim();
  if (!doktorNotu) {
    nedenler.push("Doktor notu boş olduğu için analiz sınırlı veri ile yapıldı.");
  } else if (doktorNotu.length < 25) {
    nedenler.push("Doktor notu kısa olduğu için klinik açıklama gücü sınırlı.");
  } else {
    nedenler.push("Doktor notu mevcut, klinik bağlam analize dahil edildi.");
  }

  progress("🤖 ML model analizi başlıyor (kurum bazlı)...");
  let mlSonuc = null;

  try {
    mlSonuc = await mlRiskAnalizTenant(
      {
        islemKodu: veri.islem?.kodu,
        doktorNotu: veri.doktorNotu,
        hastaYas: veri.hasta.yas,
      },
      gecmisRedler.length,
      hospitalId
    );

    progress(`📈 ML skoru: ${(mlSonuc.mlSkoru * 100).toFixed(0)}% (${mlSonuc.seviye})`);

    if (mlSonuc.modelMeta?.tenantAktif) {
      progress(`🏥 Kurum bazlı model aktif — Eğitim: ${mlSonuc.modelMeta.tenantEgitimSayisi} kayıt`);
    }

    if (mlSonuc.modelMeta?.dogrulukOrani) {
      progress(
        `📊 Model doğruluğu: %${mlSonuc.modelMeta.dogrulukOrani} (${mlSonuc.modelMeta.egitimSayisi} kayıt)`
      );
    }

    if (mlSonuc.mlSkoru >= 0.7) {
      nedenler.push("ML model yüksek red olasılığı öngördü.");
    } else if (mlSonuc.mlSkoru >= 0.4) {
      nedenler.push("ML model orta seviyede red riski öngördü.");
    } else {
      nedenler.push("ML model düşük red riski öngördü.");
    }
  } catch (e) {
    progress(`⚠️ ML analizi başarısız: ${e.message}`);
    nedenler.push("ML analizi tamamlanamadı, karar daha çok kurallara dayandırıldı.");
  }

  progress("📚 Geçmiş veri skoru hesaplanıyor...");
  let historicalPrediction = null;

  try {
    historicalPrediction = await getRiskPrediction(
      {
        islem_kodu: veri.islem?.kodu,
        provider: veri.provider || veri.islem?.provider || null,
        doktor_notu: veri.doktorNotu,
        hasta_yas: veri.hasta?.yas,
      },
      hospitalId
    );

    progress(
      `📚 Geçmiş veri skoru: ${(Number(historicalPrediction.risk || 0) * 100).toFixed(0)}% (${historicalPrediction.seviye})`
    );

    if (historicalPrediction.risk >= 0.7) {
      nedenler.push("Geçmiş işlem verilerinde yüksek red riski görüldü.");
    } else if (historicalPrediction.risk >= 0.4) {
      nedenler.push("Geçmiş işlem verilerinde orta risk paterni görüldü.");
    } else {
      nedenler.push("Geçmiş işlem verileri düşük risk gösteriyor.");
    }

    if (Array.isArray(historicalPrediction.reasons) && historicalPrediction.reasons.length) {
      nedenler.push(...historicalPrediction.reasons);
    }
  } catch (e) {
    progress(`⚠️ Geçmiş veri skoru üretilemedi: ${e.message}`);
    nedenler.push("Geçmiş veri temelli risk skoru üretilemedi.");
  }

  let aiSonuc = null;

  if (kuralSonuc.aiGerekli) {
    progress("🧠 AI (LLM) analizi başlıyor...");
    try {
      aiSonuc = await aiAnaliz(veri.doktorNotu, veri.islem);
      progress(`🧠 AI red riski: ${(aiSonuc.redRiski * 100).toFixed(0)}%`);

      if (aiSonuc.redRiski >= 0.7) {
        nedenler.push("LLM analizi metindeki klinik bağlama göre yüksek risk işaret etti.");
      } else if (aiSonuc.redRiski >= 0.4) {
        nedenler.push("LLM analizi orta seviyede belirsizlik/risk işaret etti.");
      } else {
        nedenler.push("LLM analizi klinik notu düşük riskli değerlendirdi.");
      }

      if (Array.isArray(aiSonuc.gerekceler) && aiSonuc.gerekceler.length) {
        nedenler.push(...aiSonuc.gerekceler);
      }
    } catch (e) {
      progress(`⚠️ AI analizi başarısız: ${e.message}`);
      nedenler.push("LLM analizi tamamlanamadı.");
    }
  } else {
    progress("✅ Düşük risk — AI analizi atlandı.");
    nedenler.push("Kural skoru düşük olduğu için LLM analizi gereksiz görüldü.");
  }

  let finalRisk;

  if (aiSonuc && mlSonuc && historicalPrediction) {
    finalRisk =
      kuralSonuc.riskSkoru * 0.2 +
      mlSonuc.mlSkoru * 0.25 +
      aiSonuc.redRiski * 0.25 +
      historicalPrediction.risk * 0.3;
  } else if (mlSonuc && historicalPrediction) {
    finalRisk =
      kuralSonuc.riskSkoru * 0.35 +
      mlSonuc.mlSkoru * 0.3 +
      historicalPrediction.risk * 0.35;
  } else if (aiSonuc && historicalPrediction) {
    finalRisk =
      kuralSonuc.riskSkoru * 0.25 +
      aiSonuc.redRiski * 0.35 +
      historicalPrediction.risk * 0.4;
  } else if (historicalPrediction && !mlSonuc && !aiSonuc) {
    finalRisk =
      kuralSonuc.riskSkoru * 0.45 +
      historicalPrediction.risk * 0.55;
  } else if (mlSonuc) {
    finalRisk = kuralSonuc.riskSkoru * 0.45 + mlSonuc.mlSkoru * 0.55;
  } else if (aiSonuc) {
    finalRisk = kuralSonuc.riskSkoru * 0.4 + aiSonuc.redRiski * 0.6;
  } else {
    finalRisk = kuralSonuc.riskSkoru;
  }

  if (gecmisRedler.length > 0) {
    const artis = Math.min(gecmisRedler.length * 0.05, 0.2);
    finalRisk = Math.min(finalRisk + artis, 1.0);
    progress(
      `📈 Geçmiş red bonusu: +${(artis * 100).toFixed(0)}% → Final: ${(finalRisk * 100).toFixed(0)}%`
    );
    nedenler.push(
      `Aynı hasta için ${gecmisRedler.length} geçmiş red kaydı bulunduğu için risk artırıldı.`
    );
  } else {
    nedenler.push("Hasta için geçmiş red kaydı bulunmadı.");
  }

  let ogrenmeSonuc = null;

  try {
    ogrenmeSonuc = await ogrenmeAnaliziYap({
      hasta: veri.hasta,
      islem: veri.islem,
      doktorNotu: veri.doktorNotu,
      hospitalId,
    });

    if ((ogrenmeSonuc?.ogrenmePuani ?? 0) !== 0) {
      finalRisk = Math.max(0, Math.min(1, finalRisk + ogrenmeSonuc.ogrenmePuani));

      progress(
        `🧠 Self-learning düzeltmesi: ${
          ogrenmeSonuc.ogrenmePuani > 0 ? "+" : ""
        }${Math.round(ogrenmeSonuc.ogrenmePuani * 100)}%`
      );
    }

    if (Array.isArray(ogrenmeSonuc?.nedenler) && ogrenmeSonuc.nedenler.length) {
      nedenler.push(...ogrenmeSonuc.nedenler);
    }
  } catch (e) {
    progress(`⚠️ Self-learning analizi başarısız: ${e.message}`);
  }

  // ── Tenant-Aware Risk Düzeltmesi ──
  let tenantAdjustment = null;

  try {
    if (hospitalId) {
      progress("🏥 Kurum bazlı risk düzeltmesi hesaplanıyor...");
      tenantAdjustment = await getTenantRiskAdjustment(
        hospitalId,
        veri.islem?.kodu || null,
        veri.provider || veri.islem?.provider || null
      );

      if (tenantAdjustment.adjustment !== 0) {
        finalRisk = Math.max(0, Math.min(1, finalRisk + tenantAdjustment.adjustment));
        progress(
          `🏥 Kurum risk düzeltmesi: ${
            tenantAdjustment.adjustment > 0 ? "+" : ""
          }${Math.round(tenantAdjustment.adjustment * 100)}%`
        );
      }

      if (Array.isArray(tenantAdjustment.reasons) && tenantAdjustment.reasons.length) {
        nedenler.push(...tenantAdjustment.reasons);
      }
    }
  } catch (e) {
    progress(`⚠️ Kurum bazlı risk düzeltmesi başarısız: ${e.message}`);
  }

  const seviye =
    finalRisk >= 0.7 ? "YÜKSEK" :
    finalRisk >= 0.4 ? "ORTA" :
    "DÜŞÜK";

  if (seviye === "YÜKSEK") {
    nedenler.push("Final risk yüksek olduğu için manuel inceleme veya ek belge önerilir.");
  } else if (seviye === "ORTA") {
    nedenler.push("Final risk orta seviyede; işlem öncesi kontrol önerilir.");
  } else {
    nedenler.push("Final risk düşük; işlem standart akışta ilerleyebilir.");
  }

  const eksikBelgeler = [
    ...new Set([
      ...(kuralSonuc.eksikBelgeler || []),
      ...(aiSonuc?.eksikBelgeler || []),
      ...(historicalPrediction?.topMissingDocs || []).map((x) => x?.belge).filter(Boolean),
    ]),
  ];

  // --- Açıklanabilir AI Katmanı ---
  let aciklama = null;
  try {
    aciklama = aciklamaUret({
      kuralMotoru: kuralMotorSonuc,
      historicalData: historicalPrediction,
      mlSkoru: mlSonuc?.mlSkoru ?? null,
      aiSkoru: aiSonuc?.redRiski ?? null,
      aiGerekceler: aiSonuc?.gerekceler ?? [],
      finalRisk: parseFloat(finalRisk.toFixed(2)),
      seviye,
      ogrenmeSonuc,
      gecmisRedSayisi: gecmisRedler.length,
      veri: {
        islemKodu: veri.islem?.kodu,
        doktorNotu: veri.doktorNotu,
        hastaYas: veri.hasta?.yas,
        hasta: veri.hasta,
        islem: veri.islem,
      },
    });

    progress(`📖 Açıklama üretildi — Güven: ${aciklama.guvenSeviyesi} (${aciklama.kaynakSayisi} kaynak)`);
    progress(`📖 Özet: ${aciklama.ozet}`);
  } catch (e) {
    progress(`⚠️ Açıklanabilir AI hatası: ${e.message}`);
  }

  const rapor = {
    zaman: new Date().toISOString(),
    hasta: veri.hasta,
    islem: veri.islem,
    kuralSkoru: kuralSonuc.riskSkoru,
    mlSkoru: mlSonuc?.mlSkoru ?? null,
    historicalRisk: historicalPrediction?.risk ?? null,
    aiSkoru: aiSonuc?.redRiski ?? null,
    finalRisk: parseFloat(finalRisk.toFixed(2)),
    seviye,
    uyarilar: kuralSonuc.uyarilar || [],
    aiGerekceler: aiSonuc?.gerekceler ?? [],
    historicalReasons: historicalPrediction?.reasons ?? [],
    nedenler: [...new Set(nedenler)],
    oneri:
      aiSonuc?.oneri ??
      (seviye === "DÜŞÜK" ? "İşlem standart." : "Manuel inceleme önerilir."),
    eksikBelgeler,
    incelemeGerekli: finalRisk >= 0.5,
    gecmisRedSayisi: gecmisRedler.length,
    modelMeta: {
      ml: mlSonuc?.modelMeta ?? null,
      historical: historicalPrediction?.trainingStats ?? null,
      historicalConfidence: historicalPrediction?.confidence ?? null,
    },
    ogrenmePuani: ogrenmeSonuc?.ogrenmePuani ?? 0,

    // --- Tenant-Aware Model ---
    tenantModel: tenantAdjustment
      ? {
          adjustment: tenantAdjustment.adjustment,
          procRedOrani: tenantAdjustment.procRedOrani,
          provRedOrani: tenantAdjustment.provRedOrani,
          reasons: tenantAdjustment.reasons,
        }
      : null,

    // --- Kural Motoru + Açıklanabilir AI ---
    kuralMotoru: kuralMotorSonuc
      ? {
          tetiklenenler: kuralMotorSonuc.tetiklenenler,
          tetiklenenSayisi: kuralMotorSonuc.tetiklenenSayisi,
          toplamRisk: kuralMotorSonuc.toplamRisk,
          kategoriOzeti: kuralMotorSonuc.kategoriOzeti,
        }
      : null,
    aciklama: aciklama
      ? {
          kartlar: aciklama.kartlar,
          ozet: aciklama.ozet,
          guvenSkoru: aciklama.guvenSkoru,
          guvenSeviyesi: aciklama.guvenSeviyesi,
          detayliAciklama: aciklama.detayliAciklama,
          kaynakSayisi: aciklama.kaynakSayisi,
        }
      : null,
  };

  progress(`✅ Analiz tamamlandı — Risk: ${seviye} (%${Math.round(finalRisk * 100)})`);
  return rapor;
}

module.exports = { redRiskiAnaliz };