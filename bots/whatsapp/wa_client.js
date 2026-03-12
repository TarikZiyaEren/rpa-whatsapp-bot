const WA_TOKEN = process.env.WA_TOKEN;
const WA_PHONE = process.env.WA_PHONE_ID;
const WA_VERSION = process.env.WA_VERSION || "v19.0";
const BASE_URL = `https://graph.facebook.com/${WA_VERSION}/${WA_PHONE}/messages`;

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRY = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenPreview(token) {
  if (!token) return null;
  if (token.length <= 10) return "***";
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function ensureConfig() {
  const eksikler = [];

  if (!WA_TOKEN) eksikler.push("WA_TOKEN");
  if (!WA_PHONE) eksikler.push("WA_PHONE_ID");
  if (!WA_VERSION) eksikler.push("WA_VERSION");

  if (eksikler.length) {
    throw new Error(`WhatsApp config eksik: ${eksikler.join(", ")}`);
  }
}

async function parseResponseSafely(resp) {
  const text = await resp.text();

  try {
    return {
      rawText: text,
      json: JSON.parse(text),
    };
  } catch {
    return {
      rawText: text,
      json: null,
    };
  }
}

function sanitizePayloadForLog(payload) {
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return { note: "payload stringify edilemedi" };
  }
}

async function waRequest(payload, retry = 0) {
  ensureConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const logPayload = sanitizePayloadForLog(payload);

  console.log("[WA CLIENT] İstek hazırlanıyor:", {
    retry,
    url: BASE_URL,
    phoneId: WA_PHONE,
    version: WA_VERSION,
    tokenPreview: tokenPreview(WA_TOKEN),
    payload: logPayload,
  });

  try {
    const resp = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const parsed = await parseResponseSafely(resp);

    console.log("[WA CLIENT] Yanıt alındı:", {
      status: resp.status,
      ok: resp.ok,
      body: parsed.json || parsed.rawText,
    });

    if (!resp.ok) {
      const retryable = resp.status >= 500 || resp.status === 429;

      if (retryable && retry < MAX_RETRY) {
        console.warn("[WA CLIENT] Retry yapılacak:", {
          status: resp.status,
          retry,
        });

        await sleep(800 * (retry + 1));
        return waRequest(payload, retry + 1);
      }

      throw new Error(
        `WA API Hatası (${resp.status}): ${parsed.rawText || "Bilinmeyen hata"}`
      );
    }

    return parsed.json || parsed.rawText;
  } catch (err) {
    const retryable =
      err.name === "AbortError" ||
      /fetch failed/i.test(err.message) ||
      /network/i.test(err.message) ||
      /ECONNRESET/i.test(err.message) ||
      /ETIMEDOUT/i.test(err.message);

    console.error("[WA CLIENT] İstek hatası:", {
      retry,
      errorName: err.name,
      errorMessage: err.message,
    });

    if (retryable && retry < MAX_RETRY) {
      console.warn("[WA CLIENT] Ağ/timeout retry yapılacak:", {
        retry,
      });

      await sleep(800 * (retry + 1));
      return waRequest(payload, retry + 1);
    }

    if (err.name === "AbortError") {
      throw new Error("WA API timeout oldu");
    }

    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function waSend(to, body) {
  console.log("[WA CLIENT] Text gönderiliyor:", { to, body });

  return waRequest({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
}

async function waSendButtons(to, body, buttons) {
  const safeButtons = Array.isArray(buttons) ? buttons.slice(0, 3) : [];

  console.log("[WA CLIENT] Button gönderiliyor:", {
    to,
    body,
    buttons: safeButtons,
  });

  return waRequest({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: safeButtons.map((b) => ({
          type: "reply",
          reply: {
            id: String(b.id || "").trim(),
            title: String(b.title || "").trim(),
          },
        })),
      },
    },
  });
}

async function waSendList(to, body, sections) {
  const safeSections = Array.isArray(sections) ? sections : [];

  console.log("[WA CLIENT] List gönderiliyor:", {
    to,
    body,
    sectionsCount: safeSections.length,
    sections: safeSections,
  });

  return waRequest({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: {
        button: "Seçenekler",
        sections: safeSections,
      },
    },
  });
}

async function waSendTemplate(to, templateName, langCode = "tr", components = []) {
  console.log("[WA CLIENT] Template gönderiliyor:", {
    to,
    templateName,
    langCode,
    components,
  });

  return waRequest({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: langCode },
      components,
    },
  });
}

module.exports = {
  waSend,
  waSendButtons,
  waSendList,
  waSendTemplate,
};