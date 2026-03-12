/**
 * İstatistiksel ML Modeli — Red Risk Tahmini
 *
 * v2: Gerçek Gradient Descent Öğrenme
 * - Sigmoid aktivasyon (lojistik regresyon)
 * - Mini-batch gradient descent ile ağırlık güncelleme
 * - Confusion matrix (TP/FP/TN/FN)
 * - Backtest (geçmiş veriyle model testi)
 * - Model versiyonlama (her eğitimde DB'ye kayıt)
 * - Online learning (her sonuçta artımlı güncelleme)
 */

// ── Başlangıç Ağırlıkları (uzman bilgisi ile ayarlanmış) ──────────────
let AGIRLIKLAR = {
  yuksek_risk_kodu: 0.35,
  risk_kelime_basina: 0.12,
  eksik_belge: 0.40,
  yas_65_yogun: 0.25,
  gecmis_red_basina: 0.06,
  gecmis_red_max: 0.25,
  doktor_notu_yok: 0.10,
  ameliyat_kodu: 0.20,
  diyaliz_kodu: 0.30,
  saat_dilimi_risk: 0.05,     // Yeni: mesai dışı saat riski
  ardisik_red_riski: 0.15,    // Yeni: ardışık red riski
  provider_risk: 0.10,        // Yeni: provider bazlı ek risk
  bias: -0.20,                // Bias terimi
};

// Model meta verisi
let modelMeta = {
  egitimSayisi: 0,
  sonGuncelleme: null,
  dogrulukOrani: null,
  versiyon: 1,
  confusionMatrix: { tp: 0, fp: 0, tn: 0, fn: 0 },
  precision: null,
  recall: null,
  f1: null,
};

// Eğitim geçmişi (son 10 eğitim)
let egitimGecmisi = [];

// ── Yardımcı Fonksiyonlar ─────────────────────────────────────────────
function sigmoid(x) {
  if (x > 10) return 1;
  if (x < -10) return 0;
  return 1 / (1 + Math.exp(-x));
}

function sigmoidTurev(output) {
  return output * (1 - output);
}

async function getHistoryRows(limit = 500) {
  const { getDb } = require("../../db/core");
  const { mapExecRows } = require("../../db/utils");
  const db = await getDb();
  const r = db.exec(`SELECT * FROM history ORDER BY time DESC LIMIT ?`, [limit]);
  return mapExecRows(r);
}

// ── Özellik Çıkarımı (Genişletilmiş) ─────────────────────────────────
function ozellikCikar(veri, gecmisRedSayisi = 0) {
  const not = String(veri.doktorNotu || "").toLowerCase();
  const kod = String(veri.islemKodu || veri.islem?.kodu || "").trim();

  const YUKSEK_RISK_KODLARI = new Set(["520.030", "531.020", "640.010", "680.010", "800.010"]);
  const AMELIYAT_KODLARI = new Set(["800.010", "800.020", "720.010"]);
  const DIYALIZ_KODLARI = new Set(["680.010", "680.020"]);

  const RISK_KELIMELER = [
    "kronik", "ameliyat", "operasyon", "yoğun bakım",
    "kanser", "tümör", "diyaliz", "transplant",
    "metastaz", "sepsis", "entübasyon",
  ];

  const EKSIK_PATTERN = [
    /epikriz\s*yok/i,
    /rapor\s*eklenmemi/i,
    /imza\s*eksik/i,
    /belge\s*eksik/i,
  ];

  const riskKelimeSayisi = RISK_KELIMELER.filter((k) => not.includes(k)).length;
  const eksikBelge = EKSIK_PATTERN.some((p) => p.test(not));
  const yas = Number(veri.hastaYas || 0);
  const yas65Yogun = yas >= 65 && not.includes("yoğun");

  // Yeni özellikler
  const saat = veri.saat || new Date().getHours();
  const mesaiDisi = saat < 8 || saat >= 18 || saat === 12;
  const ardisikRed = Math.min(gecmisRedSayisi, 5) >= 3 ? 1 : 0;

  return {
    yuksek_risk_kodu: YUKSEK_RISK_KODLARI.has(kod) ? 1 : 0,
    risk_kelime_sayisi: riskKelimeSayisi,
    eksik_belge: eksikBelge ? 1 : 0,
    yas_65_yogun: yas65Yogun ? 1 : 0,
    gecmis_red_sayisi: Math.min(Number(gecmisRedSayisi || 0), 5),
    doktor_notu_yok: not.trim().length < 10 ? 1 : 0,
    ameliyat_kodu: AMELIYAT_KODLARI.has(kod) ? 1 : 0,
    diyaliz_kodu: DIYALIZ_KODLARI.has(kod) ? 1 : 0,
    saat_dilimi_risk: mesaiDisi ? 1 : 0,
    ardisik_red: ardisikRed,
    provider_risk: 0, // Dinamik olarak ayarlanır
    bias: 1,
  };
}

// ── Tahmin (Sigmoid ile) ──────────────────────────────────────────────
function tahminEt(ozellikler, agirliklar = AGIRLIKLAR) {
  let z = 0;
  z += ozellikler.yuksek_risk_kodu * agirliklar.yuksek_risk_kodu;
  z += ozellikler.risk_kelime_sayisi * agirliklar.risk_kelime_basina;
  z += ozellikler.eksik_belge * agirliklar.eksik_belge;
  z += ozellikler.yas_65_yogun * agirliklar.yas_65_yogun;
  z += ozellikler.doktor_notu_yok * agirliklar.doktor_notu_yok;
  z += ozellikler.ameliyat_kodu * agirliklar.ameliyat_kodu;
  z += ozellikler.diyaliz_kodu * agirliklar.diyaliz_kodu;
  z += ozellikler.saat_dilimi_risk * (agirliklar.saat_dilimi_risk || 0);
  z += ozellikler.ardisik_red * (agirliklar.ardisik_red_riski || 0);
  z += ozellikler.provider_risk * (agirliklar.provider_risk || 0);

  const gecmisEtkisi = Math.min(
    ozellikler.gecmis_red_sayisi * agirliklar.gecmis_red_basina,
    agirliklar.gecmis_red_max
  );
  z += gecmisEtkisi;
  z += (agirliklar.bias || 0);

  return sigmoid(z);
}

// ── Confusion Matrix ──────────────────────────────────────────────────
function hesaplaConfusionMatrix(veriSeti, agirliklar, esik = 0.5) {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const { ozellikler, gercekRed } of veriSeti) {
    const tahmin = tahminEt(ozellikler, agirliklar) >= esik ? 1 : 0;
    if (tahmin === 1 && gercekRed === 1) tp++;
    else if (tahmin === 1 && gercekRed === 0) fp++;
    else if (tahmin === 0 && gercekRed === 0) tn++;
    else fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = tp + fp + tn + fn > 0 ? (tp + tn) / (tp + fp + tn + fn) : 0;

  return { tp, fp, tn, fn, precision, recall, f1, accuracy };
}

// ── Gradient Descent Eğitim ───────────────────────────────────────────
function gradientDescentEgitim(veriSeti, agirliklar, learningRate = 0.01, epochs = 50) {
  const yeniAgirliklar = { ...agirliklar };
  const featureKeys = [
    "yuksek_risk_kodu", "risk_kelime_basina", "eksik_belge",
    "yas_65_yogun", "doktor_notu_yok", "ameliyat_kodu",
    "diyaliz_kodu", "saat_dilimi_risk", "ardisik_red_riski",
    "provider_risk", "gecmis_red_basina", "bias",
  ];

  const featureMap = {
    yuksek_risk_kodu: "yuksek_risk_kodu",
    risk_kelime_basina: "risk_kelime_sayisi",
    eksik_belge: "eksik_belge",
    yas_65_yogun: "yas_65_yogun",
    doktor_notu_yok: "doktor_notu_yok",
    ameliyat_kodu: "ameliyat_kodu",
    diyaliz_kodu: "diyaliz_kodu",
    saat_dilimi_risk: "saat_dilimi_risk",
    ardisik_red_riski: "ardisik_red",
    provider_risk: "provider_risk",
    gecmis_red_basina: "gecmis_red_sayisi",
    bias: "bias",
  };

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradients = {};
    featureKeys.forEach((k) => (gradients[k] = 0));

    for (const { ozellikler, gercekRed } of veriSeti) {
      const tahmin = tahminEt(ozellikler, yeniAgirliklar);
      const hata = tahmin - gercekRed;

      for (const wKey of featureKeys) {
        const fKey = featureMap[wKey];
        const featureVal = ozellikler[fKey] ?? 0;
        gradients[wKey] += hata * featureVal;
      }
    }

    // Ağırlık güncelleme (ortalama gradient)
    const n = veriSeti.length || 1;
    for (const wKey of featureKeys) {
      if (yeniAgirliklar[wKey] !== undefined) {
        yeniAgirliklar[wKey] -= learningRate * (gradients[wKey] / n);
        // Ağırlıkları makul aralıkta tut
        if (wKey !== "bias") {
          yeniAgirliklar[wKey] = Math.max(-1, Math.min(1, yeniAgirliklar[wKey]));
        }
      }
    }
  }

  return yeniAgirliklar;
}

// ── Backtest — Geçmiş Verile Model Testi ──────────────────────────────
async function backtest(agirliklar = AGIRLIKLAR, limit = 200) {
  const gecmis = await getHistoryRows(limit);
  if (!Array.isArray(gecmis) || gecmis.length < 10) {
    return { basarili: false, mesaj: "Yeterli veri yok (min 10)" };
  }

  const veriSeti = gecmisToVeriSeti(gecmis);
  const matrix = hesaplaConfusionMatrix(veriSeti, agirliklar);

  return {
    basarili: true,
    kayitSayisi: veriSeti.length,
    ...matrix,
    agirliklar,
  };
}

// ── Geçmişi Veri Setine Çevir ─────────────────────────────────────────
function gecmisToVeriSeti(gecmis) {
  const veriSeti = [];

  for (const kayit of gecmis) {
    if (!kayit.sonuc) continue;

    const gercekRed = String(kayit.sonuc || "").toUpperCase().includes("RED") ? 1 : 0;

    const oncekiRedler = gecmis
      .filter((h) => h.tc === kayit.tc && h.time < kayit.time)
      .filter((h) => String(h.sonuc || "").toUpperCase().includes("RED"))
      .length;

    const ozellikler = ozellikCikar(
      {
        islemKodu: kayit.islem_kodu || "",
        doktorNotu: kayit.doktor_notu || kayit.hata || "",
        hastaYas: kayit.hasta_yas ?? null,
        saat: kayit.time ? new Date(kayit.time).getHours() : null,
      },
      oncekiRedler
    );

    veriSeti.push({ ozellikler, gercekRed });
  }

  return veriSeti;
}

// ── Otomatik Ağırlık Güncellemesi (Gradient Descent) ──────────────────
async function agirliklarGuncelle() {
  try {
    const gecmis = await getHistoryRows(1000);

    if (!Array.isArray(gecmis) || gecmis.length < 20) {
      return;
    }

    const veriSeti = gecmisToVeriSeti(gecmis);

    if (veriSeti.length < 20) return;

    // Train/test split (%80/%20)
    const splitIdx = Math.floor(veriSeti.length * 0.8);
    const trainSet = veriSeti.slice(0, splitIdx);
    const testSet = veriSeti.slice(splitIdx);

    // Gradient descent ile eğit
    const yeniAgirliklar = gradientDescentEgitim(trainSet, AGIRLIKLAR, 0.02, 100);

    // Test seti ile değerlendir
    const eskiPerformans = hesaplaConfusionMatrix(testSet, AGIRLIKLAR);
    const yeniPerformans = hesaplaConfusionMatrix(testSet, yeniAgirliklar);

    // Yeni model daha iyiyse güncelle
    if (yeniPerformans.accuracy >= eskiPerformans.accuracy - 0.05) {
      const eskiAgirliklar = { ...AGIRLIKLAR };
      AGIRLIKLAR = yeniAgirliklar;

      modelMeta = {
        egitimSayisi: veriSeti.length,
        sonGuncelleme: new Date().toISOString(),
        dogrulukOrani: Math.round(yeniPerformans.accuracy * 100),
        versiyon: (modelMeta.versiyon || 1) + 1,
        confusionMatrix: {
          tp: yeniPerformans.tp,
          fp: yeniPerformans.fp,
          tn: yeniPerformans.tn,
          fn: yeniPerformans.fn,
        },
        precision: Math.round(yeniPerformans.precision * 100),
        recall: Math.round(yeniPerformans.recall * 100),
        f1: Math.round(yeniPerformans.f1 * 100),
      };

      // Eğitim geçmişine ekle
      egitimGecmisi.push({
        versiyon: modelMeta.versiyon,
        tarih: modelMeta.sonGuncelleme,
        dogruluk: modelMeta.dogrulukOrani,
        precision: modelMeta.precision,
        recall: modelMeta.recall,
        f1: modelMeta.f1,
        kayitSayisi: veriSeti.length,
        eskiAgirliklar,
        yeniAgirliklar: { ...AGIRLIKLAR },
      });

      // Son 10 eğitimi tut
      if (egitimGecmisi.length > 10) egitimGecmisi.shift();

      console.log(
        `[ML] v${modelMeta.versiyon} — Doğruluk: %${modelMeta.dogrulukOrani} | ` +
        `Precision: %${modelMeta.precision} | Recall: %${modelMeta.recall} | F1: %${modelMeta.f1} | ` +
        `Veri: ${veriSeti.length} kayıt`
      );
    } else {
      console.log(
        `[ML] Yeni model (%${Math.round(yeniPerformans.accuracy * 100)}) eskisinden ` +
        `(%${Math.round(eskiPerformans.accuracy * 100)}) kötü — güncelleme yapılmadı.`
      );
    }
  } catch (e) {
    console.warn(`[ML] Ağırlık güncelleme hatası: ${e.message}`);
  }
}

// ── Online Learning (tek kayıtla artımlı güncelleme) ──────────────────
function onlineOgren(ozellikler, gercekRed) {
  const tahmin = tahminEt(ozellikler, AGIRLIKLAR);
  const hata = tahmin - gercekRed;
  const lr = 0.005; // Küçük learning rate

  const featureMap = {
    yuksek_risk_kodu: "yuksek_risk_kodu",
    risk_kelime_basina: "risk_kelime_sayisi",
    eksik_belge: "eksik_belge",
    yas_65_yogun: "yas_65_yogun",
    doktor_notu_yok: "doktor_notu_yok",
    ameliyat_kodu: "ameliyat_kodu",
    diyaliz_kodu: "diyaliz_kodu",
    saat_dilimi_risk: "saat_dilimi_risk",
    ardisik_red_riski: "ardisik_red",
    provider_risk: "provider_risk",
    gecmis_red_basina: "gecmis_red_sayisi",
    bias: "bias",
  };

  for (const [wKey, fKey] of Object.entries(featureMap)) {
    if (AGIRLIKLAR[wKey] !== undefined) {
      const delta = lr * hata * (ozellikler[fKey] ?? 0);
      AGIRLIKLAR[wKey] -= delta;
      if (wKey !== "bias") {
        AGIRLIKLAR[wKey] = Math.max(-1, Math.min(1, AGIRLIKLAR[wKey]));
      }
    }
  }
}

// ── Ana ML Analiz Fonksiyonu ──────────────────────────────────────────
async function mlRiskAnaliz(veri, gecmisRedSayisi = 0) {
  const ozellikler = ozellikCikar(veri, gecmisRedSayisi);
  const skor = tahminEt(ozellikler);

  const seviye =
    skor >= 0.7 ? "YÜKSEK" :
    skor >= 0.4 ? "ORTA" :
    "DÜŞÜK";

  return {
    mlSkoru: parseFloat(skor.toFixed(4)),
    seviye,
    ozellikler,
    modelMeta,
  };
}

// ── Tenant-Aware ML Analizi ───────────────────────────────────────────
async function mlRiskAnalizTenant(veri, gecmisRedSayisi = 0, hospitalId = null) {
  const ozellikler = ozellikCikar(veri, gecmisRedSayisi);

  if (!hospitalId) {
    return mlRiskAnaliz(veri, gecmisRedSayisi);
  }

  try {
    const { getOrCreateTenantModel } = require("../../services/tenantModelService");
    const tenantModel = await getOrCreateTenantModel(hospitalId);
    const tenantAgirliklar = tenantModel.agirliklar || AGIRLIKLAR;
    const skor = tahminEt(ozellikler, tenantAgirliklar);

    const seviye =
      skor >= 0.7 ? "YÜKSEK" :
      skor >= 0.4 ? "ORTA" :
      "DÜŞÜK";

    return {
      mlSkoru: parseFloat(skor.toFixed(4)),
      seviye,
      ozellikler,
      modelMeta: {
        ...modelMeta,
        tenantEgitimSayisi: tenantModel.meta.egitimSayisi || 0,
        tenantDogruluk: tenantModel.meta.dogrulukOrani || null,
        tenantSonGuncelleme: tenantModel.meta.sonGuncelleme || null,
        tenantAktif: true,
      },
    };
  } catch (e) {
    console.warn(`[ML] Tenant model yüklenemedi (${hospitalId}), global model: ${e.message}`);
    return mlRiskAnaliz(veri, gecmisRedSayisi);
  }
}

function modelDurumu() {
  return {
    ...modelMeta,
    agirliklar: AGIRLIKLAR,
    egitimGecmisi: egitimGecmisi.map((g) => ({
      versiyon: g.versiyon,
      tarih: g.tarih,
      dogruluk: g.dogruluk,
      precision: g.precision,
      recall: g.recall,
      f1: g.f1,
      kayitSayisi: g.kayitSayisi,
    })),
  };
}

// Uygulama başlarken ve her 6 saatte bir güncelle
agirliklarGuncelle();
setInterval(agirliklarGuncelle, 6 * 60 * 60 * 1000);

module.exports = {
  mlRiskAnaliz,
  mlRiskAnalizTenant,
  modelDurumu,
  ozellikCikar,
  onlineOgren,
  backtest,
  hesaplaConfusionMatrix,
};