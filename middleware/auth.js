const ROL_YETKILERI = {
  admin: ["*"],
  operator: ["provizyon", "red_onleme", "history", "dashboard", "credentials"],
  viewer: ["history", "dashboard"],
  kvkk_officer: ["kvkk", "dashboard"],
};

function isAdmin(user) {
  return !!user && (
    user.role === "admin" ||
    String(user.username || "").toLowerCase() === "admin"
  );
}

function clearUserLocals(req, res) {
  res.locals.currentUser = null;
  res.locals.currentHospital = null;
  req.hospital = null;
}

function destroySessionAndRedirect(req, res) {
  clearUserLocals(req, res);

  if (req.session) {
    return req.session.destroy(() => res.redirect("/login"));
  }

  return res.redirect("/login");
}

function ensureSessionUser(req, res) {
  const user = req.session?.user || null;

  if (!user) {
    return { ok: false, response: res.redirect("/login") };
  }

  res.locals.currentUser = user;
  return { ok: true, user };
}

function getSessionHospitalId(user) {
  return String(
    user?.hospitalId ||
    user?.hospital_id ||
    ""
  ).trim();
}

function ensureHospitalBoundUser(req, res, user) {
  if (isAdmin(user)) {
    const sessionHospitalId = getSessionHospitalId(user);
    const requestHospitalId = String(req.hospital?.id || "").trim();

    if (sessionHospitalId && requestHospitalId && sessionHospitalId !== requestHospitalId) {
      return {
        ok: false,
        response: res.status(403).render("error", {
          mesaj: "Admin hastane bağlamı doğrulanamadı.",
        }),
      };
    }

    return { ok: true };
  }

  const sessionHospitalId = getSessionHospitalId(user);
  const requestHospitalId = String(req.hospital?.id || "").trim();

  if (!sessionHospitalId) {
    return { ok: false, response: destroySessionAndRedirect(req, res) };
  }

  if (!requestHospitalId) {
    return {
      ok: false,
      response: res.status(403).render("error", {
        mesaj: "Aktif hastane bağlamı bulunamadı.",
      }),
    };
  }

  if (sessionHospitalId !== requestHospitalId) {
    return {
      ok: false,
      response: res.status(403).render("error", {
        mesaj: "Hastane erişim bağlamı doğrulanamadı.",
      }),
    };
  }

  return { ok: true };
}

function requireAuth(req, res, next) {
  const sessionCheck = ensureSessionUser(req, res);
  if (!sessionCheck.ok) return sessionCheck.response;

  const hospitalCheck = ensureHospitalBoundUser(req, res, sessionCheck.user);
  if (!hospitalCheck.ok) return hospitalCheck.response;

  return next();
}

function requireAdmin(req, res, next) {
  const sessionCheck = ensureSessionUser(req, res);
  if (!sessionCheck.ok) return sessionCheck.response;

  if (isAdmin(sessionCheck.user)) {
    return next();
  }

  return res.status(403).render("error", {
    mesaj: "Bu sayfa sadece admin içindir.",
  });
}

function requireRole(...izinler) {
  return (req, res, next) => {
    const sessionCheck = ensureSessionUser(req, res);
    if (!sessionCheck.ok) return sessionCheck.response;

    const user = sessionCheck.user;

    const hospitalCheck = ensureHospitalBoundUser(req, res, user);
    if (!hospitalCheck.ok) return hospitalCheck.response;

    const rol = String(user.role || "").trim();
    const yetkiler = ROL_YETKILERI[rol] || [];

    if (yetkiler.includes("*")) {
      return next();
    }

    const izinVar = izinler.some((izin) => yetkiler.includes(izin));

    if (izinVar) {
      return next();
    }

    return res.status(403).render("error", {
      mesaj: `Bu sayfaya erişim yetkiniz yok. (Rol: ${rol || "tanımsız"})`,
    });
  };
}

function rolYetkiVarMi(rol, izin) {
  const yetkiler = ROL_YETKILERI[String(rol || "").trim()] || [];
  return yetkiler.includes("*") || yetkiler.includes(izin);
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireRole,
  rolYetkiVarMi,
  ROL_YETKILERI,
};