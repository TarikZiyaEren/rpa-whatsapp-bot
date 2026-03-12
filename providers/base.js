const { chromium } = require("playwright");
const path = require("path");
const fs   = require("fs");

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

const isTestMode = (process.env.NODE_ENV || "development") !== "production";

class BaseProvider {
  constructor({ username, password, headless, slowMo }) {
    this.username = username;
    this.password = password;
    // Test modunda hızlı çalış: headless + slowMo=0
    this.headless  = headless !== undefined ? headless : (isTestMode ? true : false);
    this.slowMo    = isTestMode ? 0 : (slowMo || 80);
    this.browser   = null;
    this.page      = null;
    this.shotDir   = path.join(__dirname, "../../screenshots");
    this.videoDir  = path.join(__dirname, "../../videos");
    ensureDir(this.shotDir);
    ensureDir(this.videoDir);
  }

  get providerName() { return "base"; }
  get loginUrl()     { throw new Error("loginUrl tanımlanmamış"); }

  async doLogin()         { throw new Error("doLogin tanımlanmamış"); }
  async doProvizyon(data) { throw new Error("doProvizyon tanımlanmamış"); }

  async run(data, progress = () => {}) {
    this.progress = progress; // DÜZELTME: _start()'tan önce atanmalı

    const RETRY = 2;
    let lastErr;

    for (let attempt = 1; attempt <= RETRY; attempt++) {
      progress(`[${this.providerName}] Deneme ${attempt}/${RETRY}`);
      try {
        await this._start();
        await this.doLogin();
        const sonuc = await this.doProvizyon(data);
        await this._stop();
        return sonuc;
      } catch (err) {
        lastErr = err;
        progress(`[${this.providerName}] Hata (deneme ${attempt}): ${err.message}`);
        await this._screenshot(`retry_${attempt}`);

        if (this._isCaptcha(err) || this._is2FA(err)) {
          progress("⚠️ Captcha/2FA tespit edildi — insan müdahalesi gerekiyor!");
          await this._stop();
          throw Object.assign(err, { needsHuman: true });
        }

        await this._stop();
        if (attempt < RETRY) await this._wait(2000);
      }
    }

    throw lastErr;
  }

  async _start() {
    this.browser = await chromium.launch({ headless: this.headless, slowMo: this.slowMo });
    const ctxOpts = { viewport: { width: 1280, height: 720 } };
    // Test modunda video kaydetme (hız kazancı)
    if (!isTestMode) {
      ctxOpts.recordVideo = { dir: this.videoDir };
    }
    const ctx = await this.browser.newContext(ctxOpts);
    this.page = await ctx.newPage();
    this.page.setDefaultTimeout(isTestMode ? 10000 : 30000);
  }

  async _stop() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page    = null;
    }
  }

  async _screenshot(tag) {
    if (!this.page) return;
    try {
      const file = path.join(
        this.shotDir,
        `${this.providerName}_${tag}_${Date.now()}.png`
      );
      await this.page.screenshot({ path: file, fullPage: true });
      this.progress?.(`📸 Screenshot: ${file}`);
    } catch {
      // Sayfa kapandıktan sonra screenshot alınamayabilir
    }
  }

  async humanType(selector, text) {
    if (isTestMode) {
      // Test modunda anında doldur — ~0ms vs ~3000ms
      await this.page.fill(selector, String(text));
      return;
    }
    // Prod modunda insan benzeri yazma
    await this.page.click(selector);
    await this.page.fill(selector, "");
    for (const ch of String(text)) {
      await this.page.type(selector, ch, { delay: 70 + Math.floor(Math.random() * 60) });
    }
    await this._wait(200 + Math.floor(Math.random() * 300));
  }

  _wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  _isCaptcha(err) {
    return /captcha|recaptcha/i.test(err.message);
  }

  _is2FA(err) {
    return /2fa|otp|sms kodu|doğrulama kodu/i.test(err.message);
  }
}

module.exports = BaseProvider;