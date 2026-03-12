const SGKProvider = require("./sgk");
const AllianzProvider = require("./allianz");
const AxaProvider = require("./axa");
const MapfreProvider = require("./mapfre");
const AnadoluProvider = require("./anadolu");
const TurkiyeSigortaProvider = require("./turkiye_sigorta");

function baseSchema(extraFields = []) {
  return [
    { key: "username", label: "Kullanıcı Adı", type: "text", required: true },
    { key: "password", label: "Şifre", type: "password", required: true },
    ...extraFields,
  ];
}

const PROVIDERS = {
  sgk: {
    label: "SGK (Medula)",
    Class: SGKProvider,
    credentialSchema: baseSchema(),
  },

  allianz: {
    label: "Allianz Sağlık",
    Class: AllianzProvider,
    credentialSchema: baseSchema([
      { key: "sube_kodu", label: "Şube Kodu", type: "text", required: false },
    ]),
  },

  axa: {
    label: "AXA Sigorta",
    Class: AxaProvider,
    credentialSchema: baseSchema([
      { key: "kurum_kodu", label: "Kurum Kodu", type: "text", required: false },
    ]),
  },

  mapfre: {
    label: "Mapfre Sigorta",
    Class: MapfreProvider,
    credentialSchema: baseSchema([
      { key: "kurum_kodu", label: "Kurum Kodu", type: "text", required: false },
    ]),
  },

  anadolu: {
    label: "Anadolu Sigorta",
    Class: AnadoluProvider,
    credentialSchema: baseSchema([
      { key: "acente_kodu", label: "Acente Kodu", type: "text", required: false },
    ]),
  },

  turkiye_sigorta: {
    label: "Türkiye Sigorta",
    Class: TurkiyeSigortaProvider,
    credentialSchema: baseSchema([
      { key: "acente_kodu", label: "Acente Kodu", type: "text", required: false },
    ]),
  },
};

function getProvider(key, credentials) {
  const entry = PROVIDERS[key];

  if (!entry) {
    throw new Error(`Bilinmeyen provider: ${key}`);
  }

  if (!entry.Class) {
    throw new Error(`Provider class bulunamadı: ${key}`);
  }

  return new entry.Class(credentials);
}

function listProviders() {
  return Object.entries(PROVIDERS).map(([key, provider]) => ({
    key,
    label: provider.label,
    credentialSchema: Array.isArray(provider.credentialSchema)
      ? provider.credentialSchema
      : [],
  }));
}

function getProviderSchema(key) {
  const entry = PROVIDERS[key];
  if (!entry) return [];
  return Array.isArray(entry.credentialSchema) ? entry.credentialSchema : [];
}

module.exports = {
  getProvider,
  listProviders,
  getProviderSchema,
};