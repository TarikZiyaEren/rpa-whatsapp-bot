/**
 * OCR — Doktor notu / PDF okuma
 * Tesseract.js (saf JS, kurulum gerektirmez)
 * npm install tesseract.js
 */

async function gorseldenMetinCikar(dosyaYoluVeyaBase64, progress = () => {}) {
  progress("[OCR] Görsel analiz başlıyor...");

  try {
    const Tesseract = require("tesseract.js");

    const { data: { text, confidence } } = await Tesseract.recognize(
      dosyaYoluVeyaBase64,
      "tur+eng", // Türkçe + İngilizce
      {
        logger: m => {
          if (m.status === "recognizing text") {
            progress(`[OCR] İlerleme: %${Math.round(m.progress * 100)}`);
          }
        },
      }
    );

    progress(`[OCR] Tamamlandı — Güven: %${Math.round(confidence)}`);

    return {
      basarili:  true,
      metin:     text.trim(),
      guven:     Math.round(confidence),
      karakterSayisi: text.trim().length,
    };
  } catch (e) {
    progress(`[OCR] Hata: ${e.message}`);
    return { basarili: false, metin: "", guven: 0, hata: e.message };
  }
}

/**
 * PDF'den metin çıkar
 * npm install pdf-parse
 */
async function pdfdenMetinCikar(pdfBuffer, progress = () => {}) {
  progress("[OCR/PDF] PDF analiz başlıyor...");
  try {
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(pdfBuffer);
    progress(`[OCR/PDF] ${data.numpages} sayfa okundu.`);
    return {
      basarili: true,
      metin:    data.text.trim(),
      sayfaSayisi: data.numpages,
    };
  } catch (e) {
    progress(`[OCR/PDF] Hata: ${e.message}`);
    return { basarili: false, metin: "", hata: e.message };
  }
}

/**
 * Doktor notundan anahtar bilgileri çıkar
 */
function nottenBilgiCikar(metin) {
  const tani     = metin.match(/tan[ıi]\s*[:：]?\s*([^\n.]+)/i)?.[1]?.trim();
  const yas      = metin.match(/(\d{1,3})\s*yaş/i)?.[1];
  const tc       = metin.match(/\b(\d{11})\b/)?.[1];
  const tarih    = metin.match(/(\d{2}[./-]\d{2}[./-]\d{4})/)?.[1];
  const icd      = metin.match(/[A-Z]\d{2}\.?\d*/)?.[0];

  return { tani, yas: yas ? Number(yas) : null, tc, tarih, icd };
}

module.exports = { gorseldenMetinCikar, pdfdenMetinCikar, nottenBilgiCikar };