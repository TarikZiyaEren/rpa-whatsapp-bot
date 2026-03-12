/**
 * Açıklanabilir AI Katmanı (Explainable AI)
 *
 * Tüm karar sinyallerini (kural motoru, ML, istatistik, AI) alır
 * ve insan-okunur, yapılandırılmış açıklama üretir.
 *
 * Çıktı formatı hastane yöneticisi ve yatırımcının anlayacağı seviyede:
 *   - Hangi kurallar tetiklendi ve neden
 *   - İstatistiksel kanıtlar (son N kayıtta red oranı)
 *   - Klinik bağlam (doktor notundan tespit edilen ifadeler)
 *   - Final karar özeti ve öneriler
 */

/**
 * @typedef {Object} AciklamaGirdisi
 * @property {Object}   kuralMotoru       - kurallariDegerlendir() çıktısı
 * @property {Object}   historicalData    - getRiskPrediction() çıktısı
 * @property {number}   mlSkoru           - ML model skoru (0-1)
 * @property {number}   aiSkoru           - LLM analiz skoru (0-1)
 * @property {string[]} aiGerekceler      - LLM gerekçeleri
 * @property {number}   finalRisk         - Ağırlıklı final risk skoru
 * @property {string}   seviye            - DÜŞÜK | ORTA | YÜKSEK
 * @property {Object}   ogrenmeSonuc      - Self-learning çıktısı
 * @property {number}   gecmisRedSayisi   - Hastanın geçmiş red sayısı
 * @property {Object}   veri              - { islemKodu, doktorNotu, hastaYas, hasta, islem }
 */

/**
 * Ana açıklama üretici.
 * @param {AciklamaGirdisi} girdi
 * @returns {{ kartlar: Array, ozet: string, guvenSkoru: number, detayliAciklama: string }}
 */
function aciklamaUret(girdi) {
  const {
    kuralMotoru,
    historicalData,
    mlSkoru,
    aiSkoru,
    aiGerekceler,
    finalRisk,
    seviye,
    ogrenmeSonuc,
    gecmisRedSayisi,
    veri,
  } = girdi;

  const kartlar = [];

  // 1. Tetiklenen kuralların açıklaması
  if (kuralMotoru?.tetiklenenler?.length) {
    for (const kural of kuralMotoru.tetiklenenler) {
      kartlar.push({
        tip: "kural",
        baslik: `${kural.kuralId} tetiklendi: ${kural.kuralAdi}`,
        aciklama: kural.aciklama,
        oneri: kural.oneri,
        riskEtkisi: kural.riskEtkisi,
        kategori: kural.kategori,
        onem: kural.riskEtkisi >= 0.20 ? "yuksek" : kural.riskEtkisi >= 0.10 ? "orta" : "dusuk",
      });
    }
  }

  // 2. İstatistiksel kanıtlar
  if (historicalData) {
    const { procStats, providerStats, ageStats, trainingStats } = historicalData;

    if (procStats && procStats.toplam >= 3) {
      kartlar.push({
        tip: "istatistik",
        baslik: `Son ${procStats.toplam} kayıtta bu işlem için red oranı %${Math.round(procStats.redOrani * 100)}`,
        aciklama: `${procStats.kod} kodlu işlem ${procStats.toplam} kez gönderilmiş, ${procStats.red} tanesi reddedilmiş.`,
        oneri: procStats.redOrani > 0.3
          ? "Bu işlem kodu sık reddediliyor — alternatif kod veya ek belge değerlendirin."
          : null,
        onem: procStats.redOrani > 0.4 ? "yuksek" : procStats.redOrani > 0.2 ? "orta" : "dusuk",
      });
    }

    if (providerStats && providerStats.toplam >= 3) {
      kartlar.push({
        tip: "istatistik",
        baslik: `${providerStats.provider} provider'ında genel red oranı %${Math.round(providerStats.redOrani * 100)}`,
        aciklama: `Bu provider üzerinden ${providerStats.toplam} işlem, ${providerStats.red} red.`,
        oneri: null,
        onem: providerStats.redOrani > 0.4 ? "yuksek" : "dusuk",
      });
    }

    if (ageStats && ageStats.toplam >= 3) {
      kartlar.push({
        tip: "istatistik",
        baslik: `${ageStats.grup} yaş grubunda red oranı %${Math.round(ageStats.redOrani * 100)}`,
        aciklama: `Bu yaş grubunda ${ageStats.toplam} kayıt, ${ageStats.red} red.`,
        oneri: null,
        onem: ageStats.redOrani > 0.4 ? "orta" : "dusuk",
      });
    }

    if (trainingStats) {
      kartlar.push({
        tip: "meta",
        baslik: `İstatistik modeli ${trainingStats.totalRecords} kayıt üzerinden eğitildi`,
        aciklama: `${trainingStats.distinctProcedures} farklı işlem, ${trainingStats.distinctProviders} provider, ${trainingStats.keywordPatterns} anahtar kelime paterni analiz edildi.`,
        oneri: null,
        onem: "bilgi",
      });
    }
  }

  // 3. Klinik bağlam — doktor notundan tespit edilen ifadeler
  const klinikBulguKartlari = klinikBulguAcikla(veri);
  kartlar.push(...klinikBulguKartlari);

  // 4. ML/AI model değerlendirmesi
  if (mlSkoru != null) {
    kartlar.push({
      tip: "model",
      baslik: `ML model red olasılığı: %${Math.round(mlSkoru * 100)}`,
      aciklama: "Makine öğrenmesi modeli geçmiş verilere göre red olasılığını hesapladı.",
      oneri: null,
      onem: mlSkoru >= 0.7 ? "yuksek" : mlSkoru >= 0.4 ? "orta" : "dusuk",
    });
  }

  if (aiSkoru != null) {
    kartlar.push({
      tip: "model",
      baslik: `LLM analiz riski: %${Math.round(aiSkoru * 100)}`,
      aciklama: aiGerekceler?.length
        ? aiGerekceler.join(" ")
        : "Yapay zeka modeli klinik notu analiz etti.",
      oneri: null,
      onem: aiSkoru >= 0.7 ? "yuksek" : aiSkoru >= 0.4 ? "orta" : "dusuk",
    });
  }

  // 5. Self-learning düzeltmesi
  if (ogrenmeSonuc && ogrenmeSonuc.ogrenmePuani !== 0) {
    const yön = ogrenmeSonuc.ogrenmePuani > 0 ? "artırıldı" : "azaltıldı";
    kartlar.push({
      tip: "ogrenme",
      baslik: `Self-learning: risk ${yön} (${ogrenmeSonuc.ogrenmePuani > 0 ? "+" : ""}${Math.round(ogrenmeSonuc.ogrenmePuani * 100)}%)`,
      aciklama: ogrenmeSonuc.nedenler?.join(" ") || "Geçmiş veri desenleri risk skorunu kalibre etti.",
      oneri: null,
      onem: "bilgi",
    });
  }

  // 6. Geçmiş red kaydı
  if (gecmisRedSayisi > 0) {
    kartlar.push({
      tip: "gecmis",
      baslik: `Bu hasta için daha önce ${gecmisRedSayisi} red kaydı var`,
      aciklama: `Aynı hasta geçmişte ${gecmisRedSayisi} kez reddedilmiş — risk artırıcı etki uygulandı.`,
      oneri: "Önceki red nedenlerini kontrol edip aynı hataları tekrarlamamaya dikkat edin.",
      onem: gecmisRedSayisi >= 3 ? "yuksek" : "orta",
    });
  }

  // Güven skoru: kaç farklı veri kaynağından kanıt var
  const kaynakSayisi = [
    kuralMotoru?.tetiklenenSayisi > 0,
    historicalData?.trainingStats?.totalRecords > 10,
    mlSkoru != null,
    aiSkoru != null,
    ogrenmeSonuc?.toplamKayit > 5,
  ].filter(Boolean).length;

  const guvenSkoru = Math.min(1, kaynakSayisi / 4);

  // Özet cümle
  const ozet = ozetUret(kartlar, finalRisk, seviye, kuralMotoru);

  // Detaylı açıklama (text olarak)
  const detayliAciklama = detayliAciklamaOlustur(kartlar, finalRisk, seviye);

  return {
    kartlar,
    ozet,
    guvenSkoru,
    guvenSeviyesi: guvenSkoru >= 0.75 ? "YÜKSEK" : guvenSkoru >= 0.5 ? "ORTA" : "DÜŞÜK",
    detayliAciklama,
    kaynakSayisi,
    finalRisk,
    seviye,
  };
}

/**
 * Doktor notundan klinik bulguları tespit edip kart olarak döndürür.
 */
function klinikBulguAcikla(veri) {
  const not = String(veri?.doktorNotu || "").toLowerCase();
  if (!not) return [];

  const kartlar = [];

  const klinikPatternler = [
    { pattern: /kronik böbrek|kby|böbrek yetmezliği/, bulgu: "kronik böbrek yetmezliği" },
    { pattern: /diyabet|diabetes|hba1c/, bulgu: "diyabet" },
    { pattern: /hipertansiyon|tansiyon yüksek/, bulgu: "hipertansiyon" },
    { pattern: /kanser|tümör|metastaz/, bulgu: "onkolojik durum" },
    { pattern: /koah|pnömoni|nefes darlığı/, bulgu: "solunum hastalığı" },
    { pattern: /kalp yetmezliği|koroner|miyokard/, bulgu: "kardiyovasküler hastalık" },
    { pattern: /diyaliz|hemodiyaliz/, bulgu: "diyaliz ihtiyacı" },
    { pattern: /sepsis|septik/, bulgu: "sepsis" },
    { pattern: /safra|kolesist/, bulgu: "safra yolu patolojisi" },
    { pattern: /anemi|kansızlık/, bulgu: "anemi" },
  ];

  for (const { pattern, bulgu } of klinikPatternler) {
    if (pattern.test(not)) {
      kartlar.push({
        tip: "klinik",
        baslik: `Doktor notunda "${bulgu}" tespit edildi`,
        aciklama: `Klinik bağlam: ${bulgu} ifadesi doktor notunda bulundu — risk değerlendirmesine dahil edildi.`,
        oneri: null,
        onem: "bilgi",
      });
    }
  }

  return kartlar;
}

/**
 * Tüm kartlardan tek cümlelik özet üretir.
 */
function ozetUret(kartlar, finalRisk, seviye, kuralMotoru) {
  const kuralSayisi = kuralMotoru?.tetiklenenSayisi || 0;
  const yuksekOnemiKartlar = kartlar.filter((k) => k.onem === "yuksek");

  if (seviye === "YÜKSEK") {
    const topNeden = yuksekOnemiKartlar.slice(0, 2).map((k) => k.baslik).join("; ");
    return `YÜKSEK RİSK (%${Math.round(finalRisk * 100)}): ${kuralSayisi} kural tetiklendi. Ana nedenler: ${topNeden || "çoklu risk faktörü"}.`;
  }

  if (seviye === "ORTA") {
    return `ORTA RİSK (%${Math.round(finalRisk * 100)}): ${kuralSayisi} kural tetiklendi. İşlem öncesi kontrol önerilir.`;
  }

  return `DÜŞÜK RİSK (%${Math.round(finalRisk * 100)}): ${kuralSayisi} kural tetiklendi. İşlem standart akışta ilerleyebilir.`;
}

/**
 * Tüm kartlardan insana yönelik detaylı açıklama metni üretir.
 */
function detayliAciklamaOlustur(kartlar, finalRisk, seviye) {
  const satirlar = [];

  satirlar.push(`## Karar Açıklaması — Risk: ${seviye} (%${Math.round(finalRisk * 100)})\n`);

  // Kategorilere göre grupla
  const kuralKartlar = kartlar.filter((k) => k.tip === "kural");
  const istatistikKartlar = kartlar.filter((k) => k.tip === "istatistik");
  const klinikKartlar = kartlar.filter((k) => k.tip === "klinik");
  const modelKartlar = kartlar.filter((k) => k.tip === "model");
  const digerKartlar = kartlar.filter((k) => !["kural", "istatistik", "klinik", "model"].includes(k.tip));

  if (kuralKartlar.length) {
    satirlar.push("### Tetiklenen Kurallar");
    for (const k of kuralKartlar) {
      satirlar.push(`- **${k.baslik}**: ${k.aciklama}`);
      if (k.oneri) satirlar.push(`  → Öneri: ${k.oneri}`);
    }
    satirlar.push("");
  }

  if (istatistikKartlar.length) {
    satirlar.push("### İstatistiksel Kanıtlar");
    for (const k of istatistikKartlar) {
      satirlar.push(`- ${k.baslik}: ${k.aciklama}`);
    }
    satirlar.push("");
  }

  if (klinikKartlar.length) {
    satirlar.push("### Klinik Bağlam");
    for (const k of klinikKartlar) {
      satirlar.push(`- ${k.baslik}`);
    }
    satirlar.push("");
  }

  if (modelKartlar.length) {
    satirlar.push("### Model Değerlendirmeleri");
    for (const k of modelKartlar) {
      satirlar.push(`- ${k.baslik}: ${k.aciklama}`);
    }
    satirlar.push("");
  }

  if (digerKartlar.length) {
    satirlar.push("### Ek Bilgiler");
    for (const k of digerKartlar) {
      satirlar.push(`- ${k.baslik}: ${k.aciklama}`);
    }
    satirlar.push("");
  }

  return satirlar.join("\n");
}

module.exports = { aciklamaUret };
