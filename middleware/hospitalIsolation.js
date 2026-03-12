const { getHospitalById, isHospitalActive } = require("../db");

function isAdminUser(user) {
  return !!user && (
    user.role === "admin" ||
    String(user.username || "").toLowerCase() === "admin"
  );
}

function destroySessionAndRedirect(req, res) {
  res.locals.currentUser = null;
  res.locals.currentHospital = null;
  req.hospital = null;

  if (req.session) {
    return req.session.destroy(() => res.redirect("/login"));
  }

  return res.redirect("/login");
}

function extractTargetHospitalId(req, paramName = "hospitalId") {
  return (
    req.params?.[paramName] ||
    req.body?.[paramName] ||
    req.query?.[paramName] ||
    null
  );
}

function getSessionHospitalId(user) {
  return String(
    user?.hospitalId ||
    user?.hospital_id ||
    ""
  ).trim();
}

async function attachHospitalContext(req, res, next) {
  try {
    const user = req.session?.user || null;

    req.hospital = null;
    res.locals.currentHospital = null;
    res.locals.currentUser = user;

    if (!user) {
      return next();
    }

    const hospitalId = getSessionHospitalId(user);

    if (!hospitalId) {
      if (isAdminUser(user)) {
        return next();
      }
      return destroySessionAndRedirect(req, res);
    }

    const hospital = await getHospitalById(hospitalId);

    if (!hospital) {
      if (isAdminUser(user)) {
        req.hospital = null;
        res.locals.currentHospital = null;
        return next();
      }
      return destroySessionAndRedirect(req, res);
    }

    if (String(hospital.id) !== hospitalId) {
      if (isAdminUser(user)) {
        req.hospital = null;
        res.locals.currentHospital = null;
        return next();
      }
      return destroySessionAndRedirect(req, res);
    }

    req.hospital = hospital;
    res.locals.currentHospital = hospital;

    if (req.session?.user) {
      req.session.user.hospitalId = hospital.id;
      req.session.user.hospital_id = hospital.id;
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

async function requireActiveHospital(req, res, next) {
  try {
    const user = req.session?.user || null;

    if (!user) {
      return next();
    }

    const hospitalId = getSessionHospitalId(user);

    if (!hospitalId) {
      if (isAdminUser(user)) {
        return next();
      }
      return destroySessionAndRedirect(req, res);
    }

    if (!req.hospital || String(req.hospital.id) !== hospitalId) {
      if (isAdminUser(user)) {
        return next();
      }
      return destroySessionAndRedirect(req, res);
    }

    const aktif = await isHospitalActive(hospitalId);

    if (!aktif) {
      if (isAdminUser(user)) {
        return res.status(403).send("Admin için seçili hastane pasif.");
      }
      return destroySessionAndRedirect(req, res);
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

function requireSameHospitalFromParam(paramName = "hospitalId") {
  return (req, res, next) => {
    const user = req.session?.user || null;

    if (!user) {
      return res.status(401).send("Oturum gerekli.");
    }

    if (isAdminUser(user)) {
      return next();
    }

    const userHospitalId = getSessionHospitalId(user);
    const targetHospitalId = String(
      extractTargetHospitalId(req, paramName) || ""
    ).trim();

    if (!userHospitalId) {
      return res.status(403).send("Hastane baglami bulunamadi.");
    }

    if (!targetHospitalId) {
      return next();
    }

    if (userHospitalId !== targetHospitalId) {
      return res.status(403).send("Bu hastane verisine erisim yetkin yok.");
    }

    return next();
  };
}

module.exports = {
  attachHospitalContext,
  requireActiveHospital,
  requireSameHospitalFromParam,
};