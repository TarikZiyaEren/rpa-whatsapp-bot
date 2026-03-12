const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { listProviders, getProviderSchema } = require("../providers");
const { saveCredential, listCredentials } = require("../db");
const { audit } = require("../services/auditService");

const router = express.Router();

function isAdmin(user) {
  return !!user && (
    user.role === "admin" ||
    String(user.username || "").toLowerCase() === "admin"
  );
}

function getUserContext(req) {
  const user = req.session?.user || null;
  const hospitalId = String(req.hospital?.id || user?.hospitalId || "").trim();
  const userId = String(user?.id || "").trim();

  return {
    user,
    userId,
    hospitalId,
  };
}

async function renderCredentialsPage(req, res, extra = {}) {
  const providers = listProviders();
  const { hospitalId, userId } = getUserContext(req);

  const saved =
    hospitalId && userId
      ? await listCredentials(hospitalId, userId)
      : [];

  return res.render("credentials", {
    providers,
    saved,
    ok: null,
    hata: null,
    formData: {},
    ...extra,
  });
}

router.get("/", requireAuth, requireRole("credentials"), async (req, res) => {
  const { user, hospitalId } = getUserContext(req);

  if (!hospitalId && !isAdmin(user)) {
    return renderCredentialsPage(req, res, {
      hata: "Bu kullanıcı bir hastaneye bağlı değil.",
    });
  }

  if (isAdmin(user) && !hospitalId) {
    return renderCredentialsPage(req, res, {
      hata: "Admin için aktif hastane bağlamı bulunamadı.",
    });
  }

  return renderCredentialsPage(req, res);
});

router.post("/", requireAuth, requireRole("credentials"), async (req, res) => {
  const { provider, ...rest } = req.body;
  const { user, userId, hospitalId } = getUserContext(req);

  if (!hospitalId && !isAdmin(user)) {
    return renderCredentialsPage(req, res, {
      hata: "Bu kullanıcı bir hastaneye bağlı değil.",
      formData: req.body,
    });
  }

  if (isAdmin(user) && !hospitalId) {
    return renderCredentialsPage(req, res, {
      hata: "Admin için aktif hastane bağlamı bulunamadı.",
      formData: req.body,
    });
  }

  if (!userId) {
    return renderCredentialsPage(req, res, {
      hata: "Geçerli kullanıcı oturumu bulunamadı.",
      formData: req.body,
    });
  }

  if (!provider) {
    return renderCredentialsPage(req, res, {
      hata: "Provider seçmelisin.",
      formData: req.body,
    });
  }

  const schema = getProviderSchema(provider);

  if (!Array.isArray(schema) || !schema.length) {
    return renderCredentialsPage(req, res, {
      hata: "Geçersiz provider.",
      formData: req.body,
    });
  }

  const missing = schema.filter((f) => {
    if (!f.required) return false;
    const val = rest[f.key];
    return !val || String(val).trim() === "";
  });

  if (missing.length) {
    return renderCredentialsPage(req, res, {
      hata: `Zorunlu alanlar eksik: ${missing.map((x) => x.label).join(", ")}`,
      formData: req.body,
    });
  }

  try {
    const payload = {};

    for (const field of schema) {
      payload[field.key] = rest[field.key] == null ? "" : String(rest[field.key]).trim();
    }

    await saveCredential(
      hospitalId,
      userId,
      provider,
      payload
    );

    audit(req, "CREDENTIAL_KAYDET", `Provider: ${provider}`);

    return renderCredentialsPage(req, res, {
      ok: `${provider} credentials kaydedildi.`,
    });
  } catch (e) {
    return renderCredentialsPage(req, res, {
      hata: e.message,
      formData: req.body,
    });
  }
});

module.exports = router;