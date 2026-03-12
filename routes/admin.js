const express = require("express");
const { requireAdmin } = require("../middleware/auth");
const {
  listUsers,
  createUser,
  getUserById,
  updateUserHospital,
  deleteUser,
  listAuditLog,
  listHospitals,
  getHospitalMap,
  createHospital,
  getHospitalById,
  isHospitalActive,
  updateHospitalStatus,
} = require("../db");
const { audit } = require("../services/auditService");

const router = express.Router();

function isAdminIdentity(userLike) {
  return (
    userLike &&
    (
      userLike.role === "admin" ||
      String(userLike.username || "").toLowerCase() === "admin"
    )
  );
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

function normalizePlan(value) {
  const allowed = ["starter", "growth", "enterprise"];
  const v = normalizeText(value).toLowerCase();
  return allowed.includes(v) ? v : "starter";
}

function parseStatusFlag(value) {
  return String(value) === "1" ? 1 : 0;
}

async function buildAdminUsersViewData(selectedHospitalId = "") {
  const [users, hospitals, hospitalMap] = await Promise.all([
    listUsers(selectedHospitalId || null),
    listHospitals(),
    getHospitalMap(),
  ]);

  const enrichedUsers = users.map((user) => {
    const hospital = hospitalMap[user.hospital_id] || null;

    return {
      ...user,
      hospitalName: hospital?.ad || "-",
      hospitalCode: hospital?.kod || "-",
      hospitalPlan: hospital?.plan || "starter",
      hospitalStatus: Number(hospital?.aktif) === 1 ? "aktif" : "pasif",
    };
  });

  return {
    users: enrichedUsers,
    hospitals,
    selectedHospitalId,
  };
}

async function renderAdminUsers(req, res, extra = {}) {
  const selectedHospitalId = String(extra.selectedHospitalId ?? "");
  const { users, hospitals } = await buildAdminUsersViewData(selectedHospitalId);

  return res.render("admin_users", {
    users,
    hospitals,
    selectedHospitalId,
    ok: null,
    hata: null,
    formData: {},
    ...extra,
  });
}

router.get("/users", requireAdmin, async (req, res) => {
  const selectedHospitalId = String(req.query.hospitalId || "");
  return renderAdminUsers(req, res, { selectedHospitalId });
});

router.post("/users", requireAdmin, async (req, res) => {
  const { username, password, role, hospitalId } = req.body;

  try {
    const normalizedUsername = normalizeText(username);
    const normalizedRole = normalizeText(role || "operator");
    const normalizedHospitalId = normalizeText(hospitalId);
    const isAdminUser =
      normalizedRole === "admin" || normalizedUsername.toLowerCase() === "admin";

    if (!normalizedUsername) {
      return renderAdminUsers(req, res, {
        hata: "Kullanıcı adı zorunlu.",
        formData: req.body,
      });
    }

    if (!password || !normalizeText(password)) {
      return renderAdminUsers(req, res, {
        hata: "Şifre zorunlu.",
        formData: req.body,
      });
    }

    if (!normalizedHospitalId) {
      return renderAdminUsers(req, res, {
        hata: "Bir hastane seçmelisin.",
        formData: req.body,
      });
    }

    const aktif = await isHospitalActive(normalizedHospitalId);
    if (!aktif) {
      return renderAdminUsers(req, res, {
        hata: "Pasif hastaneye kullanıcı eklenemez.",
        formData: req.body,
      });
    }

    await createUser(
      normalizedUsername,
      password,
      normalizedRole,
      normalizedHospitalId
    );

    audit(
      req,
      "KULLANICI_EKLE",
      `Yeni kullanıcı: ${normalizedUsername} (${normalizedRole}) | Hospital: ${normalizedHospitalId}`
    );

    return renderAdminUsers(req, res, {
      ok: `${normalizedUsername} oluşturuldu.`,
    });
  } catch (e) {
    return renderAdminUsers(req, res, {
      hata: e.message,
      formData: req.body,
    });
  }
});

router.post("/users/:id/hospital", requireAdmin, async (req, res) => {
  const userId = req.params.id;
  const normalizedHospitalId = normalizeText(req.body.hospitalId);

  try {
    const user = await getUserById(userId);

    if (!user) {
      return renderAdminUsers(req, res, {
        hata: "Kullanıcı bulunamadı.",
      });
    }

    if (!normalizedHospitalId) {
      return renderAdminUsers(req, res, {
        hata: "Hedef hastane seçilmedi.",
      });
    }

    const aktif = await isHospitalActive(normalizedHospitalId);

    if (!aktif) {
      return renderAdminUsers(req, res, {
        hata: "Pasif hastaneye kullanıcı taşınamaz.",
      });
    }

    await updateUserHospital(userId, normalizedHospitalId);

    if (req.session?.user?.id === userId) {
      req.session.user.hospitalId = normalizedHospitalId;
      req.session.user.hospital_id = normalizedHospitalId;
    }

    audit(
      req,
      "KULLANICI_TASI",
      `Kullanıcı taşındı: ${user.username} | Yeni hospital: ${normalizedHospitalId}`
    );

    return renderAdminUsers(req, res, {
      ok: `${user.username} hastaneye bağlandı.`,
    });
  } catch (e) {
    return renderAdminUsers(req, res, {
      hata: e.message,
    });
  }
});

router.post("/users/:id/delete", requireAdmin, async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await getUserById(userId);

    if (!user) {
      return renderAdminUsers(req, res, {
        hata: "Kullanıcı bulunamadı.",
      });
    }

    if (isAdminIdentity(user)) {
      return renderAdminUsers(req, res, {
        hata: "Admin kullanıcısı silinemez.",
      });
    }

    await deleteUser(userId);

    audit(
      req,
      "KULLANICI_SIL",
      `Kullanıcı silindi: ${user.username}`
    );

    return renderAdminUsers(req, res, {
      ok: `${user.username} silindi.`,
    });
  } catch (e) {
    return renderAdminUsers(req, res, {
      hata: e.message,
    });
  }
});

router.post("/hospitals", requireAdmin, async (req, res) => {
  const ad = normalizeText(req.body.ad);
  const kod = normalizeCode(req.body.kod);
  const plan = normalizePlan(req.body.plan);
  const aktif = parseStatusFlag(req.body.aktif ?? 1);

  try {
    if (!ad) {
      return renderAdminUsers(req, res, {
        hata: "Hastane adı zorunlu.",
        formData: req.body,
      });
    }

    if (!kod) {
      return renderAdminUsers(req, res, {
        hata: "Hastane kodu zorunlu.",
        formData: req.body,
      });
    }

    await createHospital(ad, kod, {
      plan,
      aktif,
    });

    audit(
      req,
      "HOSPITAL_EKLE",
      `Yeni hastane: ${ad} (${kod}) | Plan: ${plan} | Durum: ${aktif ? "aktif" : "pasif"}`
    );

    return renderAdminUsers(req, res, {
      ok: `${ad} hastanesi oluşturuldu.`,
    });
  } catch (e) {
    return renderAdminUsers(req, res, {
      hata: e.message,
      formData: req.body,
    });
  }
});

router.post("/hospitals/:id/status", requireAdmin, async (req, res) => {
  const hospitalId = req.params.id;
  const aktif = parseStatusFlag(req.body.aktif);

  try {
    const hospital = await getHospitalById(hospitalId);

    if (!hospital) {
      return renderAdminUsers(req, res, {
        hata: "Hastane bulunamadı.",
      });
    }

    await updateHospitalStatus(hospitalId, aktif);

    audit(
      req,
      aktif ? "HOSPITAL_AKTIF" : "HOSPITAL_PASIF",
      `Hastane durumu değişti: ${hospital.ad} (${hospital.kod}) -> ${aktif ? "aktif" : "pasif"}`
    );

    return renderAdminUsers(req, res, {
      ok: `${hospital.ad} ${aktif ? "aktifleştirildi" : "pasifleştirildi"}.`,
    });
  } catch (e) {
    return renderAdminUsers(req, res, {
      hata: e.message,
    });
  }
});

router.get("/audit", requireAdmin, async (req, res) => {
  const selectedHospitalId = String(req.query.hospitalId || "");

  const [loglar, hospitals] = await Promise.all([
    listAuditLog(200, selectedHospitalId || null),
    listHospitals(),
  ]);

  res.render("admin_audit", {
    loglar,
    hospitals,
    selectedHospitalId,
  });
});

module.exports = router;