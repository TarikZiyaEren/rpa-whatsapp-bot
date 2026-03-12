/**
 * HBYS Entegrasyon Katmanı
 *
 * Gerçek HBYS sistemleri genellikle:
 *   - HL7 v2 mesajlaşma (MLLP protokolü)
 *   - SOAP/REST API
 *   - Doğrudan DB bağlantısı (Oracle/MSSQL)
 * üzerinden çalışır.
 *
 * Bu katman bir adaptör deseni uygular:
 *   - Gerçek HBYS varsa → gerçek API çağrısı
 *   - Yoksa → fake_portal'a düşer (mevcut davranış korunur)
 */

const axios = require("axios");

// ── Konfigürasyon ─────────────────────────────────────────────────────
const HBYS_TIP = process.env.HBYS_TIP || "fake"; // fake | rest | soap
const HBYS_URL = process.env.HBYS_URL || `http://127.0.0.1:${process.env.FAKE_PORTAL_PORT || 4000}`;
const HBYS_API_KEY = process.env.HBYS_API_KEY || null;
const HBYS_TIMEOUT = Number(process.env.HBYS_TIMEOUT_MS) || 15000;

// ── Adaptör Seçici ────────────────────────────────────────────────────
async function provizyonSorgula(hasta, islem, credentials, progress = () => {}) {
  progress(`[HBYS] Tip: ${HBYS_TIP} | URL: ${HBYS_URL}`);

  switch (HBYS_TIP) {
    case "rest":  return restAdaptor(hasta, islem, credentials, progress);
    case "soap":  return soapAdaptor(hasta, islem, credentials, progress);
    case "fake":
    default:      return fakeAdaptor(hasta, islem, credentials, progress);
  }
}

async function hastaKayitGetir(tc, progress = () => {}) {
  progress(`[HBYS] Hasta kaydı çekiliyor: TC ${tc.slice(0,3)}****`);

  switch (HBYS_TIP) {
    case "rest":  return restHastaGetir(tc, progress);
    case "fake":
    default:      return fakeHastaGetir(tc, progress);
  }
}

async function randevuKaydet(randevu, progress = () => {}) {
  progress(`[HBYS] Randevu kaydediliyor: ${randevu.poliklinik} ${randevu.tarih}`);

  switch (HBYS_TIP) {
    case "rest":  return restRandevuKaydet(randevu, progress);
    case "fake":
    default:      return fakeRandevuKaydet(randevu, progress);
  }
}

// ── FAKE Adaptör (mevcut fake_portal.js ile çalışır) ──────────────────
async function fakeAdaptor(hasta, islem, credentials, progress) {
  progress("[HBYS/Fake] Fake portal'a bağlanılıyor...");

  // Fake portal'da oturum aç
  const loginRes = await axios.post(
    `${HBYS_URL}/login`,
    new URLSearchParams({
      username: credentials.username,
      password: credentials.password,
    }),
    {
      maxRedirects: 0,
      validateStatus: s => s < 400,
      timeout: HBYS_TIMEOUT,
    }
  );

  const cookie = loginRes.headers["set-cookie"]?.[0] || "";
  if (!cookie.includes("auth=1")) {
    throw new Error("HBYS girişi başarısız — credential hatalı olabilir.");
  }

  progress("[HBYS/Fake] Oturum açıldı, provizyon gönderiliyor...");

  const provRes = await axios.post(
    `${HBYS_URL}/provizyon`,
    new URLSearchParams({
      tc:   hasta.tc,
      ad:   hasta.ad,
      dogum: hasta.dogum,
    }),
    {
      headers: { Cookie: cookie },
      timeout: HBYS_TIMEOUT,
    }
  );

  // Yanıtı parse et
  const html = provRes.data || "";
  if (html.includes("Durum: ONAY")) {
    progress("[HBYS/Fake] ✅ Provizyon ONAYLANDI");
    return { durum: "ONAY", mesaj: "Provizyon onaylandı.", ham: html };
  } else if (html.includes("Durum: RED")) {
    progress("[HBYS/Fake] ❌ Provizyon REDDEDİLDİ");
    return { durum: "RED", mesaj: "Provizyon reddedildi.", ham: html };
  }

  throw new Error("HBYS yanıtı tanımlanamadı.");
}

async function fakeHastaGetir(tc, progress) {
  progress("[HBYS/Fake] Fake hasta kaydı döndürülüyor...");
  // Fake FHIR ile aynı mantık — demo verisi
  return {
    tc,
    ad:    "Demo Hasta",
    dogum: "1990-01-01",
    cinsiyet: "E",
    kan_grubu: "A+",
  };
}

async function fakeRandevuKaydet(randevu, progress) {
  progress("[HBYS/Fake] Randevu fake sisteme kaydedildi (gerçek HBYS bağlantısı yok).");
  return { basarili: true, randevuNo: `DEMO-${Date.now()}` };
}

// ── REST Adaptör (gerçek HBYS REST API için) ──────────────────────────
async function restAdaptor(hasta, islem, credentials, progress) {
  progress("[HBYS/REST] REST API çağrısı yapılıyor...");

  const headers = {
    "Content-Type": "application/json",
    ...(HBYS_API_KEY ? { "X-API-Key": HBYS_API_KEY } : {}),
  };

  // Token al
  let token = null;
  try {
    const authRes = await axios.post(
      `${HBYS_URL}/auth/token`,
      { username: credentials.username, password: credentials.password },
      { headers, timeout: HBYS_TIMEOUT }
    );
    token = authRes.data?.token || authRes.data?.access_token;
    progress("[HBYS/REST] Token alındı.");
  } catch (e) {
    throw new Error(`HBYS token alınamadı: ${e.message}`);
  }

  // Provizyon isteği
  const provRes = await axios.post(
    `${HBYS_URL}/api/provizyon`,
    {
      tc_kimlik_no: hasta.tc,
      hasta_adi:    hasta.ad,
      dogum_tarihi: hasta.dogum,
      islem_kodu:   islem?.kodu,
      islem_adi:    islem?.adi,
    },
    {
      headers: { ...headers, Authorization: `Bearer ${token}` },
      timeout: HBYS_TIMEOUT,
    }
  );

  const data = provRes.data;
  const durum = data?.durum || data?.status || data?.sonuc;

  if (!durum) throw new Error("HBYS REST yanıtı beklenmedik formatta.");

  const onay = String(durum).toUpperCase().includes("ONAY") ||
               String(durum).toUpperCase().includes("APPROVED") ||
               data?.approved === true;

  progress(`[HBYS/REST] Sonuç: ${onay ? "ONAY" : "RED"}`);
  return {
    durum:     onay ? "ONAY" : "RED",
    mesaj:     data?.mesaj || data?.message || (onay ? "Onaylandı" : "Reddedildi"),
    referansNo: data?.referans_no || data?.reference_id || null,
    ham:        data,
  };
}

async function restHastaGetir(tc, progress) {
  progress("[HBYS/REST] Hasta kaydı REST'ten çekiliyor...");
  const headers = HBYS_API_KEY ? { "X-API-Key": HBYS_API_KEY } : {};
  const res = await axios.get(`${HBYS_URL}/api/hasta/${tc}`, {
    headers,
    timeout: HBYS_TIMEOUT,
  });
  return res.data;
}

async function restRandevuKaydet(randevu, progress) {
  progress("[HBYS/REST] Randevu REST'e kaydediliyor...");
  const headers = {
    "Content-Type": "application/json",
    ...(HBYS_API_KEY ? { "X-API-Key": HBYS_API_KEY } : {}),
  };
  const res = await axios.post(`${HBYS_URL}/api/randevu`, randevu, {
    headers,
    timeout: HBYS_TIMEOUT,
  });
  return res.data;
}

// ── SOAP Adaptör (eski HBYS sistemleri için iskelet) ──────────────────
async function soapAdaptor(hasta, islem, credentials, progress) {
  progress("[HBYS/SOAP] SOAP isteği hazırlanıyor...");

  // Çoğu Türk HBYS sistemi (Probel, Hitit, Enlil) SOAP kullanır
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <AuthHeader>
      <Username>${credentials.username}</Username>
      <Password>${credentials.password}</Password>
    </AuthHeader>
  </soap:Header>
  <soap:Body>
    <ProvizyonSorgula>
      <TCKimlikNo>${hasta.tc}</TCKimlikNo>
      <HastaAdi>${hasta.ad}</HastaAdi>
      <DogumTarihi>${hasta.dogum}</DogumTarihi>
      <IslemKodu>${islem?.kodu || ""}</IslemKodu>
    </ProvizyonSorgula>
  </soap:Body>
</soap:Envelope>`;

  const res = await axios.post(
    `${HBYS_URL}/HBYSService.asmx`,
    soapBody,
    {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "ProvizyonSorgula",
      },
      timeout: HBYS_TIMEOUT,
    }
  );

  // SOAP yanıtını parse et
  const xml = res.data || "";
  const onay = xml.includes("<Durum>ONAY</Durum>") || xml.includes("<Status>APPROVED</Status>");
  const red  = xml.includes("<Durum>RED</Durum>")  || xml.includes("<Status>REJECTED</Status>");

  if (!onay && !red) throw new Error("SOAP yanıtı tanımlanamadı.");

  progress(`[HBYS/SOAP] Sonuç: ${onay ? "ONAY" : "RED"}`);
  return {
    durum: onay ? "ONAY" : "RED",
    mesaj: onay ? "SOAP provizyon onaylandı." : "SOAP provizyon reddedildi.",
    ham:   xml,
  };
}

// ── Sistem Durumu ─────────────────────────────────────────────────────
async function hbysDurumKontrol() {
  try {
    await axios.get(`${HBYS_URL}/`, { timeout: 3000 });
    return { online: true, tip: HBYS_TIP, url: HBYS_URL };
  } catch {
    return { online: false, tip: HBYS_TIP, url: HBYS_URL };
  }
}

module.exports = {
  provizyonSorgula,
  hastaKayitGetir,
  randevuKaydet,
  hbysDurumKontrol,
};
