/**
 * KVKK ihlal tarayıcısı
 * Sistemdeki işlemleri tarayıp risk tespiti yapar
 */

const KVKK_KURALLARI = [
  {
    kod: "KVKK-001",
    aciklama: "TC Kimlik No açık metin olarak loglanıyor",
    kontrol: (log) => log.tc && !log.tc.includes("*"),
    risk: "YÜKSEK",
    oneri: "TC numaralarını loglarda maskeleyin (*******1234)",
  },
  {
    kod: "KVKK-002",
    aciklama: "Hasta verisi 3. taraf sisteme iletildi",
    kontrol: (log) => log.provider && log.sonuc,
    risk: "ORTA",
    oneri: "3. taraf veri aktarımı için açık rıza alındığını doğrulayın",
  },
  {
    kod: "KVKK-003",
    aciklama: "Veri saklama süresi kontrolü gerekiyor",
    kontrol: (log) => {
      const tarih = new Date(log.time);
      const fark  = (Date.now() - tarih) / (1000 * 60 * 60 * 24);
      return fark > 180; // 6 aydan eski kayıtlar
    },
    risk: "ORTA",
    oneri: "6 aydan eski hasta verileri anonimleştirilmeli veya silinmeli",
  },
  {
    kod: "KVKK-004",
    aciklama: "Hatalı işlem kaydında kişisel veri bulunuyor",
    kontrol: (log) => log.hata && log.tc,
    risk: "YÜKSEK",
    oneri: "Hata loglarındaki kişisel veriler temizlenmeli",
  },
];

function kvkkTara(kayitlar) {
  const ihlaller = [];

  for (const kayit of kayitlar) {
    for (const kural of KVKK_KURALLARI) {
      try {
        if (kural.kontrol(kayit)) {
          ihlaller.push({
            kural_kodu: kural.kod,
            aciklama:   kural.aciklama,
            risk:       kural.risk,
            oneri:      kural.oneri,
            kayit_id:   kayit.id,
            tc:         kayit.tc ? "*".repeat(7) + String(kayit.tc).slice(-4) : null,
            zaman:      kayit.time,
          });
        }
      } catch {}
    }
  }

  return ihlaller;
}

function riskOzeti(ihlaller) {
  const yuksek = ihlaller.filter(i => i.risk === "YÜKSEK").length;
  const orta   = ihlaller.filter(i => i.risk === "ORTA").length;
  const dusuk  = ihlaller.filter(i => i.risk === "DÜŞÜK").length;

  const seviye = yuksek > 0 ? "YÜKSEK" : orta > 0 ? "ORTA" : "DÜŞÜK";

  return { yuksek, orta, dusuk, seviye, toplam: ihlaller.length };
}

module.exports = { kvkkTara, riskOzeti };