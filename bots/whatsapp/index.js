const { mesajIshle } = require("./flow");
const {
  hasProcessedMessage,
  markMessageProcessed,
} = require("../../repositories/processedWebhookRepository");
const { getDefaultHospital } = require("../../repositories/hospitalRepository");

async function defaultHospitalIdBul() {
  const hospital = await getDefaultHospital();

  if (!hospital) {
    console.warn("[WA][CTX] Varsayılan hastane bulunamadı");
    return null;
  }

  console.log("[WA][CTX] Varsayılan hospital seçildi:", {
    id: hospital.id,
    ad: hospital.ad,
    kod: hospital.kod,
    aktif: hospital.aktif,
  });

  return hospital.id;
}

async function hospitalContextBul(change) {
  const phoneNumberId = change?.value?.metadata?.phone_number_id || null;
  const displayPhoneNumber = change?.value?.metadata?.display_phone_number || null;

  const hospitalId = await defaultHospitalIdBul();

  console.log("[WA][CTX] WhatsApp metadata:", {
    phoneNumberId,
    displayPhoneNumber,
    hospitalId,
  });

  return {
    hospitalId,
    phoneNumberId,
    displayPhoneNumber,
  };
}

async function webhookIsle(body) {
  console.log("[WA][INDEX] webhookIsle başladı");

  try {
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    console.log(`[WA][INDEX] entry sayısı: ${entries.length}`);

    if (entries.length === 0) {
      console.warn("[WA][INDEX] Body içinde entry yok");
      return;
    }

    for (const [entryIndex, entry] of entries.entries()) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      console.log(`[WA][INDEX] entry[${entryIndex}] change sayısı: ${changes.length}`);

      for (const [changeIndex, change] of changes.entries()) {
        const value = change?.value || {};
        const { hospitalId } = await hospitalContextBul(change);

        console.log(`[WA][INDEX] entry[${entryIndex}] change[${changeIndex}] işlendi`);

        if (Array.isArray(value.statuses) && value.statuses.length > 0) {
          for (const status of value.statuses) {
            console.log("[WA][STATUS]:", {
              id: status.id,
              status: status.status,
              recipient_id: status.recipient_id,
              timestamp: status.timestamp,
            });
          }
        }

        if (!Array.isArray(value.messages) || value.messages.length === 0) {
          console.log("[WA][INDEX] Bu change içinde message yok, atlandı");
          continue;
        }

        console.log(`[WA][INDEX] Mesaj sayısı: ${value.messages.length}`);

        for (const [mesajIndex, mesaj] of value.messages.entries()) {
          const telefon = mesaj?.from || null;
          const mesajId = mesaj?.id || null;
          const mesajType = mesaj?.type || null;

          console.log(`[WA][INDEX] Mesaj[${mesajIndex}] bulundu:`, {
            mesajId,
            telefon,
            mesajType,
          });

          try {
            console.log("[WA][INDEX] Ham mesaj:", JSON.stringify(mesaj, null, 2));
          } catch (e) {
            console.warn("[WA][INDEX] Ham mesaj stringify edilemedi:", e.message);
          }

          if (!telefon || !mesajId) {
            console.warn("[WA][INDEX] Mesaj telefonu veya id eksik, atlandı");
            continue;
          }

          const dahaOnceIslendi = await hasProcessedMessage(mesajId);

          if (dahaOnceIslendi) {
            console.log(`[WA][INDEX] Duplicate mesaj atlandı: ${mesajId}`);
            continue;
          }

          try {
            console.log("[WA][INDEX] mesajIshle çağrılıyor...");
            await mesajIshle(telefon, mesaj, { hospitalId });
            console.log("[WA][INDEX] mesajIshle tamamlandı");

            await markMessageProcessed(mesajId, telefon, hospitalId);
            console.log("[WA][INDEX] Mesaj processed olarak işaretlendi:", mesajId);
          } catch (err) {
            console.error("[WA][INDEX] Mesaj işlenemedi:", {
              mesajId,
              telefon,
              hata: err.message,
            });
            console.error(err.stack);
          }
        }
      }
    }
  } catch (e) {
    console.error("[WA][INDEX] Webhook genel hata:", e.message);
    console.error(e.stack);
  }

  console.log("[WA][INDEX] webhookIsle bitti");
}

module.exports = { webhookIsle };