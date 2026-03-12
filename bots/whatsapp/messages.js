const MESAJLAR = {
  hosgeldin: (ad) =>
    `🏥 *Merhaba${ad ? " " + ad : ""}!*\n\nHastane RPA sistemine hoş geldiniz.\nSize nasıl yardımcı olabilirim?`,

  anaMenu: () => ({
    body: "🏥 *Ana Menü*\nLütfen bir işlem seçin:",
    buttons: [
      { id: "menu_randevu", title: "Randevu Al" },
      { id: "menu_provizyon", title: "Provizyon" },
      { id: "menu_bilgi", title: "Hasta Bilgisi" },
    ],
  }),

  triajSor: () =>
    "🩺 *Şikayetinizi kısaca yazın.*\n\nÖrnek: göğüs ağrısı, baş dönmesi, ateş, nefes darlığı\n\nDoğrudan randevu için *randevu* yazın:",

  acilYonlendirme: (semptom) =>
    `🚨 *ACİL DURUM TESPİT EDİLDİ*\n\n"${semptom}" şikayetiniz acil müdahale gerektirebilir.\n\n⚠️ Lütfen hemen Acil Servis'e başvurun veya 112'yi arayın.\n\nAcil: 112\nHastane Acil: 444 XX XX`,

  triajOneri: (poliklinik, gerekce) =>
    `✅ *Şikayetiniz değerlendirildi.*\n\n📍 Önerilen Poliklinik: *${poliklinik}*\n💬 ${gerekce}\n\nBu polikliniğe randevu almak ister misiniz?`,

  triajOneriButonlar: (poliklinik) => ({
    body: `${poliklinik} polikliniğine randevu alalım mı?`,
    buttons: [
      { id: "triaj_evet", title: "Evet" },
      { id: "triaj_baska", title: "Başka Bölüm" },
      { id: "triaj_iptal", title: "İptal" },
    ],
  }),

  tcSor: () =>
    "Lütfen *TC Kimlik Numaranızı* girin (11 hane):",

  dogumSor: () =>
    "Lütfen *doğum tarihinizi* girin (örn: 15.03.1985):",

  hastaDogrulama: (ad) =>
    `✅ Hasta doğrulandı: *${ad}*`,

  provizyonSonuc: (durum, provizyonNo) => {
    const emoji = durum === "ONAY" ? "✅" : "❌";
    return `${emoji} *Provizyon Durumu: ${durum}*\n\nProvizyon No: ${provizyonNo || "—"}\n\nBaşka bir işlem için *menü* yazabilirsiniz.`;
  },

  randevuPoliklinikSec: () => ({
    body: "📅 *Randevu Al*\nHangi polikliniğe randevu almak istiyorsunuz?",
    sections: [
      {
        title: "Poliklinikler",
        rows: [
          { id: "pol_dahiliye", title: "Dahiliye", description: "İç Hastalıkları" },
          { id: "pol_kardiyoloji", title: "Kardiyoloji", description: "Kalp ve Damar" },
          { id: "pol_ortopedi", title: "Ortopedi", description: "Kemik ve Eklem" },
          { id: "pol_goz", title: "Göz", description: "Göz Hastalıkları" },
          { id: "pol_noroloji", title: "Nöroloji", description: "Sinir Hastalıkları" },
        ],
      },
    ],
  }),

  randevuTarihSor: (poliklinik) =>
    `📅 *${poliklinik}* için randevu tarihi girin (örn: 25.03.2026):`,

  randevuOnay: (poliklinik, tarih, saat) =>
    `✅ *Randevunuz Oluşturuldu!*\n\n📍 Poliklinik: *${poliklinik}*\n📅 Tarih: *${tarih}*\n🕐 Saat: *${saat}*\n\nRandevu hatırlatması bir gün önce gönderilecektir.`,

  hatirlatici: (ad, poliklinik, tarih, saat) =>
    `🔔 *Randevu Hatırlatması*\n\nMerhaba *${ad}*,\n\nYarın randevunuz var:\n📍 ${poliklinik}\n📅 ${tarih}\n🕐 ${saat}\n\nSağlıklı günler dileriz.`,

  hata: () =>
    "⚠️ Bir hata oluştu. Lütfen tekrar deneyin veya hastaneyi arayın.",

  anlamadim: () =>
    "Üzgünüm, anlayamadım.\nAna menüye dönmek için *menü* yazın.",

  islemTamamlandi: (data) => {
    const emoji = data.sonuc === "ONAY" ? "✅" : data.sonuc === "RED" ? "❌" : "⚠️";
    const sureSn = data.sure ? (data.sure / 1000).toFixed(1) + "s" : "—";

    return [
      `${emoji} *İşlem Tamamlandı*`,
      ``,
      `İşlem: *${data.islemKodu || "-"}*`,
      `Hasta: *${data.hastaAd || "—"}*`,
      `Provider: *${data.provider || "—"}*`,
      `Sonuç: *${data.sonuc || "—"}*`,
      `Süre: *${sureSn}*`,
      data.takipNo ? `Takip No: ${data.takipNo}` : "",
      data.risk ? `AI Risk: *%${Math.round(data.risk * 100)}*` : "",
      ``,
      `${new Date().toLocaleString("tr-TR")}`,
    ]
      .filter(Boolean)
      .join("\n");
  },

  yuksekRiskUyarisi: (data) => {
    const riskPct = Math.round((data.risk || 0) * 100);

    return [
      `🚨 *YÜKSEK RİSK UYARISI*`,
      ``,
      `Bir işlemde yüksek red riski tespit edildi:`,
      ``,
      `İşlem: *${data.islemKodu || "-"}*`,
      `Hasta: *${data.hastaAd || "—"}*`,
      `Provider: *${data.provider || "—"}*`,
      `Risk Skoru: *%${riskPct}*`,
      ``,
      `Tetiklenen Kurallar:`,
      ...(data.kurallar || []).map((k, i) => `${i + 1}. ${k}`),
      ``,
      `Bu işlem AI tarafından otomatik incelenecek.`,
      `${new Date().toLocaleString("tr-TR")}`,
    ]
      .filter(Boolean)
      .join("\n");
  },

  gunlukRapor: (data) => {
    const basariOrani = data.toplam > 0 ? Math.round((data.onay / data.toplam) * 100) : 0;
    const redOrani = data.toplam > 0 ? Math.round((data.red / data.toplam) * 100) : 0;

    const barOnay = "🟩".repeat(Math.min(Math.round(basariOrani / 10), 10));
    const barRed = "🟥".repeat(Math.min(Math.round(redOrani / 10), 10));

    return [
      `📊 *Günlük Provizyon Raporu*`,
      `📅 ${data.tarih || new Date().toLocaleDateString("tr-TR")}`,
      `${"─".repeat(28)}`,
      ``,
      `Toplam İşlem: *${data.toplam || 0}*`,
      `Onay: *${data.onay || 0}* (${basariOrani}%)`,
      `Red: *${data.red || 0}* (${redOrani}%)`,
      `AI Bloke: *${data.aiBloke || 0}*`,
      `Retry Başarı: *${data.retryBasari || 0}*`,
      ``,
      `Onay: ${barOnay} ${basariOrani}%`,
      `Red: ${barRed} ${redOrani}%`,
      ``,
      `Ort. Bot Süresi: *${data.ortSure || "—"}s*`,
      `Tasarruf Edilen: *${data.tasarrufDk || 0} dk*`,
      `Maliyet Kazancı: *₺${data.tasarrufTL || 0}*`,
      ``,
      data.enCokRed ? `En Sık Red Nedeni: ${data.enCokRed}` : "",
      data.enRiskliProvider ? `En Riskli Provider: ${data.enRiskliProvider}` : "",
      ``,
      `RPA Provizyon Sistemi`,
    ]
      .filter(Boolean)
      .join("\n");
  },

  sistemDurumu: (data) =>
    [
      `🖥 *Sistem Durumu*`,
      `📅 ${new Date().toLocaleString("tr-TR")}`,
      `${"─".repeat(28)}`,
      ``,
      `${data.durumOk ? "🟢" : "🔴"} Sistem: *${data.durumOk ? "ÇALIŞIYOR" : "SORUN VAR"}*`,
      `Uptime: *${data.uptime || "—"}*`,
      `RAM: *${data.ram || "—"}*`,
      ``,
      `Aktif Worker: *${data.workers || 0} / ${data.maxWorkers || 0}*`,
      `Bekleyen: *${data.bekleyen || 0}*`,
      `Dead Jobs: *${data.deadJobs || 0}*`,
      ``,
      `Bugünkü Toplam: *${data.bugunToplam || 0}*`,
      `Bugünkü Onay: *${data.bugunOnay || 0}*`,
      `Bugünkü Red: *${data.bugunRed || 0}*`,
      ``,
      `AI Model v${data.modelVersiyon || 1} — Doğruluk: %${data.modelDogruluk || "—"}`,
    ].join("\n"),

  sonIslemler: (items) => {
    if (!items || items.length === 0) {
      return "📋 *Son İşlemler*\n\nHenüz işlem kaydı bulunmuyor.";
    }

    const satrilar = items.map((item, i) => {
      const emoji = String(item.sonuc || "").includes("ONAY")
        ? "✅"
        : String(item.sonuc || "").includes("RED")
        ? "❌"
        : "⚠️";
      const tc = "*******" + String(item.tc || "").slice(-4);
      const sure = item.elapsedMs ? (item.elapsedMs / 1000).toFixed(1) + "s" : "—";
      const zaman = item.time ? new Date(item.time).toLocaleTimeString("tr-TR") : "";
      return `${i + 1}. ${emoji} ${zaman} | ${tc} | ${item.islem_kodu || "-"} | ${sure}`;
    });

    return [
      `📋 *Son ${items.length} İşlem*`,
      `${"─".repeat(28)}`,
      ...satrilar,
      `${"─".repeat(28)}`,
      `📅 ${new Date().toLocaleString("tr-TR")}`,
    ].join("\n");
  },

  yardimMenusu: () =>
    [
      `📖 *Komut Listesi*`,
      `${"─".repeat(28)}`,
      ``,
      `*menü* — Ana menü`,
      `*randevu* — Randevu al`,
      `*provizyon* — Provizyon sorgula`,
      `*bilgi* — Hasta bilgisi`,
      `*durum* — Sistem durumu`,
      `*ozet* — Günlük özet`,
      `*son* — Son işlemler`,
      `*risk* — Riskli işlemler`,
      `*yardim* — Yardım`,
      ``,
      `Komutları istediğiniz zaman yazabilirsiniz.`,
    ].join("\n"),

  riskliIslemler: (items) => {
    if (!items || items.length === 0) {
      return "🎯 *Riskli İşlemler*\n\nŞu an yüksek riskli işlem bulunmuyor.";
    }

    const satirlar = items.map((item, i) => {
      const riskPct = Math.round((item.risk || 0) * 100);
      const riskEmoji = riskPct >= 70 ? "🔴" : riskPct >= 40 ? "🟡" : "🟢";
      return `${i + 1}. ${riskEmoji} %${riskPct} | ${item.islem_kodu || "-"} | ${item.provider || "-"}`;
    });

    return [
      `🎯 *En Riskli İşlemler*`,
      `${"─".repeat(28)}`,
      ...satirlar,
      `${"─".repeat(28)}`,
      `Yüksek riskli işlemler AI tarafından otomatik incelenir.`,
    ].join("\n");
  },

  kritikUyari: (data) =>
    [
      `🚨 *KRİTİK UYARI*`,
      ``,
      `${data.mesaj}`,
      ``,
      `Bileşen: *${data.bilesen || "Sistem"}*`,
      `Zaman: *${new Date().toLocaleString("tr-TR")}*`,
      data.detay ? `Detay: ${data.detay}` : "",
      ``,
      `Lütfen sistemi kontrol edin.`,
    ]
      .filter(Boolean)
      .join("\n"),

  operatorMenu: () => ({
    body: "🏥 *Operatör Menüsü*\nBir işlem seçin:",
    buttons: [
      { id: "op_durum", title: "Durum" },
      { id: "op_ozet", title: "Günlük Özet" },
      { id: "op_son", title: "Son İşlemler" },
    ],
  }),
};

module.exports = MESAJLAR;