/**
 * Ortam (test/prod) ayrımını ve her provider için hangi endpoint'in
 * kullanılacağını merkezi olarak çözer.
 */

function resolveEnvironment() {
  const nodeEnv = (process.env.NODE_ENV || "development").toLowerCase();
  if (nodeEnv === "production") return "prod";
  return "test";
}

/**
 * Provider tipine göre doğru base URL ve ayarları döndürür.
 * test ortamında mock/fake URL'ler, prod'da gerçek endpoint'ler kullanılır.
 */
function resolveProviderConfig(providerKey) {
  const env = resolveEnvironment();

  const configs = {
    sgk: {
      test: {
        baseUrl: process.env.SGK_MOCK_BASE_URL || "http://127.0.0.1:4000",
        timeout: 10000,
        useSoap: true,
        mock: true,
      },
      prod: {
        baseUrl: process.env.SGK_PROD_BASE_URL || "https://medula.sgk.gov.tr",
        timeout: 30000,
        useSoap: true,
        mock: false,
      },
    },

    hbys: {
      test: {
        baseUrl: process.env.HBYS_URL || "http://127.0.0.1:4000",
        timeout: 10000,
        tip: process.env.HBYS_TIP || "fake",
        mock: true,
      },
      prod: {
        baseUrl: process.env.HBYS_PROD_URL || process.env.HBYS_URL,
        timeout: 20000,
        tip: "real",
        mock: false,
      },
    },

    fhir: {
      test: {
        baseUrl: process.env.FHIR_URL || "http://localhost:5000",
        token: process.env.FHIR_TOKEN || "",
        timeout: 10000,
        mock: true,
      },
      prod: {
        baseUrl: process.env.FHIR_PROD_URL || process.env.FHIR_URL,
        token: process.env.FHIR_TOKEN || "",
        timeout: 15000,
        mock: false,
      },
    },
  };

  // Özel sigortalar (allianz, axa, mapfre vb.) browser-based — ortak config
  const ozelSigortaDefaults = {
    test: {
      baseUrl: process.env.FAKE_PORTAL_BASE || "http://localhost:4000",
      timeout: 60000,
      headless: process.env.HEADLESS !== "false",
      mock: true,
    },
    prod: {
      baseUrl: null, // Her provider kendi URL'ini bilir
      timeout: 30000,
      headless: true,
      mock: false,
    },
  };

  if (configs[providerKey]) {
    return { environment: env, ...configs[providerKey][env] };
  }

  // sgk dışındaki tüm provider'lar özel sigorta olarak değerlendirilir
  return { environment: env, providerKey, ...ozelSigortaDefaults[env] };
}

module.exports = { resolveEnvironment, resolveProviderConfig };
