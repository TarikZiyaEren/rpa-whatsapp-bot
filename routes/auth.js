const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  verifyUser,
  addAuditLog,
  isHospitalActive,
  listHospitals,
} = require("../db");
const { audit } = require("../services/auditService");

const router = express.Router();

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { hata: "Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin." },
  skipSuccessfulRequests: true,
});

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function destroySession(req) {
  return new Promise((resolve) => {
    if (!req.session) return resolve();
    req.session.destroy(resolve);
  });
}

async function getFallbackActiveHospitalId() {
  try {
    const hospitals = await listHospitals();
    const activeHospital = (Array.isArray(hospitals) ? hospitals : []).find(
      (x) => Number(x.aktif) === 1
    );

    return activeHospital?.id ? String(activeHospital.id) : null;
  } catch {
    return null;
  }
}

router.get("/login", loginLimit, (req, res) => {
  res.render("login", { error: null });
});

router.post("/login", loginLimit, async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");

    if (!username || !password) {
      return res.render("login", {
        error: "Kullanıcı adı ve şifre zorunludur.",
      });
    }

    const user = await verifyUser(username, password);

    if (!user) {
      addAuditLog({
        hospital_id: null,
        kullanici: username,
        ip: req.ip,
        islem: "LOGIN_FAIL",
        detay: "Hatalı şifre veya kullanıcı adı",
      }).catch(() => {});

      return res.render("login", {
        error: "Hatalı kullanıcı adı veya şifre.",
      });
    }

    const isAdmin =
      user.role === "admin" ||
      normalizeUsername(user.username) === "admin";

    let finalHospitalId = user.hospital_id ? String(user.hospital_id) : null;

    if (!isAdmin) {
      if (!finalHospitalId) {
        return res.render("login", {
          error: "Kullanıcı hastaneye bağlı değil.",
        });
      }

      const aktif = await isHospitalActive(finalHospitalId);

      if (!aktif) {
        addAuditLog({
          hospital_id: finalHospitalId,
          kullanici: user.username,
          ip: req.ip,
          islem: "LOGIN_FAIL",
          detay: "Pasif hastane kullanıcısı giriş denedi",
        }).catch(() => {});

        return res.render("login", {
          error: "Bu hastane pasif olduğu için giriş yapılamaz.",
        });
      }
    } else {
      if (finalHospitalId) {
        const aktif = await isHospitalActive(finalHospitalId);
        if (!aktif) {
          finalHospitalId = null;
        }
      }

      if (!finalHospitalId) {
        finalHospitalId = await getFallbackActiveHospitalId();
      }
    }

    req.session.user = {
      id: String(user.id),
      username: String(user.username),
      role: String(user.role || "user"),
      hospitalId: finalHospitalId,
      hospital_id: finalHospitalId,
    };

    if (finalHospitalId) {
      req.session.hospital = {
        id: finalHospitalId,
      };
    } else {
      req.session.hospital = null;
    }

    addAuditLog({
      hospital_id: finalHospitalId ?? null,
      kullanici: user.username,
      ip: req.ip,
      islem: "LOGIN",
      detay: isAdmin
        ? `Başarılı admin giriş | hospital: ${finalHospitalId || "yok"}`
        : "Başarılı giriş",
    }).catch(() => {});

    return res.redirect("/");
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).send("Login sırasında hata oluştu");
  }
});

router.get("/logout", async (req, res) => {
  try {
    audit(req, "LOGOUT", null);
    await destroySession(req);
    return res.redirect("/login");
  } catch {
    return res.redirect("/login");
  }
});

module.exports = router;