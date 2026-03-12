const { waSend, waSendButtons, waSendList } = require("./wa_client");
const MESAJLAR = require("./messages");
const { listHistory } = require("../../repositories/historyRepository");
const {
  addRandevu,
  getAvailableSlots,
} = require("../../repositories/randevuRepository");
const {
  getSession,
  saveSession,
  deleteSession,
} = require("../../repositories/whatsappSessionRepository");

let hastaGetir;
try {
  hastaGetir = require("../klinik_veri/fhir_client").hastaGetir;
} catch {
  hastaGetir = null;
}

const TRIAJ_KURALLARI = [
  { kelimeler: ["göğüs ağrısı", "göğsüm ağrıyor", "kalp ağrısı", "kalp krizi"], acil: true, poliklinik: null, gerekce: "Kardiyak acil olabilir." },
  { kelimeler: ["nefes alamıyorum", "nefes darlığı", "boğuluyorum", "nefes kesiliyor"], acil: true, poliklinik: null, gerekce: "Solunum sıkıntısı acil müdahale gerektirir." },
  { kelimeler: ["bilinç kaybı", "bayıldım", "kendinden geçti", "şuur kaybı"], acil: true, poliklinik: null, gerekce: "Bilinç kaybı acil durumdur." },
  { kelimeler: ["felç", "inmem var", "kolum tutmuyor", "konuşamıyorum", "yüzüm çarpıldı"], acil: true, poliklinik: null, gerekce: "İnme belirtisi — dakikalar kritik." },
  { kelimeler: ["çok fazla kan", "aşırı kanama", "kanaması durmuyor"], acil: true, poliklinik: null, gerekce: "Aşırı kanama acil müdahale gerektirir." },

  { kelimeler: ["kalp", "çarpıntı", "tansiyon", "hipertansiyon", "göğüs sıkışması"], acil: false, poliklinik: "Kardiyoloji", gerekce: "Kalp ve damar şikayetleri kardiyoloji alanındadır." },
  { kelimeler: ["bel ağrısı", "diz ağrısı", "eklem", "kırık", "burkulma", "boyun ağrısı"], acil: false, poliklinik: "Ortopedi", gerekce: "Kas ve iskelet sistemi şikayetleri ortopedi alanındadır." },
  { kelimeler: ["baş ağrısı", "migren", "uyuşma", "titreme", "epilepsi", "sara"], acil: false, poliklinik: "Nöroloji", gerekce: "Sinir sistemi şikayetleri nöroloji alanındadır." },
  { kelimeler: ["göz", "gözüm yanıyor", "görme", "bulanık görüyorum"], acil: false, poliklinik: "Göz", gerekce: "Göz şikayetleri göz hastalıkları alanındadır." },
  { kelimeler: ["ateş", "grip", "öksürük", "nezle", "boğaz ağrısı", "halsizlik", "mide", "bulantı", "kusma", "ishal", "karın ağrısı", "diyabet", "şeker"], acil: false, poliklinik: "Dahiliye", gerekce: "Genel şikayetler dahiliye alanındadır." },
];

function normalizeIncomingMessage(mesaj) {
  if (mesaj?.type === "text") {
    return {
      id: mesaj.id,
      type: "text",
      value: String(mesaj?.text?.body || "").trim(),
    };
  }

  if (mesaj?.type === "interactive") {
    if (mesaj?.interactive?.button_reply) {
      return {
        id: mesaj.id,
        type: "button",
        value: String(mesaj.interactive.button_reply.id || "").trim(),
        title: String(mesaj.interactive.button_reply.title || "").trim(),
      };
    }

    if (mesaj?.interactive?.list_reply) {
      return {
        id: mesaj.id,
        type: "list",
        value: String(mesaj.interactive.list_reply.id || "").trim(),
        title: String(mesaj.interactive.list_reply.title || "").trim(),
      };
    }
  }

  return {
    id: mesaj?.id || null,
    type: "unknown",
    value: "",
  };
}

function triajDegerlendir(metin) {
  const kucuk = String(metin || "").toLowerCase();

  for (const kural of TRIAJ_KURALLARI) {
    if (kural.kelimeler.some((k) => kucuk.includes(k))) {
      return {
        acil: kural.acil,
        poliklinik: kural.poliklinik,
        gerekce: kural.gerekce,
        semptom: metin,
      };
    }
  }

  return null;
}

function parseTrDate(dateText) {
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(dateText)) return null;

  const [gun, ay, yil] = dateText.split(".");
  const d = new Date(Number(yil), Number(ay) - 1, Number(gun));

  if (
    Number.isNaN(d.getTime()) ||
    d.getFullYear() !== Number(yil) ||
    d.getMonth() !== Number(ay) - 1 ||
    d.getDate() !== Number(gun)
  ) {
    return null;
  }

  d.setHours(0, 0, 0, 0);
  return d;
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function guvenliWaSend(telefon, body) {
  console.log("[WA][FLOW] Text mesaj gönderiliyor:", { telefon, body });
  return waSend(telefon, body);
}

async function guvenliWaSendButtons(telefon, body, buttons) {
  console.log("[WA][FLOW] Button mesaj gönderiliyor:", {
    telefon,
    body,
    buttons,
  });
  return waSendButtons(telefon, body, buttons);
}

async function guvenliWaSendList(telefon, body, sections) {
  console.log("[WA][FLOW] List mesaj gönderiliyor:", {
    telefon,
    body,
    sectionsCount: Array.isArray(sections) ? sections.length : 0,
  });
  return waSendList(telefon, body, sections);
}

async function oturumKaydet(telefon, hospitalId, adim, veri = {}) {
  console.log("[WA][FLOW] Oturum kaydediliyor:", {
    telefon,
    hospitalId,
    adim,
    veri,
  });

  await saveSession(telefon, hospitalId, adim, veri);
}

async function oturumSil(telefon) {
  console.log("[WA][FLOW] Oturum siliniyor:", { telefon });
  await deleteSession(telefon);
}

async function hosgeldinGoster(telefon, hospitalId) {
  console.log("[WA][FLOW] Hoşgeldin akışı çalıştı:", { telefon, hospitalId });
  await guvenliWaSend(telefon, MESAJLAR.hosgeldin());
  return anaMenuGoster(telefon, hospitalId);
}

async function anaMenuGoster(telefon, hospitalId) {
  await oturumKaydet(telefon, hospitalId, "ana_menu", {});
  const m = MESAJLAR.anaMenu();
  return guvenliWaSendButtons(telefon, m.body, m.buttons);
}

async function mesajIshle(telefon, mesaj, context = {}) {
  const hospitalId = context?.hospitalId || null;
  const incoming = normalizeIncomingMessage(mesaj);
  const metin = String(incoming.value || "").trim().toLowerCase();

  console.log("[WA][FLOW] mesajIshle başladı:", {
    telefon,
    hospitalId,
    mesajType: incoming.type,
    metin,
    mesajId: incoming.id,
  });

  if (!telefon) {
    console.warn("[WA][FLOW] Telefon boş geldi, mesaj atlandı");
    return;
  }

  if (["menü", "menu", "ana menü", "merhaba", "selam", "başla", "start"].includes(metin)) {
    console.log("[WA][FLOW] Global menü/başlangıç komutu algılandı");
    return anaMenuGoster(telefon, hospitalId);
  }

  let oturum = null;
  try {
    oturum = await getSession(telefon);
  } catch (e) {
    console.error("[WA][FLOW] getSession hatası:", e.message);
    console.error(e.stack);
    oturum = null;
  }

  if (!oturum) {
    console.log("[WA][FLOW] Aktif oturum yok, hoşgeldin gösterilecek");
    return hosgeldinGoster(telefon, hospitalId);
  }

  const aktifHospitalId = oturum.hospitalId || hospitalId || null;

  console.log("[WA][FLOW] Aktif oturum bulundu:", {
    telefon,
    aktifHospitalId,
    adim: oturum.adim,
    veri: oturum.veri,
  });

  switch (oturum.adim) {
    case "ana_menu":
      return anaMenuSecim(telefon, metin, aktifHospitalId);

    case "triaj_bekle":
      return triajIsle(telefon, incoming, oturum.veri, aktifHospitalId);

    case "triaj_onay_bekle":
      return triajOnayIsle(telefon, metin, oturum.veri, aktifHospitalId);

    case "tc_bekle":
      return tcIsle(telefon, metin, oturum.veri, aktifHospitalId);

    case "dogum_bekle":
      return dogumIsle(telefon, metin, oturum.veri, aktifHospitalId);

    case "poliklinik_bekle":
      return poliklinikIsle(telefon, metin, oturum.veri, aktifHospitalId);

    case "tarih_bekle":
      return tarihIsle(telefon, metin, oturum.veri, aktifHospitalId);

    default:
      console.warn("[WA][FLOW] Bilinmeyen oturum adımı, akış sıfırlanıyor:", oturum.adim);
      return hosgeldinGoster(telefon, aktifHospitalId);
  }
}

async function anaMenuSecim(telefon, secim, hospitalId) {
  console.log("[WA][FLOW] Ana menü seçimi:", { telefon, secim, hospitalId });

  switch (secim) {
    case "menu_randevu":
      await oturumKaydet(telefon, hospitalId, "triaj_bekle", { islem: "randevu" });
      return guvenliWaSend(telefon, MESAJLAR.triajSor());

    case "menu_provizyon":
      await oturumKaydet(telefon, hospitalId, "tc_bekle", { islem: "provizyon" });
      return guvenliWaSend(telefon, MESAJLAR.tcSor());

    case "menu_bilgi":
      await oturumKaydet(telefon, hospitalId, "tc_bekle", { islem: "bilgi" });
      return guvenliWaSend(telefon, MESAJLAR.tcSor());

    default:
      return guvenliWaSend(telefon, MESAJLAR.anlamadim());
  }
}

async function triajIsle(telefon, incoming, veri, hospitalId) {
  const hamMetin = String(incoming.value || "").trim();

  console.log("[WA][FLOW] Triaj işlendi:", {
    telefon,
    hamMetin,
    hospitalId,
    veri,
  });

  if (hamMetin.toLowerCase() === "randevu") {
    await oturumKaydet(telefon, hospitalId, "tc_bekle", { islem: "randevu" });
    return guvenliWaSend(telefon, MESAJLAR.tcSor());
  }

  const sonuc = triajDegerlendir(hamMetin);

  if (sonuc?.acil) {
    await guvenliWaSend(telefon, MESAJLAR.acilYonlendirme(hamMetin));
    await oturumSil(telefon);
    return;
  }

  if (sonuc?.poliklinik) {
    await oturumKaydet(telefon, hospitalId, "triaj_onay_bekle", {
      ...veri,
      triajPoliklinik: sonuc.poliklinik,
      semptom: hamMetin,
    });

    await guvenliWaSend(telefon, MESAJLAR.triajOneri(sonuc.poliklinik, sonuc.gerekce));
    const m = MESAJLAR.triajOneriButonlar(sonuc.poliklinik);
    return guvenliWaSendButtons(telefon, m.body, m.buttons);
  }

  await oturumKaydet(telefon, hospitalId, "tc_bekle", { islem: "randevu" });
  await guvenliWaSend(telefon, "Şikayetinizi değerlendiremedim, sizi poliklinik seçimine yönlendiriyorum.");
  return guvenliWaSend(telefon, MESAJLAR.tcSor());
}

async function triajOnayIsle(telefon, secim, veri, hospitalId) {
  console.log("[WA][FLOW] Triaj onay işlendi:", {
    telefon,
    secim,
    veri,
    hospitalId,
  });

  switch (secim) {
    case "triaj_evet":
      await oturumKaydet(telefon, hospitalId, "tc_bekle", {
        islem: "randevu",
        triajPoliklinik: veri.triajPoliklinik,
      });
      return guvenliWaSend(telefon, MESAJLAR.tcSor());

    case "triaj_baska":
      await oturumKaydet(telefon, hospitalId, "tc_bekle", { islem: "randevu" });
      return guvenliWaSend(telefon, MESAJLAR.tcSor());

    case "triaj_iptal":
      await oturumSil(telefon);
      return anaMenuGoster(telefon, hospitalId);

    default:
      return guvenliWaSend(telefon, MESAJLAR.anlamadim());
  }
}

async function tcIsle(telefon, metin, veri, hospitalId) {
  console.log("[WA][FLOW] TC adımı:", { telefon, metin, veri, hospitalId });

  if (!/^\d{11}$/.test(metin)) {
    return guvenliWaSend(telefon, "❌ TC numarası 11 haneli rakamlardan oluşmalıdır. Tekrar girin:");
  }

  await oturumKaydet(telefon, hospitalId, "dogum_bekle", {
    ...veri,
    tc: metin,
  });

  return guvenliWaSend(telefon, MESAJLAR.dogumSor());
}

async function dogumIsle(telefon, metin, veri, hospitalId) {
  console.log("[WA][FLOW] Doğum tarihi adımı:", {
    telefon,
    metin,
    veri,
    hospitalId,
  });

  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(metin)) {
    return guvenliWaSend(telefon, "❌ Tarih formatı hatalı. Örnek: 15.03.1985");
  }

  const yeniVeri = { ...veri, dogum: metin };
  let adSoyad = null;

  if (hastaGetir) {
    try {
      const hasta = await hastaGetir(veri.tc);

      if (hasta?.dogum) {
        const [gun, ay, yil] = metin.split(".");
        const girilenDogum = `${yil}-${ay.padStart(2, "0")}-${gun.padStart(2, "0")}`;
        const skipCheck = process.env.WA_SKIP_PATIENT_BIRTHDATE_CHECK === "true";

        if (hasta.dogum !== girilenDogum && !skipCheck) {
          return guvenliWaSend(
            telefon,
            "❌ Doğum tarihi TC ile eşleşmiyor. Bilgilerinizi kontrol edin."
          );
        }

        if (hasta.dogum !== girilenDogum && skipCheck) {
          console.warn("[WA][FLOW] TEST MODE - Doğum tarihi kontrolü atlandı:", {
            tc: veri.tc,
            fhirDogum: hasta.dogum,
            girilenDogum,
          });
        }
      }

      adSoyad = hasta?.ad || null;
    } catch (e) {
      console.warn(`[WA][FLOW] FHIR erişilemedi: ${e.message}`);
    }
  }

  if (!adSoyad) {
    adSoyad = `TC: ${veri.tc.slice(0, 3)}*****${veri.tc.slice(-3)}`;
  }

  await guvenliWaSend(telefon, MESAJLAR.hastaDogrulama(adSoyad));

  switch (veri.islem) {
    case "randevu": {
      if (veri.triajPoliklinik) {
        await oturumKaydet(telefon, hospitalId, "tarih_bekle", {
          ...yeniVeri,
          ad: adSoyad,
          poliklinik: veri.triajPoliklinik,
        });
        return guvenliWaSend(telefon, MESAJLAR.randevuTarihSor(veri.triajPoliklinik));
      }

      await oturumKaydet(telefon, hospitalId, "poliklinik_bekle", {
        ...yeniVeri,
        ad: adSoyad,
      });

      const m = MESAJLAR.randevuPoliklinikSec();
      return guvenliWaSendList(telefon, m.body, m.sections);
    }

    case "provizyon": {
      const gecmis = await listHistory(30, hospitalId);
      console.log("[WA][FLOW] Provizyon geçmişi bulundu:", {
        adet: Array.isArray(gecmis) ? gecmis.length : 0,
        hospitalId,
      });

      const ilgili = (Array.isArray(gecmis) ? gecmis : []).filter(
        (h) => String(h.tcKimlikNo || "") === String(veri.tc)
      );

      if (ilgili.length === 0) {
        await guvenliWaSend(telefon, "📋 Bu TC için kayıtlı provizyon bulunamadı.");
      } else {
        const son = ilgili[0];
        const sonucUpper = String(son.sonuc || "").toUpperCase();
        const durum = sonucUpper.includes("ONAY") ? "ONAY" : "RED";

        await guvenliWaSend(
          telefon,
          MESAJLAR.provizyonSonuc(durum, son.takip_no || son.id)
        );
      }

      await oturumSil(telefon);
      return anaMenuGoster(telefon, hospitalId);
    }

    case "bilgi": {
      const maskeli = `${"*".repeat(7)}${veri.tc.slice(-4)}`;
      await guvenliWaSend(
        telefon,
        `👤 *Hasta Bilgileri*\n\nTC: *${maskeli}*\nDoğum: *${metin}*\nAd: *${adSoyad}*`
      );
      await oturumSil(telefon);
      return anaMenuGoster(telefon, hospitalId);
    }

    default:
      return guvenliWaSend(telefon, MESAJLAR.anlamadim());
  }
}

async function poliklinikIsle(telefon, secim, veri, hospitalId) {
  console.log("[WA][FLOW] Poliklinik seçimi:", {
    telefon,
    secim,
    veri,
    hospitalId,
  });

  const poliklinikler = {
    pol_dahiliye: "Dahiliye",
    pol_kardiyoloji: "Kardiyoloji",
    pol_ortopedi: "Ortopedi",
    pol_goz: "Göz",
    pol_noroloji: "Nöroloji",
  };

  const poliklinik = poliklinikler[secim];
  if (!poliklinik) {
    return guvenliWaSend(telefon, MESAJLAR.anlamadim());
  }

  await oturumKaydet(telefon, hospitalId, "tarih_bekle", {
    ...veri,
    poliklinik,
  });

  return guvenliWaSend(telefon, MESAJLAR.randevuTarihSor(poliklinik));
}

async function tarihIsle(telefon, metin, veri, hospitalId) {
  console.log("[WA][FLOW] Tarih seçimi:", {
    telefon,
    metin,
    veri,
    hospitalId,
  });

  const girilenTarih = parseTrDate(metin);
  if (!girilenTarih) {
    return guvenliWaSend(telefon, "❌ Tarih formatı hatalı. Örnek: 25.03.2025");
  }

  if (girilenTarih < todayStart()) {
    return guvenliWaSend(telefon, "❌ Geçmiş bir tarih girdiniz. Lütfen bugün veya ileri bir tarih girin:");
  }

  const uygunSaatler = await getAvailableSlots(metin, veri.poliklinik, hospitalId);

  console.log("[WA][FLOW] Uygun saatler:", {
    tarih: metin,
    poliklinik: veri.poliklinik,
    hospitalId,
    uygunSaatler,
  });

  if (!uygunSaatler.length) {
    return guvenliWaSend(
      telefon,
      `❌ ${veri.poliklinik} için ${metin} tarihinde uygun saat kalmadı. Lütfen başka bir tarih girin:`
    );
  }

  const saat = uygunSaatler[0];

  await addRandevu({
    hospitalId,
    telefon,
    tc: veri.tc ?? null,
    ad: veri.ad ?? "Bilinmiyor",
    poliklinik: veri.poliklinik,
    tarih: metin,
    saat,
  });

  await guvenliWaSend(telefon, MESAJLAR.randevuOnay(veri.poliklinik, metin, saat));
  await oturumSil(telefon);
  return anaMenuGoster(telefon, hospitalId);
}

module.exports = { mesajIshle };