const { waSend } = require("./wa_client");
const MESAJLAR = require("./messages");
const { getRandevularByTarih } = require("../../repositories/randevuRepository");

function yarinTarihi() {
  const d = new Date();
  d.setDate(d.getDate() + 1);

  const gun = String(d.getDate()).padStart(2, "0");
  const ay = String(d.getMonth() + 1).padStart(2, "0");
  const yil = d.getFullYear();

  return `${gun}.${ay}.${yil}`;
}

async function hatirlaticiGonder() {
  const yarin = yarinTarihi();

  let yarinRandevular = [];
  try {
    yarinRandevular = await getRandevularByTarih(yarin);
  } catch (err) {
    console.error(`[Scheduler] ❌ Randevu sorgusu başarısız: ${err.message}`);
    return;
  }

  console.log(`[Scheduler] ${yarinRandevular.length} randevu hatırlatması gönderiliyor...`);

  for (const r of yarinRandevular) {
    const telefon = String(r?.telefon || "").trim();

    if (!telefon) {
      console.warn("[Scheduler] ⚠️ Telefon numarası yok — atlandı");
      continue;
    }

    try {
      await waSend(
        telefon,
        MESAJLAR.hatirlatici(
          r.ad || "",
          r.poliklinik || "",
          r.tarih || "",
          r.saat || ""
        )
      );

      console.log(`[Scheduler] ✅ Hatırlatma gönderildi: ${telefon}`);
    } catch (e) {
      console.error(`[Scheduler] ❌ Hata: ${telefon} — ${e.message}`);
    }
  }
}

function msUntilNextRun(hour = 9, minute = 0) {
  const now = new Date();
  const target = new Date();

  target.setHours(hour, minute, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return target - now;
}

function schedulerBaslat() {
  const delay = msUntilNextRun(9, 0);

  console.log(`[Scheduler] İlk çalışma: ${Math.round(delay / 1000 / 60)} dakika sonra`);

  setTimeout(() => {
    hatirlaticiGonder().catch((err) => {
      console.error(`[Scheduler] İlk çalışma hatası: ${err.message}`);
    });

    setInterval(() => {
      hatirlaticiGonder().catch((err) => {
        console.error(`[Scheduler] Döngü hatası: ${err.message}`);
      });
    }, 24 * 60 * 60 * 1000);
  }, delay);
}

module.exports = {
  schedulerBaslat,
  hatirlaticiGonder,
};