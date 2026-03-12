const { initDb } = require("./db");
const { getDb, saveDb } = require("./db/core");
const { hashPassword } = require("./db/crypto");

async function run() {
  const newPass = process.env.ADMIN_PASS;

  if (!newPass) {
    throw new Error("ADMIN_PASS .env içinde tanımlı değil.");
  }

  await initDb();
  const db = await getDb();

  const newHash = hashPassword(newPass);

  db.run(
    `UPDATE users SET password_hash=? WHERE username='admin'`,
    [newHash]
  );

  await saveDb();
  console.log("Admin şifresi resetlendi.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});