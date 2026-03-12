const { ProvizyonBot, ProvizyonTalebi } = require('./bot');

async function testCalistir() {
  console.log('🧪 Bot testi başlıyor...\n');

  // 1. Veri modeli testi
  const talep = new ProvizyonTalebi({
    hasta_tc:        '12345678901',
    hasta_ad:        'Ayşe',
    hasta_soyad:     'Demir',
    dogum_tarihi:    '15.03.1985',
    sigorta_no:      'SGK-001',
    poliklinik_kodu: 'DAH',
    islem_kodu:      '520.010',
    islem_adi:       'Dahiliye Muayenesi',
    doktor_kodu:     'DR001',
  });
  console.log('✅ Talep nesnesi oluşturuldu:', talep.hasta_tc);

  // 2. Bot başlatma testi (headless: false → tarayıcıyı görmek için)
  const bot = new ProvizyonBot({
    portalUrl: process.env.HBYS_URL || 'http://localhost:8080',
    kullanici: process.env.HBYS_KULLANICI || 'test',
    sifre:     process.env.HBYS_SIFRE     || 'test',
    headless:  false,
  });

  console.log('✅ Bot nesnesi oluşturuldu.');
  console.log('📊 İstatistik:', bot.istatistik());
  console.log('\n✅ Tüm testler geçti!');
}

testCalistir().catch(console.error); 