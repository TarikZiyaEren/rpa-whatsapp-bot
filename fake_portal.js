const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.FAKE_PORTAL_PORT || 4000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "fake_views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function hasAuthCookie(req) {
  const cookie = req.headers.cookie || "";
  return cookie.includes("auth=1");
}

function requireAuth(req, res, next) {
  if (!hasAuthCookie(req)) return res.redirect("/login");
  next();
}

function buildMockProvizyonResponse(payload = {}) {
  const tc = String(payload?.hasta?.tc || "").trim();
  const ad = String(payload?.hasta?.ad || "").trim();
  const dogum = String(payload?.hasta?.dogum || "").trim();
  const islemKodu = String(payload?.islem?.kodu || "").trim();

  if (!tc || !ad || !dogum || !islemKodu) {
    return {
      basarili: false,
      durum: "RED",
      hataKodu: "ERR_MISSING_FIELD",
      hataMesaji: "Zorunlu alan eksik.",
      takipNo: null,
      mesaj: "Eksik veri nedeniyle provizyon alınamadı.",
    };
  }

  if (tc.length !== 11) {
    return {
      basarili: false,
      durum: "RED",
      hataKodu: "ERR_TC",
      hataMesaji: "TC 11 haneli olmalı.",
      takipNo: null,
      mesaj: "TC doğrulama hatası.",
    };
  }

  const lastDigit = Number(tc.slice(-1));
  const onay = lastDigit % 2 === 0;
  const takipNo = `TKP-${Date.now()}`;

  if (onay) {
    return {
      basarili: true,
      durum: "ONAY",
      hataKodu: null,
      hataMesaji: null,
      takipNo,
      mesaj: "Provizyon onaylandı.",
    };
  }

  return {
    basarili: false,
    durum: "RED",
    hataKodu: "SGK_DEMO_RED",
    hataMesaji: "Demo kurala göre provizyon reddedildi.",
    takipNo,
    mesaj: "Provizyon reddedildi.",
  };
}

app.get("/", (_req, res) => res.redirect("/login"));

app.get("/login", (_req, res) => res.render("login", { error: null }));

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  // Test/demo modunda herhangi bir credential kabul et
  if (username && password) {
    res.setHeader("Set-Cookie", "auth=1; Path=/; SameSite=Lax");
    return res.redirect("/provizyon");
  }

  return res.render("login", { error: "Kullanıcı adı ve şifre boş bırakılamaz." });
});

app.get("/provizyon", requireAuth, (_req, res) => {
  res.render("provizyon", { result: null, error: null });
});

app.post("/provizyon", requireAuth, (req, res) => {
  const { tc, ad, dogum, islem_kodu } = req.body;

  const payload = {
    hasta: { tc, ad, dogum },
    islem: { kodu: islem_kodu || "520.010" },
  };

  const sgkResult = buildMockProvizyonResponse({
    hasta: {
      tc: payload.hasta.tc,
      ad: payload.hasta.ad,
      dogum: payload.hasta.dogum,
    },
    islem: {
      kodu: payload.islem.kodu,
    },
  });

  const result = {
    status: sgkResult.durum,
    message:
      sgkResult.durum === "ONAY"
        ? `Durum: ONAY — Takip No: ${sgkResult.takipNo}`
        : `Durum: RED — ${sgkResult.hataKodu}: ${sgkResult.hataMesaji}`,
    tc,
    ad,
    dogum,
  };

  return res.render("provizyon", { result, error: null });
});

/**
 * Backend gateway'in çağırdığı SGK mock API
 */
app.post("/sgk/provizyon", (req, res) => {
  const payload = req.body || {};
  const response = buildMockProvizyonResponse(payload);
  return res.json(response);
});

app.get("/logout", (_req, res) => {
  res.setHeader("Set-Cookie", "auth=0; Path=/; Max-Age=0");
  res.redirect("/login");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Sahte Sigorta Portalı: http://127.0.0.1:${PORT}`);
});