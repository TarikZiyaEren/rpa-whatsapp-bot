function guvenliJsonParse(ham) {
  if (!ham || typeof ham !== "string") throw new Error("Boş AI yanıtı");
  try { return JSON.parse(ham.trim()); } catch {}
  const kodBlok = ham.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (kodBlok) { try { return JSON.parse(kodBlok[1].trim()); } catch {} }
  const jsonBlok = ham.match(/\{[\s\S]*\}/);
  if (jsonBlok) { try { return JSON.parse(jsonBlok[0]); } catch {} }
  throw new Error(`AI geçersiz JSON döndürdü:\n${ham.slice(0, 300)}`);
}

function _analizPrompt(doktorNotu, islem) {
  return `Sen bir Türk sağlık sigortası uzmanısın. Sigortanın bu işlemi RED etme riskini analiz et.

### DOKTOR NOTU
${doktorNotu || "(not yok)"}

### İŞLEM
Ad: ${islem.adi}
SUT Kodu: ${islem.kodu}

### TALİMAT
Sadece aşağıdaki JSON formatında yanıt ver. Başka hiçbir metin ekleme.

{
  "redRiski": <0.0 ile 1.0 arası ondalık>,
  "gerekceler": ["<neden 1>", "<neden 2>"],
  "oneri": "<tek cümle öneri>",
  "eksikBelgeler": ["<eksik belge>"]
}`;
}

function _gerekcePrompt(v) {
  return `Sen bir Türk sağlık sigortası uzmanısın. Sigorta şirketine resmi tıbbi gerekçe mektubu yaz.

### HASTA
Ad: ${v.hastaAd} | Doğum: ${v.hastaDogum}

### İŞLEM
${v.islemAdi} (SUT: ${v.islemKodu})

### TEŞHİSLER
${v.teshisler}

### DOKTOR NOTU
${v.doktorNotu}

### TALİMAT
Türkçe, resmi dil, tıbbi terminoloji, max 3 paragraf.
Sadece aşağıdaki JSON formatında yanıt ver. Başka hiçbir metin ekleme.

{
  "gerekceMetni": "<3 paragraflık resmi metin>",
  "anaArgumanlar": ["<argüman 1>", "<argüman 2>", "<argüman 3>"]
}`;
}

async function _openaiIstek(prompt) {
  const { OpenAI } = require("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });
  return guvenliJsonParse(resp.choices[0].message.content);
}

async function _claudeIstek(prompt) {
  const Anthropic = require("@anthropic-ai/sdk");
  // DÜZELTME: CommonJS require() ile .default wrapper bazen gömülü gelir
  const Client = Anthropic.default ?? Anthropic;
  const client = new Client({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001", // DÜZELTME: doğru model string'i
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });
  return guvenliJsonParse(resp.content[0].text);
}

async function _ollamaIstek(prompt) {
  // DÜZELTME: OLLAMA_URL env'den al
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  const resp = await fetch(`${ollamaUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || "llama3",
      prompt,
      stream: false,
      format: "json",
      options: { temperature: 0.1, num_predict: 600 },
    }),
  });
  if (!resp.ok) throw new Error(`Ollama hatası: ${resp.status}`);
  const data = await resp.json();
  return guvenliJsonParse(data.response);
}

async function _mockAnalizSonuc(doktorNotu) {
  await new Promise(r => setTimeout(r, 400));
  const riskli = /kronik|ameliyat|kanser|diyaliz/i.test(doktorNotu || "");
  return {
    redRiski: riskli ? 0.75 : 0.15,
    gerekceler: riskli ? ["Kronik hastalık geçmişi", "Ek belge gerekebilir"] : ["Rutin işlem"],
    oneri: riskli ? "Epikriz eklenmesi önerilir." : "İşlem standart.",
    eksikBelgeler: riskli ? ["Epikriz", "Konsültasyon notu"] : [],
  };
}

async function _mockGerekceSonuc(v) {
  await new Promise(r => setTimeout(r, 500));
  return {
    gerekceMetni: `Sayın Sigorta Yetkilisi,\n\n${v.hastaAd} adlı hastamıza uygulanan ${v.islemAdi} işlemi, mevcut klinik bulgular doğrultusunda tıbbi zorunluluk arz etmektedir.\n\nSUT mevzuatı kapsamında değerlendirilmesi ve onaylanması hususunda gereğini arz ederim.`,
    anaArgumanlar: ["Tıbbi zorunluluk mevcut", "SUT'a uygun", "Klinik bulgular destekliyor"],
  };
}

async function aiAnaliz(doktorNotu, islemBilgisi) {
  const provider = process.env.AI_PROVIDER || "mock";
  const prompt   = _analizPrompt(doktorNotu, islemBilgisi);
  switch (provider) {
    case "openai":  return _openaiIstek(prompt);
    case "claude":  return _claudeIstek(prompt);
    case "ollama":  return _ollamaIstek(prompt);
    default:        return _mockAnalizSonuc(doktorNotu);
  }
}

async function aiGerekceUret(promptVeri) {
  const provider = process.env.AI_PROVIDER || "mock";
  const prompt   = _gerekcePrompt(promptVeri);
  switch (provider) {
    case "openai":  return _openaiIstek(prompt);
    case "claude":  return _claudeIstek(prompt);
    case "ollama":  return _ollamaIstek(prompt);
    default:        return _mockGerekceSonuc(promptVeri);
  }
}

module.exports = { aiAnaliz, aiGerekceUret };