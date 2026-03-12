const { getDb, saveDb } = require("../db/core");
const { uid, mapExecRows } = require("../db/utils");

function nowIso() {
  return new Date().toISOString();
}

async function hasProcessedMessage(messageId) {
  if (!messageId) {
    console.warn("[WA][PROCESSED] messageId boş geldi");
    return false;
  }

  const db = await getDb();
  const rows = mapExecRows(
    db.exec(`SELECT id FROM processed_webhooks WHERE message_id=? LIMIT 1`, [messageId])
  );

  const bulundu = !!rows[0];

  console.log("[WA][PROCESSED] hasProcessedMessage:", {
    messageId,
    bulundu,
  });

  return bulundu;
}

async function markMessageProcessed(messageId, telefon = null, hospitalId = null) {
  if (!messageId) {
    console.warn("[WA][PROCESSED] markMessageProcessed çağrıldı ama messageId boş");
    return;
  }

  const db = await getDb();

  db.run(
    `
    INSERT OR IGNORE INTO processed_webhooks
    (id, message_id, telefon, hospital_id, processed_at)
    VALUES (?,?,?,?,?)
    `,
    [uid(), messageId, telefon, hospitalId, nowIso()]
  );

  await saveDb();

  console.log("[WA][PROCESSED] Mesaj processed olarak kaydedildi:", {
    messageId,
    telefon,
    hospitalId,
  });
}

async function clearProcessedMessages() {
  const db = await getDb();
  db.run(`DELETE FROM processed_webhooks`);
  await saveDb();

  console.log("[WA][PROCESSED] processed_webhooks tablosu temizlendi");
}

module.exports = {
  hasProcessedMessage,
  markMessageProcessed,
  clearProcessedMessages,
};