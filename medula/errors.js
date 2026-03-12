const MEDULA_HATALARI = {
  "MEDULA-001": "Geçersiz TC Kimlik Numarası",
  "MEDULA-002": "TC formatı hatalı",
  "MEDULA-102": "Hasta provizyon kapsamı dışında",
  "MEDULA-208": "İşlem MEDULA kurallarına uygun değil",
  "MEDULA-500": "Servis geçici olarak kullanılamıyor",
};

function medulaHataAcikla(kod) {
  return MEDULA_HATALARI[kod] || "Bilinmeyen MEDULA hatası";
}

module.exports = { MEDULA_HATALARI, medulaHataAcikla };