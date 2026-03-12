const BaseProvider = require("./base");

class SGKProvider extends BaseProvider {
  get providerName() { return "SGK"; }
  get loginUrl() {
    return process.env.FAKE_PORTAL_BASE
      ? `${process.env.FAKE_PORTAL_BASE}/login`
      : "http://localhost:4000/login";
  }

  async doLogin() {
    this.progress("SGK: Login sayfasına gidiliyor...");
    await this.page.goto(this.loginUrl, { waitUntil: "domcontentloaded" });
    this.progress("SGK: Kullanıcı bilgileri giriliyor...");
    await this.humanType('input[name="username"]', this.username);
    await this.humanType('input[name="password"]', this.password);
    await this.page.click('button[type="submit"]');
    await this.page.waitForURL("**/provizyon", { timeout: 10000 });
    this.progress("SGK: Giriş başarılı.");
  }

  async doProvizyon(data) {
    this.progress("SGK: Provizyon formu dolduruluyor...");
    await this.humanType('input[name="tc"]',    data.hasta.tc);
    await this.humanType('input[name="ad"]',    data.hasta.ad);
    await this.humanType('input[name="dogum"]', data.hasta.dogum);
    this.progress("SGK: Form gönderiliyor...");
    await this.page.click('button[type="submit"]');
    this.progress("SGK: Sonuç bekleniyor...");

    // DÜZELTME: hem ONAY hem RED kutusunu yakala
    const box = this.page.locator("div.box.ok, div.box.err");
    await box.first().waitFor({ timeout: 10000 });

    const text = (await box.first().innerText()).trim();
    const m = text.match(/Durum:\s*(ONAY|RED)/i);
    let durum = m ? m[1].toUpperCase() : null;

    if (!durum) {
      if (/onay/i.test(text)) durum = "ONAY";
      else if (/red/i.test(text)) durum = "RED";
      else durum = "BİLİNMİYOR";
    }

    return { provider: "SGK", durum, ham: text, islem: data.islem };
  }
}

module.exports = SGKProvider;