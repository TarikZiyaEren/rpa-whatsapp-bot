const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { listProviders } = require("../providers");
const { getCredential, listCredentials, isHospitalActive } = require("../db");
const { tumSutKodlari, sutKodunuCoz } = require("../bots/icd_sut/mapper");
const { audit } = require("../services/auditService");
const { createJob } = require("../jobs/jobStore");
const { enqueueJob } = require("../services/jobRunner");

const router = express.Router();

function isAdmin(user) {
  return !!user && (
    user.role === "admin" ||
    String(user.username || "").toLowerCase() === "admin"
  );
}

function getEffectiveHospitalId(req) {
  return (
    req.hospital?.id ||
    req.session?.user?.hospitalId ||
    req.session?.user?.hospital_id ||
    null
  );
}

function buildSutTablosu() {
  const tumKodlar = tumSutKodlari();

  return tumKodlar.reduce((acc, s) => {
    const coz = sutKodunuCoz(s.sutKodu);

    acc[s.sutKodu] = {
      ad: coz?.ad || s?.ad || "",
      icd10Kodlar: coz?.icd10Kodlar || [],
      icd10Aciklamalar: coz?.icd10Aciklamalar || [],
      aciklama: coz?.aciklama || "",
      belgeler: coz?.belgeler || [],
    };

    return acc;
  }, {});
}

async function getSafeProvidersForUser(req) {
  const user = req.session?.user;
  const hospitalId = getEffectiveHospitalId(req);

  if (!user) return [];

  if (isAdmin(user) && !hospitalId) {
    return [];
  }

  if (!hospitalId) {
    return [];
  }

  try {
    return await listCredentials(hospitalId, user.id);
  } catch (err) {
    console.error("CREDENTIAL LIST HATA:", err.message);
    return [];
  }
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const providers = listProviders();
    const myProviders = await getSafeProvidersForUser(req);
    const sutTablosu = buildSutTablosu();

    return res.render("index", {
      sonuc: null,
      hata: null,
      jobId: null,
      providers,
      myProviders,
      sutTablosu,
    });
  } catch (err) {
    console.error("ANA SAYFA HATA:", err);
    return res.status(500).send(`Ana sayfa hatasi: ${err.message}`);
  }
});

router.post("/provizyon", requireAuth, requireRole("provizyon"), async (req, res) => {
  try {
    const {
      tc,
      ad,
      dogum,
      provider,
      islem_kodu,
      islem_adi,
      doktor_notu,

      ai_icd_kodu,
      ai_icd_ad,
      ai_confidence,
      ai_onerilen_sutlar,
      ai_secili_oneri_kodu,
      ai_secili_oneri_ad,
    } = req.body;

    const user = req.session?.user;
    const hospitalId = getEffectiveHospitalId(req);

    const providers = listProviders();
    const myProviders = await getSafeProvidersForUser(req);
    const sutTablosu = buildSutTablosu();

    if (!user) {
      return res.redirect("/login");
    }

    if (isAdmin(user) && !hospitalId) {
      return res.render("index", {
        sonuc: null,
        hata: "Admin kullanıcı için aktif hastane bağlamı gerekli.",
        jobId: null,
        providers,
        myProviders,
        sutTablosu,
      });
    }

    if (!isAdmin(user) && !hospitalId) {
      return res.render("index", {
        sonuc: null,
        hata: "Aktif hastane bağlamı bulunamadı.",
        jobId: null,
        providers,
        myProviders,
        sutTablosu,
      });
    }

    if (!isAdmin(user) && hospitalId) {
      const hospitalAktif = await isHospitalActive(hospitalId);

      if (!hospitalAktif) {
        return res.render("index", {
          sonuc: null,
          hata: "Bağlı olduğunuz hastane pasif olduğu için yeni provizyon başlatamazsınız.",
          jobId: null,
          providers,
          myProviders,
          sutTablosu,
        });
      }
    }

    if (!tc || !ad || !dogum || !provider) {
      return res.render("index", {
        sonuc: null,
        hata: "Tüm alanları doldur.",
        jobId: null,
        providers,
        myProviders,
        sutTablosu,
      });
    }

    if (String(tc).length !== 11) {
      return res.render("index", {
        sonuc: null,
        hata: "TC 11 haneli olmalı.",
        jobId: null,
        providers,
        myProviders,
        sutTablosu,
      });
    }

    let credentials;

    try {
      credentials = await getCredential(
        hospitalId,
        user.id,
        provider
      );
    } catch (_e) {
      return res.render("index", {
        sonuc: null,
        hata: "Kayıtlı credential çözülemedi. Credential'ı yeniden kaydet.",
        jobId: null,
        providers,
        myProviders,
        sutTablosu,
      });
    }

    if (!credentials) {
      return res.render("index", {
        sonuc: null,
        hata: `${provider} için kayıtlı credential bulunamadı.`,
        jobId: null,
        providers,
        myProviders,
        sutTablosu,
      });
    }

    let parsedAiOnerilenSutlar = [];
    try {
      parsedAiOnerilenSutlar = ai_onerilen_sutlar
        ? JSON.parse(ai_onerilen_sutlar)
        : [];
    } catch {
      parsedAiOnerilenSutlar = [];
    }

    audit(
      req,
      "PROVIZYON_BASLAT",
      `TC: ${tc.slice(0, 3)}****${tc.slice(-3)} | Provider: ${provider} | İşlem: ${islem_adi}`
    );

    const jobId = createJob(user.id, hospitalId);

    res.render("index", {
      sonuc: null,
      hata: null,
      jobId,
      providers,
      myProviders,
      sutTablosu,
    });

    enqueueJob(jobId, {
      hospitalId,
      hospital_id: hospitalId,
      provider,
      credentials,
      hasta: { tc, ad, dogum },
      islem: { kodu: islem_kodu, adi: islem_adi },
      doktorNotu: doktor_notu || "",

      aiContext: {
        icdKodu: ai_icd_kodu || null,
        icdAd: ai_icd_ad || null,
        confidence:
          ai_confidence != null && ai_confidence !== ""
            ? Number(ai_confidence)
            : null,
        onerilenSutlar: Array.isArray(parsedAiOnerilenSutlar)
          ? parsedAiOnerilenSutlar
          : [],
        seciliOneriKodu: ai_secili_oneri_kodu || null,
        seciliOneriAd: ai_secili_oneri_ad || null,
      },
    }).catch((queueErr) => {
      console.error("QUEUE HATA:", queueErr);
    });
  } catch (err) {
    console.error("PROVIZYON ROUTE HATA:", err);
    return res.status(500).send(`Provizyon route hatasi: ${err.message}`);
  }
});

module.exports = router;