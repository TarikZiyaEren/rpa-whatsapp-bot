const { Worker } = require("bullmq");
const connection = require("../lib/redis");

const { integrationProvizyonAl } = require("../integration");
const { addHistory } = require("../db");
const { redRiskiAnaliz } = require("../bots/red_onleme");
const { klinikVeriTopla } = require("../bots/klinik_veri");
const { gerekceyazAt } = require("../bots/gerekce_uretici");
const { redCozumOner } = require("../bots/red_cozum");
const { tumSutKodlari } = require("../bots/icd_sut/mapper");
const { recordLearningEvent } = require("../ai_learning/learningService");
const {
  provizyonBelgesiImzala,
  gerekceBelgesiImzala,
} = require("../bots/e_imza");

const env = require("../config/env");
const queueState = require("../jobs/queue");
const {
  pushLog,
  finishJob,
  failJob,
  startJob,
} = require("../jobs/jobStore");

let workerInstance = null;

function getHospitalId(payload) {
  const value = payload?.hospitalId ?? payload?.hospital_id ?? null;
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim();
  return normalized || null;
}

function parseDogumTarihi(dogum) {
  const value = String(dogum || "").trim();
  if (!value) return null;

  let d = null;

  if (value.includes(".")) {
    const [dd, mm, yyyy] = value.split(".");
    if (dd && mm && yyyy) {
      d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    }
  } else if (value.includes("-")) {
    const [yyyy, mm, dd] = value.split("-");
    if (yyyy && mm && dd) {
      d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    }
  } else {
    const fallback = new Date(value);
    if (!Number.isNaN(fallback.getTime())) {
      d = fallback;
    }
  }

  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
}

function yasHesapla(dogum) {
  try {
    const d = parseDogumTarihi(dogum);
    if (!d) return null;

    const now = new Date();
    if (d > now) return null;

    let yas = now.getFullYear() - d.getFullYear();
    const ayFarki = now.getMonth() - d.getMonth();
    const gunFarki = now.getDate() - d.getDate();

    if (ayFarki < 0 || (ayFarki === 0 && gunFarki < 0)) {
      yas -= 1;
    }

    if (!Number.isFinite(yas) || yas < 0 || yas > 130) return null;
    return yas;
  } catch {
    return null;
  }
}

function safeNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getAiBlockThreshold() {
  const raw = safeNumber(env.AI_BLOCK_THRESHOLD, 0.85);
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}

function retryAdayiBul(redCozum, mevcutIslem) {
  if (redCozum?.alternatifSutlar?.length) {
    return redCozum.alternatifSutlar[0];
  }

  const tum = tumSutKodlari();
  const mevcutKod = String(mevcutIslem?.kodu || "");
  const prefix = mevcutKod.split(".")[0];

  const aday = tum.find(
    (x) =>
      x?.sutKodu &&
      x.sutKodu !== mevcutKod &&
      String(x.sutKodu).split(".")[0] === prefix
  );

  if (aday) {
    return {
      kod: aday.sutKodu,
      ad: aday.ad,
    };
  }

  return null;
}

function normalizeEksikBelgeler(rapor, redCozum) {
  const belgeler = [];

  if (Array.isArray(rapor?.eksikBelgeler)) {
    belgeler.push(...rapor.eksikBelgeler);
  }

  if (Array.isArray(redCozum?.eksikBelgeler)) {
    belgeler.push(...redCozum.eksikBelgeler);
  }

  if (Array.isArray(redCozum?.onerilenBelgeler)) {
    belgeler.push(...redCozum.onerilenBelgeler);
  }

  return [...new Set(belgeler.filter(Boolean).map((x) => String(x).trim()))];
}

function deriveRedNedeni({ blockedByAI, rapor, redCozum, retryBilgi, hata }) {
  if (blockedByAI) {
    return (
      rapor?.anaSebep ||
      rapor?.gerekceOzet ||
      "AI risk nedeniyle bloke edildi"
    );
  }

  if (redCozum?.hataMesaji) return redCozum.hataMesaji;
  if (retryBilgi?.retryHataMesaji) return retryBilgi.retryHataMesaji;
  if (hata) return hata;

  return null;
}

function buildAiContext(payload) {
  const ctx = payload?.aiContext || {};

  return {
    icdKodu: ctx.icdKodu || null,
    icdAd: ctx.icdAd || null,
    confidence:
      ctx.confidence != null && ctx.confidence !== ""
        ? safeNumber(ctx.confidence, null)
        : null,
    onerilenSutlar: Array.isArray(ctx.onerilenSutlar)
      ? ctx.onerilenSutlar
      : [],
    seciliOneriKodu: ctx.seciliOneriKodu || null,
    seciliOneriAd: ctx.seciliOneriAd || null,
  };
}

function normalizeGerekceResult(gerekce) {
  if (!gerekce) {
    return {
      gerekceMetni: null,
      belgeNo: null,
      filePath: null,
      raw: null,
    };
  }

  if (typeof gerekce === "string") {
    return {
      gerekceMetni: gerekce,
      belgeNo: null,
      filePath: null,
      raw: gerekce,
    };
  }

  return {
    gerekceMetni:
      gerekce.gerekceMetni ||
      gerekce.gerekce ||
      gerekce.metin ||
      null,
    belgeNo: gerekce.belgeNo || null,
    filePath: gerekce.filePath || null,
    raw: gerekce,
  };
}

async function processProvizyonJob(jobId, payload) {
  const start = Date.now();
  const hospitalId = getHospitalId(payload);

  let sonuc = null;
  let hata = null;
  let needsHuman = false;
  let rapor = null;
  let blockedByAI = false;
  let imzaKaydi = null;
  let redCozum = null;
  let retryBilgi = null;
  let finalIslem = payload.islem;
  let klinikVeri = null;
  let doktorNotu = "";
  let finalTakipNo = null;
  let finalHataKodu = null;
  let finalHataMesaji = null;
  let gerekcePdf = null;

  const aiContext = buildAiContext(payload);

  try {
    startJob(jobId);
    pushLog(jobId, "🧠 AI Ön Analiz (Red Önleme) başlıyor...");

    if (!hospitalId) {
      pushLog(jobId, "⚠️ hospitalId bulunamadı. Öğrenme ve history kayıtları sınırlı çalışabilir.");
    }

    if (aiContext.icdKodu) {
      pushLog(
        jobId,
        `🧬 AI ICD bağlamı alındı: ${aiContext.icdKodu}${
          aiContext.icdAd ? ` - ${aiContext.icdAd}` : ""
        }`
      );
    }

    if (aiContext.seciliOneriKodu) {
      pushLog(
        jobId,
        `📌 Formda AI önerisi seçilmiş: ${aiContext.seciliOneriKodu}${
          aiContext.seciliOneriAd ? ` - ${aiContext.seciliOneriAd}` : ""
        }`
      );
    }

    try {
      pushLog(jobId, "FHIR'dan klinik veri çekiliyor...");
      klinikVeri = await klinikVeriTopla(payload.hasta.tc, (m) => pushLog(jobId, m));
    } catch (fhirErr) {
      pushLog(
        jobId,
        `⚠️ FHIR verisi alınamadı — manuel not kullanılacak. (${fhirErr.message})`
      );
    }

    doktorNotu = (klinikVeri?.birleskNotlar || payload.doktorNotu || "").trim();

    if (!doktorNotu) {
      pushLog(jobId, "ℹ️ Doktor notu boş — analiz sınırlı olabilir.");
    }

    const yas = yasHesapla(payload.hasta.dogum);

    rapor = await redRiskiAnaliz(
      {
        hasta: { ...payload.hasta, yas: yas ?? undefined },
        islem: payload.islem,
        provider: payload.provider || null,
        doktorNotu,
        aiContext,
        hospitalId,
      },
      (m) => pushLog(jobId, m)
    );

    if (aiContext.icdKodu && !rapor?.icdKodu && !rapor?.icd) {
      rapor = {
        ...(rapor || {}),
        icdKodu: aiContext.icdKodu,
        icdAd: aiContext.icdAd || null,
      };
    }

    if (
      Array.isArray(aiContext.onerilenSutlar) &&
      aiContext.onerilenSutlar.length &&
      (!rapor?.onerilenSutlar || !rapor.onerilenSutlar.length)
    ) {
      rapor = {
        ...(rapor || {}),
        onerilenSutlar: aiContext.onerilenSutlar,
      };
    }

    const thr = getAiBlockThreshold();

    if (rapor?.finalRisk != null && rapor.finalRisk >= thr) {
      blockedByAI = true;

      pushLog(
        jobId,
        `⛔ AI kararı: RPA çalıştırılmadı (Risk: ${rapor.seviye} / ${(
          rapor.finalRisk * 100
        ).toFixed(0)}%)`
      );

      if (rapor.incelemeGerekli) {
        pushLog(jobId, "📝 Gerekçe metni üretiliyor...");

        const gerekce = await gerekceyazAt(
          {
            hasta: { ad: payload.hasta.ad, dogum: payload.hasta.dogum },
            islem: payload.islem,
            doktorNotu,
            teshisler: klinikVeri?.teshisler || [],
          },
          (m) => pushLog(jobId, m)
        );

        const normalizedGerekce = normalizeGerekceResult(gerekce);
        gerekcePdf = normalizedGerekce.filePath
          ? {
              belgeNo: normalizedGerekce.belgeNo,
              filePath: normalizedGerekce.filePath,
            }
          : null;

        rapor.gerekce = normalizedGerekce.raw;
        rapor.gerekcePdf = gerekcePdf;

        try {
          imzaKaydi = await gerekceBelgesiImzala({
            gerekceMetni:
              normalizedGerekce.gerekceMetni || JSON.stringify(normalizedGerekce.raw),
            hasta: payload.hasta,
            imzalayanTc: null,
            imzalayanAd: payload.credentials?.username || "sistem",
          });

          pushLog(jobId, `🔏 Gerekçe belgesi imzalandı: ${imzaKaydi.sertifikaNo}`);
        } catch (ie) {
          pushLog(jobId, `⚠️ İmza başarısız (kritik değil): ${ie.message}`);
        }
      }

      sonuc = `AI BLOKE | Risk: ${rapor.seviye} (%${Math.round(
        rapor.finalRisk * 100
      )})`;

      return {
        sonuc,
        hata,
        rapor,
        blockedByAI,
        imzaKaydi,
        redCozum,
        retryBilgi,
        needsHuman,
        finalIslem,
        aiContext,
        gerekcePdf,
      };
    }

    pushLog(jobId, "✅ AI onayı: Risk kabul edilebilir — RPA başlatılıyor...");

    const medulaSonuc = await integrationProvizyonAl(
      {
        hasta: payload.hasta,
        islem: payload.islem,
        doktorNotu,
        hospitalId,
        provider: payload.provider || "sgk",
        credentials: payload.credentials || null,
      },
      (m) => pushLog(jobId, m)
    );

    finalTakipNo = medulaSonuc?.takipNo || null;
    finalHataKodu = medulaSonuc?.hataKodu || null;
    finalHataMesaji = medulaSonuc?.hataMesaji || null;

    sonuc = `${medulaSonuc.durum} | TakipNo: ${medulaSonuc.takipNo}`;
    if (medulaSonuc.hataKodu) {
      sonuc += ` | ${medulaSonuc.hataKodu}: ${medulaSonuc.hataMesaji}`;
    }

    if (typeof sonuc === "string" && sonuc.toUpperCase().includes("RED")) {
      pushLog(jobId, "❌ Portal RED döndü — Gerekçe önerisi hazırlanıyor...");

      if (!rapor?.gerekce) {
        const gerekce = await gerekceyazAt(
          {
            hasta: { ad: payload.hasta.ad, dogum: payload.hasta.dogum },
            islem: payload.islem,
            doktorNotu,
            teshisler: klinikVeri?.teshisler || [],
          },
          (m) => pushLog(jobId, m)
        );

        const normalizedGerekce = normalizeGerekceResult(gerekce);
        gerekcePdf = normalizedGerekce.filePath
          ? {
              belgeNo: normalizedGerekce.belgeNo,
              filePath: normalizedGerekce.filePath,
            }
          : null;

        rapor.gerekce = normalizedGerekce.raw;
        rapor.gerekcePdf = gerekcePdf;

        try {
          imzaKaydi = await gerekceBelgesiImzala({
            gerekceMetni:
              normalizedGerekce.gerekceMetni || JSON.stringify(normalizedGerekce.raw),
            hasta: payload.hasta,
            imzalayanTc: null,
            imzalayanAd: payload.credentials?.username || "sistem",
          });

          pushLog(jobId, `🔏 Gerekçe belgesi imzalandı: ${imzaKaydi.sertifikaNo}`);
        } catch (ie) {
          pushLog(jobId, `⚠️ İmza başarısız (kritik değil): ${ie.message}`);
        }
      }

      redCozum = await redCozumOner({
        hataKodu: medulaSonuc.hataKodu,
        hataMesaji: medulaSonuc.hataMesaji,
        hasta: payload.hasta,
        islem: payload.islem,
        doktorNotu,
        rapor,
        aiContext,
        hospitalId,
      });

      pushLog(jobId, "🧠 RED çözüm önerileri hazırlandı.");

      const autoRetryEnabled =
        String(env.AUTO_RETRY_ENABLED || "true").toLowerCase() === "true";

      const retryAdayi = retryAdayiBul(redCozum, payload.islem);

      if (!retryAdayi) {
        pushLog(jobId, "ℹ️ Retry için uygun alternatif SUT bulunamadı.");
      }

      if (autoRetryEnabled && retryAdayi) {
        pushLog(jobId, "🔁 Otomatik yeniden deneme başlatılıyor...");
        pushLog(
          jobId,
          `🧠 AI alternatif SUT seçti: ${retryAdayi.kod} - ${retryAdayi.ad}`
        );

        try {
          const retryPayload = {
            hasta: payload.hasta,
            islem: {
              kodu: retryAdayi.kod,
              adi: retryAdayi.ad,
            },
            doktorNotu,
            hospitalId,
            provider: payload.provider || "sgk",
            credentials: payload.credentials || null,
          };

          const retrySonuc = await integrationProvizyonAl(
            retryPayload,
            (m) => pushLog(jobId, `[RETRY] ${m}`)
          );

          retryBilgi = {
            denendi: true,
            ilkSonuc: sonuc,
            yeniIslem: retryPayload.islem,
            retryDurum: retrySonuc.durum,
            retryTakipNo: retrySonuc.takipNo,
            retryHataKodu: retrySonuc.hataKodu || null,
            retryHataMesaji: retrySonuc.hataMesaji || null,
          };

          if (String(retrySonuc.durum || "").toUpperCase().includes("ONAY")) {
            finalIslem = retryPayload.islem;
            finalTakipNo = retrySonuc.takipNo || finalTakipNo;
            finalHataKodu = retrySonuc.hataKodu || null;
            finalHataMesaji = retrySonuc.hataMesaji || null;

            sonuc = `ONAY (AUTO-RETRY) | TakipNo: ${retrySonuc.takipNo} | Yeni SUT: ${retryAdayi.kod} - ${retryAdayi.ad}`;

            pushLog(jobId, "✅ Otomatik yeniden deneme başarılı oldu.");

            try {
              imzaKaydi = await provizyonBelgesiImzala({
                hasta: payload.hasta,
                islem: finalIslem,
                sonuc,
                imzalayanTc: null,
                imzalayanAd: payload.credentials?.username || "sistem",
              });

              pushLog(
                jobId,
                `🔏 Retry provizyon belgesi imzalandı: ${imzaKaydi.sertifikaNo}`
              );
            } catch (ie) {
              pushLog(jobId, `⚠️ Retry imzası başarısız (kritik değil): ${ie.message}`);
            }
          } else {
            finalTakipNo = retrySonuc?.takipNo || finalTakipNo;
            finalHataKodu = retrySonuc?.hataKodu || finalHataKodu;
            finalHataMesaji = retrySonuc?.hataMesaji || finalHataMesaji;

            pushLog(jobId, "❌ Otomatik yeniden deneme de RED döndü.");
          }
        } catch (retryErr) {
          pushLog(jobId, `⚠️ Otomatik yeniden deneme başarısız: ${retryErr.message}`);

          retryBilgi = {
            denendi: true,
            ilkSonuc: sonuc,
            yeniIslem: retryAdayi,
            retryDurum: "HATA",
            retryTakipNo: null,
            retryHataKodu: null,
            retryHataMesaji: retryErr.message,
          };
        }
      }
    }

    if (
      typeof sonuc === "string" &&
      sonuc.toUpperCase().includes("ONAY") &&
      !String(sonuc).includes("AUTO-RETRY")
    ) {
      try {
        imzaKaydi = await provizyonBelgesiImzala({
          hasta: payload.hasta,
          islem: finalIslem,
          sonuc,
          imzalayanTc: null,
          imzalayanAd: payload.credentials?.username || "sistem",
        });

        pushLog(jobId, `🔏 Provizyon belgesi imzalandı: ${imzaKaydi.sertifikaNo}`);
      } catch (ie) {
        pushLog(jobId, `⚠️ İmza başarısız (kritik değil): ${ie.message}`);
      }
    }

    return {
      sonuc,
      hata,
      rapor,
      blockedByAI,
      imzaKaydi,
      redCozum,
      retryBilgi,
      needsHuman,
      finalIslem,
      aiContext,
      gerekcePdf,
    };
  } catch (e) {
    hata = e?.message || String(e);
    needsHuman = !!e?.needsHuman;

    pushLog(jobId, needsHuman ? "⚠️ İnsan müdahalesi gerekiyor!" : `HATA: ${hata}`);
    throw e;
  } finally {
    const elapsedMs = Date.now() - start;
    const hastaYas = yasHesapla(payload.hasta.dogum);
    const eksikBelgeler = normalizeEksikBelgeler(rapor, redCozum);
    const redNedeni = deriveRedNedeni({
      blockedByAI,
      rapor,
      redCozum,
      retryBilgi,
      hata,
    });

    const finalIcdKodu =
      rapor?.icdKodu || rapor?.icd || aiContext.icdKodu || null;

    const finalSutOnerileri =
      redCozum?.alternatifSutlar ||
      rapor?.onerilenSutlar ||
      aiContext.onerilenSutlar ||
      [];

    const finalResultPayload = {
      sonuc,
      hata,
      elapsedMs,
      needsHuman,
      rapor,
      blockedByAI,
      imzaKaydi,
      redCozum,
      retryBilgi,
      aiContext,
      gerekcePdf,
      klinikVeri: klinikVeri
        ? {
            kaynak: klinikVeri.kaynak || null,
            klinikOzet: klinikVeri.klinikOzet || null,
            riskIsaretleri: klinikVeri.riskIsaretleri || [],
          }
        : null,
      finalIslem,
    };

    try {
      if (hospitalId) {
        await addHistory(
          {
            hastaAdi: payload.hasta.ad,
            tcKimlikNo: payload.hasta.tc,
            provider: payload.provider,
            kaynak: payload.provider,
            sonuc,
            mesaj: hata,
            hata,
            elapsedMs,
            needsHuman,
            islem_kodu:
              finalIslem?.kodu ||
              payload.islem?.kodu ||
              aiContext.seciliOneriKodu ||
              null,
            islem_adi:
              finalIslem?.adi ||
              payload.islem?.adi ||
              aiContext.seciliOneriAd ||
              null,
            hasta_yas: hastaYas,
            ai_risk: rapor?.finalRisk ?? aiContext.confidence ?? null,
            ai_seviye: rapor?.seviye ?? null,
            red_nedeni: redNedeni,
            eksik_belgeler_json: JSON.stringify(eksikBelgeler || []),
            retry_kullanildi: !!retryBilgi?.denendi,
            retry_basarili:
              !!retryBilgi?.denendi &&
              String(retryBilgi?.retryDurum || "").toUpperCase().includes("ONAY"),
            retry_yeni_kod: retryBilgi?.yeniIslem?.kodu || null,
            takip_no: finalTakipNo,
            provider_response_code:
              retryBilgi?.retryHataKodu || finalHataKodu || null,
            provider_response_message:
              retryBilgi?.retryHataMesaji || finalHataMesaji || hata || null,
            doktor_notu: doktorNotu || null,
            icd_kodu: finalIcdKodu,
            sut_oneri_json: JSON.stringify(finalSutOnerileri || []),
            metadata: {
              dogum: payload.hasta.dogum || null,
              blockedByAI,
              gerekcePdf,
            },
          },
          hospitalId
        );
      } else {
        pushLog(jobId, "⚠️ History kaydı atlandı: hospitalId yok.");
      }
    } catch (historyErr) {
      pushLog(jobId, `⚠️ History kaydi yazilamadi: ${historyErr.message}`);
    }

    try {
      await recordLearningEvent({
        hospital_id: hospitalId,
        tc: payload.hasta.tc,
        hasta_ad: payload.hasta.ad,
        hasta_yas: hastaYas,
        islem_kodu:
          finalIslem?.kodu ||
          payload.islem?.kodu ||
          aiContext.seciliOneriKodu ||
          null,
        islem_adi:
          finalIslem?.adi ||
          payload.islem?.adi ||
          aiContext.seciliOneriAd ||
          null,
        doktor_notu: doktorNotu || null,
        ai_risk: rapor?.finalRisk ?? aiContext.confidence ?? null,
        ai_seviye: rapor?.seviye ?? null,
        ai_oneri:
          rapor?.oneri ||
          (Array.isArray(finalSutOnerileri) && finalSutOnerileri.length
            ? `AI önerilen SUT sayısı: ${finalSutOnerileri.length}`
            : null),
        sonuc,
        hata_kodu:
          redCozum?.hataKodu || retryBilgi?.retryHataKodu || finalHataKodu || null,
        hata_mesaji:
          redCozum?.hataMesaji ||
          retryBilgi?.retryHataMesaji ||
          finalHataMesaji ||
          hata ||
          null,
        red_nedeni: redNedeni,
        eksik_belgeler_json: JSON.stringify(eksikBelgeler || []),
        retry_kullanildi: !!retryBilgi?.denendi,
        retry_yeni_kod: retryBilgi?.yeniIslem?.kodu || null,
        retry_basarili:
          !!retryBilgi?.denendi &&
          String(retryBilgi?.retryDurum || "").toUpperCase().includes("ONAY"),
        provider: payload.provider,
      });
    } catch (learningErr) {
      pushLog(jobId, `⚠️ Learning kaydi yazilamadi: ${learningErr.message}`);
    }

    if (hata) {
      failJob(jobId, hata);
    } else {
      finishJob(jobId, finalResultPayload);
    }
  }
}

async function enqueueJob(jobId, payload) {
  const hospitalId = getHospitalId(payload);

  await queueState.enqueue({
    id: String(jobId),
    jobId: String(jobId),
    type: "provizyon",
    hospitalId: hospitalId || "",
    payload: {
      ...payload,
      hospitalId: hospitalId || payload?.hospitalId || payload?.hospital_id || null,
    },
    priority: 0,
    maxAttempts: 3,
  });

  pushLog(jobId, "Kuyruğa alındı.");
  queueState.refreshCounts?.().catch(() => {});
}

function startWorkers() {
  if (workerInstance) return workerInstance;

  const concurrency = Math.max(1, Number(env.MAX_WORKERS) || 1);

  workerInstance = new Worker(
    "provizyon",
    async (job) => {
      const data = job.data || {};
      const effectiveJobId = data.jobId || data.id;
      const payload = data.payload || null;

      if (!effectiveJobId || !payload) {
        throw new Error("Worker job data eksik.");
      }

      queueState.workerStarted();

      try {
        return await processProvizyonJob(effectiveJobId, payload);
      } finally {
        queueState.workerFinished();
        queueState.refreshCounts?.().catch(() => {});
      }
    },
    {
      connection,
      concurrency,
    }
  );

  workerInstance.on("completed", (job) => {
    const effectiveJobId = job?.data?.jobId || job?.data?.id || job?.id;
    console.log(`✅ Worker tamamladı: ${effectiveJobId}`);
    queueState.refreshCounts?.().catch(() => {});
  });

  workerInstance.on("failed", (job, err) => {
    const effectiveJobId = job?.data?.jobId || job?.data?.id || job?.id || "unknown";
    console.error(`❌ Worker hata: ${effectiveJobId} - ${err.message}`);
    queueState.refreshCounts?.().catch(() => {});
  });

  workerInstance.on("error", (err) => {
    console.error("❌ Worker genel hata:", err.message);
  });

  console.log("🚀 Provizyon worker başlatıldı");
  return workerInstance;
}

module.exports = {
  yasHesapla,
  enqueueJob,
  processProvizyonJob,
  startWorkers,
};