const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { audit } = require("../services/auditService");
const { createJob, pushLog, finishJob } = require("../jobs/jobStore");
const { klinikVeriTopla } = require("../bots/klinik_veri");
const { redRiskiAnaliz } = require("../bots/red_onleme");
const { gerekceyazAt } = require("../bots/gerekce_uretici");
const { gerekceBelgesiImzala } = require("../bots/e_imza");

const router = express.Router();

router.get("/", requireAuth, requireRole("red_onleme"), (req, res) => {
  res.render("red_onleme", { sonuc: null, hata: null, jobId: null });
});

router.post("/", requireAuth, requireRole("red_onleme"), async (req, res) => {
  const { tc, ad, dogum, islem_kodu, islem_adi, doktor_notu } = req.body;

  audit(req, "RED_ONLEME_ANALIZ", `TC: ${tc.slice(0, 3)}****${tc.slice(-3)} | İşlem: ${islem_adi}`);

  const jobId = createJob(req.session.user.id);
  res.render("red_onleme", { sonuc: null, hata: null, jobId });

  setImmediate(async () => {
    try {
      pushLog(jobId, "Red önleme analizi başlıyor...");

      let klinikVeri = null;
      try {
        pushLog(jobId, "FHIR'dan klinik veri çekiliyor...");
        klinikVeri = await klinikVeriTopla(tc, (m) => pushLog(jobId, m));
      } catch {
        pushLog(jobId, "⚠️ FHIR verisi alınamadı — manuel not kullanılıyor.");
      }

      const doktorNotu = klinikVeri?.birleskNotlar || doktor_notu || "";

      const rapor = await redRiskiAnaliz(
        {
          hasta: { tc, ad, dogum },
          islem: { kodu: islem_kodu, adi: islem_adi },
          doktorNotu,
        },
        (m) => pushLog(jobId, m)
      );

      if (rapor.incelemeGerekli) {
        pushLog(jobId, "📝 Gerekçe metni üretiliyor...");
        const gerekce = await gerekceyazAt(
          {
            hasta: { ad, dogum },
            islem: { kodu: islem_kodu, adi: islem_adi },
            doktorNotu,
            teshisler: klinikVeri?.teshisler || [],
          },
          (m) => pushLog(jobId, m)
        );

        rapor.gerekce = gerekce;

        try {
          const imza = await gerekceBelgesiImzala({
            gerekceMetni: gerekce?.gerekceMetni || JSON.stringify(gerekce),
            hasta: { tc, ad },
            imzalayanTc: null,
            imzalayanAd: "sistem",
          });
          rapor.imzaKaydi = imza;
          pushLog(jobId, `🔏 Gerekçe imzalandı: ${imza.sertifikaNo}`);
        } catch (ie) {
          pushLog(jobId, `⚠️ İmza başarısız (kritik değil): ${ie.message}`);
        }
      }

      finishJob(jobId, { rapor });
    } catch (e) {
      pushLog(jobId, `HATA: ${e.message}`);
      finishJob(jobId, { hata: e.message });
    }
  });
});

module.exports = router;