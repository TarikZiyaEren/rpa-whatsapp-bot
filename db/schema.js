function createTables(db) {
    db.run(`
    CREATE TABLE IF NOT EXISTS wa_sessions (
      id TEXT PRIMARY KEY,
      telefon TEXT NOT NULL,
      hospital_id TEXT,
      adim TEXT NOT NULL,
      veri_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
 
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_sessions_telefon
    ON wa_sessions(telefon);
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS processed_webhooks (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL UNIQUE,
      telefon TEXT,
      hospital_id TEXT,
      processed_at TEXT NOT NULL
    );
  `);
  
    db.run(`
    CREATE TABLE IF NOT EXISTS hospitals (
      id TEXT PRIMARY KEY,
      ad TEXT NOT NULL,
      kod TEXT UNIQUE NOT NULL,
      aktif INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      hospital_id TEXT,
      time TEXT NOT NULL,
      tc TEXT NOT NULL,
      ad TEXT NOT NULL,
      dogum TEXT NOT NULL,
      provider TEXT,
      sonuc TEXT,
      hata TEXT,
      elapsedMs INTEGER,
      needsHuman INTEGER DEFAULT 0,
      islem_kodu TEXT,
      islem_adi TEXT,
      hasta_yas INTEGER,
      ai_risk REAL,
      ai_seviye TEXT,
      red_nedeni TEXT,
      eksik_belgeler_json TEXT,
      retry_kullanildi INTEGER DEFAULT 0,
      retry_basarili INTEGER DEFAULT 0,
      retry_yeni_kod TEXT,
      takip_no TEXT,
      provider_response_code TEXT,
      provider_response_message TEXT,
      doktor_notu TEXT,
      icd_kodu TEXT,
      sut_oneri_json TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      hospital_id TEXT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator'
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      hospital_id TEXT,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      enc_username TEXT NOT NULL,
      enc_password TEXT NOT NULL,
      UNIQUE(user_id, provider)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS kvkk_log (
      id TEXT PRIMARY KEY,
      hospital_id TEXT,
      time TEXT NOT NULL,
      tip TEXT NOT NULL,
      aciklama TEXT,
      risk_seviyesi TEXT,
      tc TEXT,
      islem TEXT,
      durum TEXT DEFAULT 'beklemede'
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS randevular (
      id TEXT PRIMARY KEY,
      hospital_id TEXT,
      telefon TEXT NOT NULL,
      tc TEXT,
      ad TEXT NOT NULL,
      poliklinik TEXT NOT NULL,
      tarih TEXT NOT NULL,
      saat TEXT NOT NULL,
      durum TEXT NOT NULL DEFAULT 'aktif',
      olusturma_zamani TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      hospital_id TEXT,
      zaman TEXT NOT NULL,
      kullanici TEXT,
      ip TEXT,
      islem TEXT NOT NULL,
      detay TEXT,
      kategori TEXT,
      onem_seviyesi TEXT,
      meta_json TEXT,
      sure_ms INTEGER
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS review_queue (
      id TEXT PRIMARY KEY,
      hospital_id TEXT,
      job_id TEXT,
      durum TEXT NOT NULL DEFAULT 'beklemede',
      oncelik TEXT DEFAULT 'normal',
      tc TEXT NOT NULL,
      hasta_ad TEXT,
      hasta_dogum TEXT,
      provider TEXT,
      islem_kodu TEXT,
      islem_adi TEXT,
      doktor_notu TEXT,
      ai_risk REAL,
      ai_seviye TEXT,
      aciklama_ozet TEXT,
      aciklama_kartlar TEXT,
      eksik_belgeler_json TEXT,
      kural_analizi_json TEXT,
      red_cozum_json TEXT,
      rapor_json TEXT,
      payload_json TEXT,
      olusturan_kullanici TEXT,
      olusturma_zamani TEXT NOT NULL,
      islem_yapan_kullanici TEXT,
      islem_zamani TEXT,
      islem_notu TEXT,
      islem_tipi TEXT,
      sonuc TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ai_feedback (
      id TEXT PRIMARY KEY,
      hospital_id TEXT,
      time TEXT NOT NULL,
      tc TEXT,
      hasta_ad TEXT,
      hasta_yas INTEGER,
      islem_kodu TEXT,
      islem_adi TEXT,
      doktor_notu TEXT,
      ai_risk REAL,
      ai_seviye TEXT,
      ai_oneri TEXT,
      sonuc TEXT,
      hata_kodu TEXT,
      hata_mesaji TEXT,
      red_nedeni TEXT,
      eksik_belgeler_json TEXT,
      retry_kullanildi INTEGER DEFAULT 0,
      retry_yeni_kod TEXT,
      retry_basarili INTEGER DEFAULT 0,
      provider TEXT
    );
  `);

  // ── Tenant-Aware Öğrenen Model Tabloları ──────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS tenant_models (
      hospital_id TEXT PRIMARY KEY,
      agirliklar_json TEXT NOT NULL,
      meta_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tenant_procedure_stats (
      hospital_id TEXT NOT NULL,
      islem_kodu TEXT NOT NULL,
      toplam INTEGER DEFAULT 0,
      red INTEGER DEFAULT 0,
      onay INTEGER DEFAULT 0,
      red_orani REAL DEFAULT 0,
      son_guncelleme TEXT,
      PRIMARY KEY (hospital_id, islem_kodu)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tenant_provider_stats (
      hospital_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      toplam INTEGER DEFAULT 0,
      red INTEGER DEFAULT 0,
      onay INTEGER DEFAULT 0,
      red_orani REAL DEFAULT 0,
      son_guncelleme TEXT,
      PRIMARY KEY (hospital_id, provider)
    );
  `);

  // ── Hata İzleme Tablosu ─────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS error_log (
      id TEXT PRIMARY KEY,
      hospital_id TEXT,
      kategori TEXT NOT NULL,
      mesaj TEXT NOT NULL,
      stack TEXT,
      context_json TEXT,
      kaynak TEXT,
      kullanici TEXT,
      url TEXT,
      method TEXT,
      ilk_olusum TEXT NOT NULL,
      son_olusum TEXT NOT NULL,
      tekrar_sayisi INTEGER DEFAULT 1,
      cozuldu INTEGER DEFAULT 0
    );
  `);

  // ── Belge Versiyonlama Tablosu ──────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      hospital_id TEXT NOT NULL,
      belge_no TEXT NOT NULL,
      versiyon INTEGER NOT NULL DEFAULT 1,
      belge_tipi TEXT,
      icerik_hash TEXT NOT NULL,
      icerik_json TEXT,
      olusturan_kullanici TEXT,
      olusturma_zamani TEXT NOT NULL,
      degisiklik_notu TEXT,
      meta_json TEXT
    );
  `);
}

module.exports = {
  createTables,
};