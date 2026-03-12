const { getProvider } = require("./providers");

async function provizyonAl({ provider, credentials, hasta, islem }, progress = () => {}) {
  const bot = getProvider(provider, {
    username: credentials.username,
    password: credentials.password,
    headless: process.env.HEADLESS !== "false",
    slowMo: 80,
  });

  const sonucObj = await bot.run({ hasta, islem }, progress);

  // DÜZELTME: durum string'i "ONAY ..." veya "RED ..." ile başlar — server.js includes() kontrolü çalışır
  return `${sonucObj.durum} | Provider: ${sonucObj.provider} | TC: ${hasta.tc}`;
}

module.exports = { provizyonAl };