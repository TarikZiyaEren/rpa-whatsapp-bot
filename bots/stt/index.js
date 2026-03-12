/**
 * STT — Sesli not → metin
 * Whisper API (OpenAI) veya mock
 * npm install form-data
 */

const STT_TIP = process.env.STT_TIP || "mock"; // mock | whisper | azure

async function sestenMetneConver(audioBuffer, dosyaAdi = "ses.webm", progress = () => {}) {
  progress(`[STT] Ses tanıma başlıyor (${STT_TIP})...`);

  switch (STT_TIP) {
    case "whisper": return whisperCevir(audioBuffer, dosyaAdi, progress);
    case "azure":   return azureCevir(audioBuffer, dosyaAdi, progress);
    case "mock":
    default:        return mockCevir(progress);
  }
}

async function mockCevir(progress) {
  progress("[STT/Mock] Demo metin döndürülüyor...");
  await new Promise(r => setTimeout(r, 500));
  return {
    basarili: true,
    metin:    "Hasta kronik böbrek yetmezliği tanısıyla başvurdu. Diyaliz endikasyonu mevcut.",
    dil:      "tr",
    sure:     0,
    tip:      "mock",
  };
}

async function whisperCevir(audioBuffer, dosyaAdi, progress) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY eksik.");

  const FormData = require("form-data");
  const axios    = require("axios");

  const form = new FormData();
  form.append("file", audioBuffer, { filename: dosyaAdi, contentType: "audio/webm" });
  form.append("model", "whisper-1");
  form.append("language", "tr");

  progress("[STT/Whisper] OpenAI'ye gönderiliyor...");

  const res = await axios.post(
    "https://api.openai.com/v1/audio/transcriptions",
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      timeout: 30000,
    }
  );

  progress("[STT/Whisper] Tamamlandı.");
  return {
    basarili: true,
    metin:    res.data.text,
    dil:      "tr",
    tip:      "whisper",
  };
}

async function azureCevir(audioBuffer, dosyaAdi, progress) {
  const AZURE_KEY    = process.env.AZURE_STT_KEY;
  const AZURE_REGION = process.env.AZURE_STT_REGION || "westeurope";
  if (!AZURE_KEY) throw new Error("AZURE_STT_KEY eksik.");

  const axios = require("axios");
  progress("[STT/Azure] Azure'a gönderiliyor...");

  const res = await axios.post(
    `https://${AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=tr-TR`,
    audioBuffer,
    {
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type": "audio/wav",
      },
      timeout: 30000,
    }
  );

  progress("[STT/Azure] Tamamlandı.");
  return {
    basarili: true,
    metin:    res.data.DisplayText || res.data.NBest?.[0]?.Display || "",
    dil:      "tr",
    tip:      "azure",
  };
}

module.exports = { sestenMetneConver };