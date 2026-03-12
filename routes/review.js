const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { audit } = require("../services/auditService");
const {
  reviewOnayla,
  reviewReddet,
  reviewTekrarDene,
  listReviewItems,
  getReviewItem,
  getReviewStats,
} = require("../services/reviewService");

const router = express.Router();

function getHospitalId(req) {
  return (
    req.hospital?.id ||
    req.session?.user?.hospitalId ||
    req.session?.user?.hospital_id ||
    null
  );
}

/**
 * GET /review — Review desk ana sayfası
 */
router.get("/", requireAuth, requireRole("provizyon"), async (req, res) => {
  try {
    const hospitalId = getHospitalId(req);
    if (!hospitalId) {
      return res.status(400).send("Hastane bağlamı bulunamadı.");
    }

    const filtre = req.query.durum || null; // ?durum=beklemede
    const items = await listReviewItems(hospitalId, filtre, 200);
    const stats = await getReviewStats(hospitalId);

    // JSON alanlarını parse et
    const parsedItems = items.map((item) => ({
      ...item,
      eksikBelgeler: safeParse(item.eksik_belgeler_json, []),
      kuralAnalizi: safeParse(item.kural_analizi_json, null),
      aciklamaKartlar: safeParse(item.aciklama_kartlar, []),
      rapor: safeParse(item.rapor_json, null),
    }));

    res.render("review", {
      items: parsedItems,
      stats,
      filtre,
      currentUser: req.session?.user,
    });
  } catch (err) {
    console.error("REVIEW SAYFA HATA:", err);
    res.status(500).send(`Review desk hatası: ${err.message}`);
  }
});

/**
 * GET /review/:id — Tek review detay (JSON)
 */
router.get("/:id/detay", requireAuth, requireRole("provizyon"), async (req, res) => {
  try {
    const item = await getReviewItem(req.params.id);
    if (!item) return res.status(404).json({ ok: false, hata: "Kayıt bulunamadı." });

    res.json({
      ok: true,
      item: {
        ...item,
        eksikBelgeler: safeParse(item.eksik_belgeler_json, []),
        kuralAnalizi: safeParse(item.kural_analizi_json, null),
        aciklamaKartlar: safeParse(item.aciklama_kartlar, []),
        rapor: safeParse(item.rapor_json, null),
        redCozum: safeParse(item.red_cozum_json, null),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, hata: err.message });
  }
});

/**
 * POST /review/:id/onayla — Operatör onayı
 */
router.post("/:id/onayla", requireAuth, requireRole("provizyon"), async (req, res) => {
  try {
    const kullanici = req.session?.user?.username || "anonim";
    const not = req.body.not || "";

    const sonuc = await reviewOnayla(req.params.id, kullanici, not, req);

    audit(req, "REVIEW_ONAYLA", `ID: ${req.params.id}`);

    res.json({ ok: true, ...sonuc });
  } catch (err) {
    console.error("REVIEW ONAY HATA:", err);
    res.status(400).json({ ok: false, hata: err.message });
  }
});

/**
 * POST /review/:id/reddet — Operatör reddi
 */
router.post("/:id/reddet", requireAuth, requireRole("provizyon"), async (req, res) => {
  try {
    const kullanici = req.session?.user?.username || "anonim";
    const not = req.body.not || "";

    const sonuc = await reviewReddet(req.params.id, kullanici, not, req);

    audit(req, "REVIEW_REDDET", `ID: ${req.params.id}`);

    res.json({ ok: true, ...sonuc });
  } catch (err) {
    console.error("REVIEW RED HATA:", err);
    res.status(400).json({ ok: false, hata: err.message });
  }
});

/**
 * POST /review/:id/tekrar-dene — Düzeltme ile tekrar deneme
 */
router.post("/:id/tekrar-dene", requireAuth, requireRole("provizyon"), async (req, res) => {
  try {
    const kullanici = req.session?.user?.username || "anonim";
    const { not, doktor_notu, islem_kodu, islem_adi } = req.body;

    const duzeltmeler = {};
    if (doktor_notu) duzeltmeler.doktorNotu = doktor_notu;
    if (islem_kodu) {
      duzeltmeler.islemKodu = islem_kodu;
      duzeltmeler.islemAdi = islem_adi || "";
    }

    const sonuc = await reviewTekrarDene(req.params.id, kullanici, duzeltmeler, not, req);

    audit(req, "REVIEW_TEKRAR_DENE", `ID: ${req.params.id}`);

    res.json({ ok: true, ...sonuc });
  } catch (err) {
    console.error("REVIEW TEKRAR DENE HATA:", err);
    res.status(400).json({ ok: false, hata: err.message });
  }
});

/**
 * GET /review/api/stats — İstatistik endpoint
 */
router.get("/api/stats", requireAuth, async (req, res) => {
  try {
    const hospitalId = getHospitalId(req);
    if (!hospitalId) return res.json({ ok: false });

    const stats = await getReviewStats(hospitalId);
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ ok: false, hata: err.message });
  }
});

function safeParse(json, fallback) {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

module.exports = router;
