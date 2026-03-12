/**
 * IVR — Sesli Yanıt Sistemi
 * Twilio Voice API veya mock
 * npm install twilio
 */

const IVR_TIP = process.env.IVR_TIP || "mock"; // mock | twilio

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM  = process.env.TWILIO_PHONE_NUMBER;

// Sesli arama başlat
async function aramaBaslat({ telefon, mesaj, webhookUrl }) {
  if (IVR_TIP === "twilio") return twilioAra({ telefon, mesaj, webhookUrl });
  return mockAra({ telefon, mesaj });
}

// Randevu hatırlatma araması
async function randevuHatirlatmaAra({ telefon, ad, poliklinik, tarih, saat }) {
  const mesaj = `Merhaba ${ad}. Yarın ${tarih} saat ${saat}de ${poliklinik} polikliniğinde randevunuz bulunmaktadır. Randevunuzu iptal etmek için 1e basın. Onaylamak için 2ye basın.`;
  return aramaBaslat({
    telefon,
    mesaj,
    webhookUrl: process.env.IVR_WEBHOOK_URL || null,
  });
}

// Provizyon sonucu araması
async function provizyonSonucuAra({ telefon, ad, sonuc, provizyonNo }) {
  const durumMetni = sonuc?.toUpperCase().includes("ONAY")
    ? "onaylandı"
    : "reddedildi";
  const mesaj = `Merhaba ${ad}. ${provizyonNo} numaralı provizyon talebiniz ${durumMetni}. Detaylı bilgi için hastanemizi arayabilirsiniz.`;
  return aramaBaslat({ telefon, mesaj });
}

async function mockAra({ telefon, mesaj }) {
  console.log(`[IVR/Mock] Arama simüle edildi → ${telefon}: "${mesaj.slice(0, 60)}..."`);
  return {
    basarili:  true,
    tip:       "mock",
    telefon,
    aramaId:   `MOCK-${Date.now()}`,
    mesajOzet: mesaj.slice(0, 80),
  };
}

async function twilioAra({ telefon, mesaj, webhookUrl }) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    throw new Error("Twilio credentials eksik (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER).");
  }

  const twilio = require("twilio")(TWILIO_SID, TWILIO_TOKEN);

  // TwiML — sesli mesaj
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="tr-TR" voice="Polly.Filiz">${mesaj}</Say>
  ${webhookUrl ? `<Gather numDigits="1" action="${webhookUrl}/ivr/yanit" method="POST">
    <Say language="tr-TR">Seçiminiz için bir rakam girin.</Say>
  </Gather>` : ""}
</Response>`;

  const arama = await twilio.calls.create({
    twiml,
    to:   telefon.startsWith("+") ? telefon : `+90${telefon}`,
    from: TWILIO_FROM,
  });

  return {
    basarili: true,
    tip:      "twilio",
    telefon,
    aramaId:  arama.sid,
    durum:    arama.status,
  };
}

// IVR webhook — kullanıcı tuş yanıtı
function ivrYanitIsle(tuş, context = {}) {
  switch (tuş) {
    case "1": return { eylem: "iptal",   mesaj: "Randevunuz iptal edildi. İyi günler." };
    case "2": return { eylem: "onayla",  mesaj: "Randevunuz onaylandı. İyi günler." };
    case "9": return { eylem: "operator", mesaj: "Sizi operatöre bağlıyoruz." };
    default:  return { eylem: "bilinmiyor", mesaj: "Geçersiz tuş. Lütfen tekrar deneyin." };
  }
}

module.exports = { aramaBaslat, randevuHatirlatmaAra, provizyonSonucuAra, ivrYanitIsle };