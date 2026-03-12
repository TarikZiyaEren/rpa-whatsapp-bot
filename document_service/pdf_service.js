const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

/**
 * Türkçe karakter destekleyen font yolları.
 * PDFKit varsayılan Helvetica Türkçe (ş, ğ, ı, İ, Ş, Ğ) DESTEKLEMİYOR.
 * Mutlaka TTF font yüklenmeli.
 */
const FONT_REGULAR = "C:\\Windows\\Fonts\\arial.ttf";
const FONT_BOLD = "C:\\Windows\\Fonts\\arialbd.ttf";

// Fallback font yolları
const FONT_FALLBACKS = [
  "C:\\Windows\\Fonts\\arial.ttf",
  "C:\\Windows\\Fonts\\segoeui.ttf",
  "C:\\Windows\\Fonts\\calibri.ttf",
  "C:\\Windows\\Fonts\\tahoma.ttf",
  path.join(__dirname, "..", "node_modules", "pdfjs-dist", "standard_fonts", "LiberationSans-Regular.ttf"),
];

const BOLD_FALLBACKS = [
  "C:\\Windows\\Fonts\\arialbd.ttf",
  "C:\\Windows\\Fonts\\segoeuib.ttf",
  "C:\\Windows\\Fonts\\calibrib.ttf",
  "C:\\Windows\\Fonts\\tahomabd.ttf",
  path.join(__dirname, "..", "node_modules", "pdfjs-dist", "standard_fonts", "LiberationSans-Bold.ttf"),
];

function findFont(candidates) {
  for (const fp of candidates) {
    try { if (fs.existsSync(fp)) return fp; } catch {}
  }
  return null;
}

/**
 * Veriyi güvenli string'e çevirir.
 * [object Object] sorununu engeller.
 */
function safeText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    return value.map(safeText).filter(Boolean).join("\n");
  }

  if (typeof value === "object") {
    // AI gerekçe objesi ise text/metin/aciklama alan varsa onu al
    if (value.text) return safeText(value.text);
    if (value.gerekce) return safeText(value.gerekce);
    if (value.metin) return safeText(value.metin);
    if (value.ozet) return safeText(value.ozet);
    if (value.aciklama) return safeText(value.aciklama);
    if (value.content) return safeText(value.content);
    if (value.message) return safeText(value.message);

    // Objenin tüm string değerlerini birleştir
    const parts = [];
    for (const [key, val] of Object.entries(value)) {
      if (typeof val === "string" && val.trim()) {
        parts.push(`${key}: ${val}`);
      }
    }
    if (parts.length > 0) return parts.join("\n");

    try { return JSON.stringify(value, null, 2); } catch {}
    return "[Veri gösterilemedi]";
  }

  return String(value);
}

function generateGerekcePDF(data) {
  const belgeNo = `DOC-${Date.now()}`;
  const filePath = path.join(__dirname, "..", "generated_docs", `${belgeNo}.pdf`);

  if (!fs.existsSync(path.dirname(filePath))) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  const regularFont = findFont(FONT_FALLBACKS);
  const boldFont = findFont(BOLD_FALLBACKS);

  if (!regularFont) {
    console.error("[PDF] UYARI: Türkçe destekleyen font bulunamadı! Türkçe karakterler bozuk olabilir.");
  }

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: "SGK Provizyon Gerekce Raporu",
      Author: "RPA Sistemi",
      Subject: `Belge No: ${belgeNo}`,
    },
  });

  // Türkçe karakter destekleyen fontu yükle
  if (regularFont) {
    doc.registerFont("Regular", regularFont);
    doc.font("Regular");
  }
  if (boldFont) {
    doc.registerFont("Bold", boldFont);
  }

  doc.pipe(fs.createWriteStream(filePath));

  // ── Başlık ──
  if (boldFont) doc.font("Bold");
  doc.fontSize(20).text("SGK Provizyon Gerekçe Raporu", { align: "center" });
  if (regularFont) doc.font("Regular");

  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#999999")
    .text(`Belge No: ${belgeNo}`, { align: "center" });
  doc.fillColor("#000000");

  doc.moveDown(1.5);

  // ── Hasta Bilgileri ──
  if (boldFont) doc.font("Bold");
  doc.fontSize(13).text("Hasta Bilgileri");
  if (regularFont) doc.font("Regular");
  doc.moveDown(0.3);
  doc.fontSize(11);
  doc.text(`Hasta: ${safeText(data.hastaAd)}`);
  doc.text(`Doğum Tarihi: ${safeText(data.hastaDogum)}`);
  doc.text(`İşlem: ${safeText(data.islemAdi)} (${safeText(data.islemKodu)})`);

  // ── Teşhisler ──
  doc.moveDown(1);
  if (boldFont) doc.font("Bold");
  doc.fontSize(13).text("Teşhisler");
  if (regularFont) doc.font("Regular");
  doc.moveDown(0.3);
  doc.fontSize(11).text(safeText(data.teshisler) || "-");

  // ── Doktor Notu ──
  doc.moveDown(1);
  if (boldFont) doc.font("Bold");
  doc.fontSize(13).text("Doktor Notu");
  if (regularFont) doc.font("Regular");
  doc.moveDown(0.3);
  doc.fontSize(11).text(safeText(data.doktorNotu) || "-");

  // ── AI Gerekçe ──
  doc.moveDown(1);
  if (boldFont) doc.font("Bold");
  doc.fontSize(13).text("AI Gerekçe");
  if (regularFont) doc.font("Regular");
  doc.moveDown(0.3);
  doc.fontSize(11).text(safeText(data.gerekce) || "AI gerekçe üretilemedi.");

  // ── Alt Bilgi ──
  doc.moveDown(2);
  doc.fontSize(9).fillColor("#999999");
  doc.text(`Oluşturulma Tarihi: ${new Date().toLocaleString("tr-TR")}`);
  doc.text("Bu belge RPA Sistemi tarafından otomatik oluşturulmuştur.");
  doc.fillColor("#000000");

  doc.end();

  return {
    belgeNo,
    filePath,
  };
}

module.exports = {
  generateGerekcePDF,
};