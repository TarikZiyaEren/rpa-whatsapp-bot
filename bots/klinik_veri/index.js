const {
  hastaGetir,
  epikrizlerGetir,
  teshislerGetir,
  ilaclarGetir,
  labSonuclariGetir,
  goruntulemelerGetir,
  prosedurlerGetir,
} = require("./fhir_client");

function uniqBy(items = [], keyFn = (x) => x) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function temizMetin(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function kritikLabMi(flag) {
  const f = String(flag || "").trim().toLowerCase();
  return ["high", "low", "h", "l", "critical-high", "critical-low", "critical_high", "critical_low"].includes(f);
}

function labSatiriOlustur(lab) {
  const test = temizMetin(lab?.test || "-");
  const deger = temizMetin(lab?.deger || "-");
  const birim = temizMetin(lab?.birim || "");
  const referans = temizMetin(lab?.referans || "");
  const flag = String(lab?.flag || "").trim().toLowerCase();

  let suffix = "";
  if (flag === "high" || flag === "h" || flag === "critical-high" || flag === "critical_high") {
    suffix = " (yüksek)";
  } else if (flag === "low" || flag === "l" || flag === "critical-low" || flag === "critical_low") {
    suffix = " (düşük)";
  }

  return `${test}: ${deger}${birim ? ` ${birim}` : ""}${referans ? ` [Ref: ${referans}]` : ""}${suffix}`;
}

function klinikOzetOlustur({
  hasta,
  epikrizler,
  teshisler,
  ilaclar,
  labSonuclari,
  goruntulemeler,
  prosedurler,
}) {
  const teshisAdlari = uniqBy(
    (teshisler || [])
      .map((x) => temizMetin(x.ad || x.tani || x.display || x.kod || ""))
      .filter(Boolean),
    (x) => x.toLowerCase()
  ).slice(0, 5);

  const ilacAdlari = uniqBy(
    (ilaclar || [])
      .map((x) => temizMetin(x.ad || x.ilac || x.ilacAdi || x.display || ""))
      .filter(Boolean),
    (x) => x.toLowerCase()
  ).slice(0, 6);

  const kritikLablar = (labSonuclari || [])
    .filter((x) => kritikLabMi(x.flag))
    .slice(0, 4)
    .map(labSatiriOlustur);

  const normalLablar = (labSonuclari || [])
    .filter((x) => !kritikLabMi(x.flag))
    .slice(0, 2)
    .map(labSatiriOlustur);

  const goruntulemeOzet = (goruntulemeler || [])
    .slice(0, 3)
    .map((x) => {
      const tur = temizMetin(x.tur || "Tetkik");
      const bolge = temizMetin(x.bolge || "");
      const sonuc = temizMetin(x.sonuc || "");
      return `${tur}${bolge ? ` (${bolge})` : ""}: ${sonuc}`;
    });

  const prosedurOzet = (prosedurler || [])
    .slice(0, 4)
    .map((x) => `${temizMetin(x.kod || "-")} ${temizMetin(x.ad || "")}`.trim());

  const sonEpikriz = (epikrizler || [])
    .map((x) => temizMetin(x.icerik || x.not || x.text || ""))
    .filter(Boolean)
    .slice(0, 2);

  const satirlar = [];

  if (hasta?.ad) satirlar.push(`Hasta: ${hasta.ad}`);
  if (hasta?.dogum) satirlar.push(`Doğum Tarihi: ${hasta.dogum}`);
  if (teshisAdlari.length) satirlar.push(`Başlıca Tanılar: ${teshisAdlari.join(", ")}`);
  if (ilacAdlari.length) satirlar.push(`İlaçlar: ${ilacAdlari.join(", ")}`);

  if (kritikLablar.length) {
    satirlar.push(`Kritik Laboratuvar Bulguları: ${kritikLablar.join(" | ")}`);
  } else if (normalLablar.length) {
    satirlar.push(`Laboratuvar: ${normalLablar.join(" | ")}`);
  }

  if (goruntulemeOzet.length) satirlar.push(`Görüntüleme: ${goruntulemeOzet.join(" | ")}`);
  if (prosedurOzet.length) satirlar.push(`Yakın Prosedürler: ${prosedurOzet.join(" | ")}`);
  if (sonEpikriz.length) satirlar.push(`Klinik Not Özeti: ${sonEpikriz.join(" | ")}`);

  if (!satirlar.length) {
    return "Klinik özet oluşturulamadı.";
  }

  return satirlar.join("\n");
}

function birlesikDoktorNotuOlustur({
  epikrizler,
  teshisler,
  ilaclar,
  labSonuclari,
  goruntulemeler,
  prosedurler,
}) {
  const epikrizMetni = (epikrizler || [])
    .slice(0, 3)
    .map((e, i) => {
      const icerik = temizMetin(e.icerik || e.not || e.text || "");
      return icerik ? `Epikriz ${i + 1}: ${icerik}` : null;
    })
    .filter(Boolean);

  const teshisMetni = uniqBy(
    (teshisler || [])
      .map((t) => temizMetin(t.ad || t.tani || t.display || t.kod || ""))
      .filter(Boolean),
    (x) => x.toLowerCase()
  ).slice(0, 8);

  const ilacMetni = uniqBy(
    (ilaclar || [])
      .map((i) => temizMetin(i.ad || i.ilac || i.ilacAdi || i.display || ""))
      .filter(Boolean),
    (x) => x.toLowerCase()
  ).slice(0, 8);

  const labMetni = (labSonuclari || [])
    .slice(0, 6)
    .map((l) => labSatiriOlustur(l));

  const goruntulemeMetni = (goruntulemeler || [])
    .slice(0, 4)
    .map((g) => {
      const tur = temizMetin(g.tur || "");
      const bolge = temizMetin(g.bolge || "");
      const sonuc = temizMetin(g.sonuc || "");
      return `${tur}${bolge ? ` (${bolge})` : ""} ${sonuc}`.trim();
    })
    .filter(Boolean);

  const prosedurMetni = (prosedurler || [])
    .slice(0, 4)
    .map((p) => `${temizMetin(p.kod)} ${temizMetin(p.ad)}`.trim())
    .filter(Boolean);

  const bloklar = [];

  if (teshisMetni.length) bloklar.push(`Tanılar: ${teshisMetni.join(", ")}`);
  if (ilacMetni.length) bloklar.push(`İlaçlar: ${ilacMetni.join(", ")}`);
  if (labMetni.length) bloklar.push(`Laboratuvar Bulguları: ${labMetni.join(", ")}`);
  if (goruntulemeMetni.length) bloklar.push(`Görüntüleme Bulguları: ${goruntulemeMetni.join(", ")}`);
  if (prosedurMetni.length) bloklar.push(`Yakın İşlemler: ${prosedurMetni.join(", ")}`);
  if (epikrizMetni.length) bloklar.push(...epikrizMetni);

  return bloklar.join("\n\n").trim();
}

function riskIsaretleriBul({ epikrizler, teshisler, labSonuclari, goruntulemeler, prosedurler }) {
  const metin = [
    ...(epikrizler || []).map((x) => temizMetin(x.icerik || x.not || x.text || "")),
    ...(teshisler || []).map((x) => temizMetin(x.ad || x.tani || x.display || x.kod || "")),
    ...(goruntulemeler || []).map((x) => temizMetin(x.sonuc || "")),
    ...(prosedurler || []).map((x) => `${temizMetin(x.kod)} ${temizMetin(x.ad)}`.trim()),
    ...(labSonuclari || []).map((x) => `${temizMetin(x.test)} ${temizMetin(x.deger)}`),
  ]
    .join(" ")
    .toLowerCase();

  const flags = [];

  const kontrolListesi = [
    ["yoğun bakım", "Yoğun bakım öyküsü / notu bulundu"],
    ["ameliyat", "Ameliyat / operasyon ifadesi bulundu"],
    ["operasyon", "Operasyon ifadesi bulundu"],
    ["diyaliz", "Diyaliz ilişkili ifade bulundu"],
    ["kanser", "Onkoloji ilişkili ifade bulundu"],
    ["tümör", "Tümör ifadesi bulundu"],
    ["metastaz", "Metastaz ifadesi bulundu"],
    ["sepsis", "Sepsis ifadesi bulundu"],
    ["entübe", "Entübasyon ifadesi bulundu"],
    ["kronik böbrek", "Kronik böbrek hastalığı ifadesi bulundu"],
    ["renal", "Renal fonksiyon bozukluğu ifadesi bulundu"],
    ["infiltrasyon", "Akciğer infiltrasyonu ifadesi bulundu"],
    ["koroner", "Koroner hastalık ifadesi bulundu"],
    ["hipertansiyon", "Hipertansiyon öyküsü bulundu"],
  ];

  for (const [needle, label] of kontrolListesi) {
    if (metin.includes(needle)) {
      flags.push(label);
    }
  }

  const kritikLablar = (labSonuclari || []).filter((x) => kritikLabMi(x.flag));

  if (kritikLablar.length) {
    flags.push(`Kritik / referans dışı lab sonucu sayısı: ${kritikLablar.length}`);

    for (const lab of kritikLablar.slice(0, 3)) {
      flags.push(`Anormal lab: ${labSatiriOlustur(lab)}`);
    }
  }

  return [...new Set(flags)];
}

async function klinikVeriTopla(tc, progress = () => {}) {
  progress(`FHIR: TC ${tc} için veri çekiliyor...`);

  const hasta = await hastaGetir(tc);
  progress(`✅ Hasta bulundu: ${hasta.ad}`);

  const [
    epikrizler,
    teshisler,
    ilaclar,
    labSonuclari,
    goruntulemeler,
    prosedurler,
  ] = await Promise.all([
    epikrizlerGetir(hasta.id),
    teshislerGetir(hasta.id),
    ilaclarGetir(hasta.id),
    labSonuclariGetir(hasta.id),
    goruntulemelerGetir(hasta.id),
    prosedurlerGetir(hasta.id),
  ]);

  progress(
    `📄 Epikriz: ${epikrizler.length} | Teşhis: ${teshisler.length} | İlaç: ${ilaclar.length} | Lab: ${labSonuclari.length} | Görüntüleme: ${goruntulemeler.length} | Prosedür: ${prosedurler.length}`
  );

  const birleskNotlar = birlesikDoktorNotuOlustur({
    epikrizler,
    teshisler,
    ilaclar,
    labSonuclari,
    goruntulemeler,
    prosedurler,
  });

  const klinikOzet = klinikOzetOlustur({
    hasta,
    epikrizler,
    teshisler,
    ilaclar,
    labSonuclari,
    goruntulemeler,
    prosedurler,
  });

  const riskIsaretleri = riskIsaretleriBul({
    epikrizler,
    teshisler,
    labSonuclari,
    goruntulemeler,
    prosedurler,
  });

  if (riskIsaretleri.length) {
    progress(`⚠️ Klinik risk işaretleri: ${riskIsaretleri.join(" | ")}`);
  }

  return {
    hasta,
    epikrizler,
    teshisler,
    ilaclar,
    labSonuclari,
    goruntulemeler,
    prosedurler,
    birleskNotlar,
    klinikOzet,
    riskIsaretleri,
    kaynak: hasta.source || "FHIR_MOCK",
  };
}

module.exports = { klinikVeriTopla };