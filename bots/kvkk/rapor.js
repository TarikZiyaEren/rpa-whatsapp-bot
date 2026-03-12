/**
 * KVKK denetim raporu oluşturucu
 */

function raporOlustur(ihlaller, istatistik, taranmaZamani) {
  const { yuksek, orta, dusuk, seviye } = istatistik;

  const satirlar = ihlaller.map((ih, i) =>
    `${i + 1}. [${ih.risk}] ${ih.kural_kodu}: ${ih.aciklama}\n   Öneri: ${ih.oneri}\n   Kayıt: ${ih.tc || "—"} | ${ih.zaman || "—"}`
  ).join("\n\n");

  return `
══════════════════════════════════════
     KVKK DENETİM RAPORU
══════════════════════════════════════
Tarama Zamanı : ${taranmaZamani}
Genel Risk    : ${seviye}
──────────────────────────────────────
📊 ÖZET
  Toplam İhlal : ${ihlaller.length}
  🔴 Yüksek    : ${yuksek}
  🟡 Orta      : ${orta}
  🟢 Düşük     : ${dusuk}
──────────────────────────────────────
📋 İHLAL DETAYLARI

${satirlar || "İhlal bulunamadı. ✅"}

──────────────────────────────────────
⚠️  ÖNERİLER
${yuksek > 0 ? "• Yüksek riskli ihlaller acilen giderilmelidir!\n" : ""}${orta > 0 ? "• Orta riskli ihlaller 30 gün içinde çözülmelidir.\n" : ""}• Periyodik KVKK taraması önerilir (aylık).
- Çalışanlara KVKK eğitimi verilmesi önerilir.
══════════════════════════════════════
  `.trim();
}

module.exports = { raporOlustur };