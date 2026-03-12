const BaseProvider = require("./base");

class MapfreProvider extends BaseProvider {
  constructor(credentials = {}) {
    super(credentials);
    this.name = "Mapfre Sigorta";
  }

  get providerName() {
    return "mapfre";
  }

  get loginUrl() {
    return process.env.MAPFRE_URL
      || "http://localhost:4000/login";
  }

  async doLogin() {
    const { page } = this;
    await page.goto(this.loginUrl, { waitUntil: "domcontentloaded" });
    await this.humanType('input[name="username"]', this.username);
    await this.humanType('input[name="password"]', this.password);
    await Promise.all([
      page.waitForURL("**/provizyon**", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);
  }

  async doProvizyon(data) {
    const { page } = this;
    await page.goto(this.loginUrl.replace("/login", "/provizyon"), {
      waitUntil: "domcontentloaded",
    });

    if (data.hasta?.tc) await this.humanType('input[name="tc"]', data.hasta.tc);
    if (data.hasta?.ad) await this.humanType('input[name="ad"]', data.hasta.ad);
    if (data.hasta?.dogum) await this.humanType('input[name="dogum"]', data.hasta.dogum);
    if (data.islem?.kodu) await this.humanType('input[name="islem_kodu"]', data.islem.kodu);

    await page.click('button[type="submit"]');
    await page.waitForSelector(".box, .durum", { timeout: 10000 });

    const resultText = await page.textContent("body");

    if (resultText.includes("ONAY")) {
      const takipNo = resultText.match(/TKP-\d+/)?.[0] || `TKP-${Date.now()}`;
      return {
        basarili: true,
        durum: "ONAY",
        takipNo,
        mesaj: "Provizyon onaylandı.",
        hataKodu: null,
        hataMesaji: null,
      };
    }

    return {
      basarili: false,
      durum: "RED",
      takipNo: null,
      mesaj: "Provizyon reddedildi.",
      hataKodu: "MAPFRE_RED",
      hataMesaji: resultText.match(/RED.*$/m)?.[0] || "Provizyon reddedildi.",
    };
  }
}

module.exports = MapfreProvider;