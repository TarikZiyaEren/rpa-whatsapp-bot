/**
 * KVKK Aydınlatma metni üretici
 */

function aydinlatmaMetniUret(hasta) {
  const tarih = new Date().toLocaleDateString("tr-TR");

  return {
    baslik: "KİŞİSEL VERİLERİN KORUNMASI KANUNU AYDINLATMA METNİ",
    metin: `
${tarih} tarihinde hazırlanmıştır.

VERİ SORUMLUSU
Hastanemiz, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında veri sorumlusu sıfatıyla hareket etmektedir.

İŞLENEN KİŞİSEL VERİLER
Sayın ${hasta.ad || "Hasta"},

Aşağıdaki kişisel verileriniz işlenmektedir:
- TC Kimlik Numarası
- Ad, Soyad, Doğum Tarihi
- Sağlık ve Sigorta Bilgileri
- İletişim Bilgileri

VERİLERİN İŞLENME AMACI
- Sağlık hizmetlerinin yürütülmesi
- Sigorta provizyon işlemlerinin gerçekleştirilmesi
- Yasal yükümlülüklerin yerine getirilmesi

VERİLERİN AKTARILDIĞI TARAFLAR
- Sigorta şirketleri (SGK, özel sigortalar)
- Sağlık Bakanlığı sistemleri
- Yasal zorunluluk halinde yetkili kurum ve kuruluşlar

SAKLAMA SÜRESİ
Kişisel verileriniz, yasal saklama süreleri (tıbbi kayıtlar için 20 yıl) boyunca saklanacaktır.

HAKLARINIZ (KVKK Madde 11)
- Verilerinizin işlenip işlenmediğini öğrenme
- İşlenen veriler hakkında bilgi talep etme
- Verilerin düzeltilmesini isteme
- Verilerin silinmesini/yok edilmesini isteme
- Veri işlemeye itiraz etme

İletişim: kvkk@hastane.com.tr
    `.trim(),
    tarih,
    hasta,
  };
}

function silmeTalebiOlustur(tc, ad, sebep) {
  return {
    id: `SIL-${Date.now()}`,
    tc: "*".repeat(7) + String(tc).slice(-4),
    ad,
    sebep: sebep || "Hasta talebi",
    tarih: new Date().toISOString(),
    durum: "beklemede",
    islemler: [
      "history tablosundan TC anonimleştirme",
      "kvkk_log tablosundan kayıt silme",
      "screenshots klasöründen ilgili dosyaları silme",
    ],
  };
}

module.exports = { aydinlatmaMetniUret, silmeTalebiOlustur };