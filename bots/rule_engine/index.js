/**
 * Deterministik Kural Motoru
 *
 * Tüm kuralları sırayla değerlendirir.
 * Çıktı: hangi kurallar tetiklendi, toplam risk etkisi, açıklamalar.
 * Black-box değil — her karar izlenebilir.
 */
const { KURAL_TANIMLARI } = require("./rules");

/**
 * @typedef {Object} KuralSonuc
 * @property {string}  kuralId     - "KURAL-001"
 * @property {string}  kuralAdi    - "Yüksek riskli SUT kodu"
 * @property {string}  kategori    - "islem" | "klinik" | "belge" | "yas" | "not" | "kombinasyon"
 * @property {number}  riskEtkisi  - 0.30
 * @property {string}  aciklama    - İnsan-okunur açıklama
 * @property {string}  oneri       - Ne yapılmalı
 */

/**
 * Tüm kuralları verilen veri üzerinde değerlendirir.
 *
 * @param {Object} veri
 * @param {string} veri.islemKodu   - SUT kodu
 * @param {string} veri.doktorNotu  - Doktor notu
 * @param {number} veri.hastaYas    - Hasta yaşı
 * @returns {{ tetiklenenler: KuralSonuc[], toplamRisk: number, kategoriOzeti: Object }}
 */
function kurallariDegerlendir(veri) {
  const tetiklenenler = [];

  for (const kural of KURAL_TANIMLARI) {
    try {
      if (kural.kosul(veri)) {
        tetiklenenler.push({
          kuralId: kural.id,
          kuralAdi: kural.ad,
          kategori: kural.kategori,
          riskEtkisi: kural.riskEtkisi,
          aciklama: kural.aciklama(veri),
          oneri: kural.oneri(veri),
        });
      }
    } catch {
      // Kural değerlendirmesinde hata olursa atla, sistemi kırmasın
    }
  }

  // Toplam riski hesapla (1.0 ile sınırla)
  const toplamRisk = Math.min(
    1.0,
    tetiklenenler.reduce((acc, k) => acc + k.riskEtkisi, 0)
  );

  // Kategori bazlı özet
  const kategoriOzeti = {};
  for (const t of tetiklenenler) {
    if (!kategoriOzeti[t.kategori]) {
      kategoriOzeti[t.kategori] = { sayisi: 0, toplamRisk: 0, kurallar: [] };
    }
    kategoriOzeti[t.kategori].sayisi += 1;
    kategoriOzeti[t.kategori].toplamRisk += t.riskEtkisi;
    kategoriOzeti[t.kategori].kurallar.push(t.kuralId);
  }

  return {
    tetiklenenler,
    tetiklenenSayisi: tetiklenenler.length,
    toplamRisk,
    kategoriOzeti,
    kuralSayisi: KURAL_TANIMLARI.length,
  };
}

/**
 * Belirli bir kural ID'sinin detayını döndürür.
 */
function kuralDetayi(kuralId) {
  return KURAL_TANIMLARI.find((k) => k.id === kuralId) || null;
}

/**
 * Tüm kuralları listeler (yönetim paneli için).
 */
function tumKurallar() {
  return KURAL_TANIMLARI.map((k) => ({
    id: k.id,
    ad: k.ad,
    kategori: k.kategori,
    riskEtkisi: k.riskEtkisi,
  }));
}

module.exports = { kurallariDegerlendir, kuralDetayi, tumKurallar };
