const BaseProvider = require("./base");

class AxaProvider extends BaseProvider {
  get providerName() {
    return "AXA";
  }

  get loginUrl() {
    return process.env.FAKE_PORTAL_BASE
      ? `${process.env.FAKE_PORTAL_BASE}/login`
      : "http://localhost:4000/login";
  }

  async doLogin() {
    this.progress("AXA: Login sayfasına gidiliyor...");

    await this.page.goto(this.loginUrl, {
      waitUntil: "domcontentloaded",
    });

    await this.humanType('input[name="username"]', this.username);
    await this.humanType('input[name="password"]', this.password);

    await this.page.click('button[type="submit"]');

    await this.page.waitForURL("**/provizyon", { timeout: 10000 });

    this.progress("AXA: Giriş başarılı.");
  }

  async doProvizyon(data) {
    this.progress("AXA: Provizyon formu dolduruluyor...");

    await this.humanType('input[name="tc"]', data.hasta.tc);
    await this.humanType('input[name="ad"]', data.hasta.ad);
    await this.humanType('input[name="dogum"]', data.hasta.dogum);

    if (data.islem?.adi) {
      const islemAdiInput = this.page.locator('input[name="islem_adi"]');
      if (await islemAdiInput.count()) {
        await this.humanType('input[name="islem_adi"]', data.islem.adi);
      }
    }

    if (data.islem?.kodu) {
      const islemKoduInput = this.page.locator('input[name="islem_kodu"]');
      if (await islemKoduInput.count()) {
        await this.humanType('input[name="islem_kodu"]', data.islem.kodu);
      }
    }

    if (data.doktorNotu) {
      const notInput = this.page.locator('textarea[name="doktor_notu"]');
      if (await notInput.count()) {
        await this.humanType('textarea[name="doktor_notu"]', data.doktorNotu);
      }
    }

    await this.page.click('button[type="submit"]');

    const box = this.page.locator("div.box.ok, div.box.err");
    await box.first().waitFor({ timeout: 10000 });

    const text = (await box.first().innerText()).trim();

    const mDurum = text.match(/Durum:\s*(ONAY|RED)/i);
    const mTakip = text.match(/Takip\s*No:\s*([A-Z0-9-]+)/i);
    const mHata = text.match(/Hata\s*Kodu:\s*([A-Z0-9-]+)/i);

    let durum = mDurum ? mDurum[1].toUpperCase() : null;

    if (!durum) {
      if (/onay/i.test(text)) durum = "ONAY";
      else if (/red/i.test(text)) durum = "RED";
      else durum = "BİLİNMİYOR";
    }

    return {
      provider: "AXA",
      durum,
      takipNo: mTakip ? mTakip[1] : null,
      hataKodu: mHata ? mHata[1] : null,
      hataMesaji: durum === "RED" ? text : null,
      ham: text,
      islem: data.islem,
    };
  }
}

module.exports = AxaProvider;