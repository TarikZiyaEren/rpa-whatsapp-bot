/**
 * HBYS (Hastane Bilgi Yönetim Sistemi) Adapter
 * Mevcut FHIR katmanını ve hasta veri çekme işlemlerini sarar.
 * Test ortamında fake_fhir.js'e, prod'da gerçek HBYS/FHIR'a bağlanır.
 */
const BaseAdapter = require("./base");
const { resolveProviderConfig } = require("../envResolver");
const axios = require("axios");

class HbysAdapter extends BaseAdapter {
  get name() {
    return "HBYS";
  }

  get supportedProviders() {
    return ["hbys", "fhir"];
  }

  /**
   * HBYS'den hasta bilgisi ve klinik veri çeker.
   * payload.islem: "hasta_sorgula" | "klinik_veri" | "belge_sorgula"
   */
  async execute(payload, context, log = () => {}) {
    const fhirConfig = resolveProviderConfig("fhir");
    const prefix = context.toLogPrefix();
    const islem = payload.islemTipi || "hasta_sorgula";

    const headers = {};
    if (fhirConfig.token) {
      headers["Authorization"] = `Bearer ${fhirConfig.token}`;
    }

    log(`${prefix} HBYS sorgusu başlatılıyor (${islem}) — ${fhirConfig.baseUrl}`);

    if (islem === "hasta_sorgula") {
      return await this._hastaSorgula(payload, fhirConfig, headers, prefix, log);
    }

    if (islem === "klinik_veri") {
      return await this._klinikVeri(payload, fhirConfig, headers, prefix, log);
    }

    if (islem === "belge_sorgula") {
      return await this._belgeSorgula(payload, fhirConfig, headers, prefix, log);
    }

    throw Object.assign(
      new Error(`Bilinmeyen HBYS işlem tipi: ${islem}`),
      { code: "UNKNOWN_HBYS_OPERATION" }
    );
  }

  async _hastaSorgula(payload, config, headers, prefix, log) {
    const tc = payload.hasta?.tc;
    if (!tc) throw new Error("HBYS hasta sorgusu için TC gerekli.");

    const resp = await axios.get(`${config.baseUrl}/Patient`, {
      params: { identifier: tc },
      headers,
      timeout: config.timeout,
    });

    const entries = resp.data?.entry || [];
    if (entries.length === 0) {
      return {
        basarili: false,
        durum: "BULUNAMADI",
        hataKodu: "PATIENT_NOT_FOUND",
        hataMesaji: `TC ${tc} ile hasta bulunamadı.`,
      };
    }

    const patient = entries[0]?.resource || {};
    log(`${prefix} Hasta bulundu: ${patient.name?.[0]?.text || "?"}`);

    return {
      basarili: true,
      durum: "BULUNDU",
      hasta: {
        id: patient.id,
        ad: patient.name?.[0]?.text || null,
        dogum: patient.birthDate || null,
        cinsiyet: patient.gender || null,
      },
    };
  }

  async _klinikVeri(payload, config, headers, prefix, log) {
    const patientId = payload.patientId || payload.hasta?.id;
    if (!patientId) throw new Error("Klinik veri için patientId gerekli.");

    const [conditions, medications, documents] = await Promise.all([
      axios.get(`${config.baseUrl}/Condition`, {
        params: { patient: patientId },
        headers,
        timeout: config.timeout,
      }).catch(() => ({ data: { entry: [] } })),

      axios.get(`${config.baseUrl}/MedicationRequest`, {
        params: { patient: patientId },
        headers,
        timeout: config.timeout,
      }).catch(() => ({ data: { entry: [] } })),

      axios.get(`${config.baseUrl}/DocumentReference`, {
        params: { patient: patientId },
        headers,
        timeout: config.timeout,
      }).catch(() => ({ data: { entry: [] } })),
    ]);

    log(`${prefix} Klinik veri toplandı`);

    return {
      basarili: true,
      durum: "TAMAMLANDI",
      teshisler: (conditions.data?.entry || []).map((e) => e.resource),
      ilaclar: (medications.data?.entry || []).map((e) => e.resource),
      belgeler: (documents.data?.entry || []).map((e) => e.resource),
    };
  }

  async _belgeSorgula(payload, config, headers, prefix, log) {
    const patientId = payload.patientId || payload.hasta?.id;
    if (!patientId) throw new Error("Belge sorgusu için patientId gerekli.");

    const resp = await axios.get(`${config.baseUrl}/DocumentReference`, {
      params: { patient: patientId },
      headers,
      timeout: config.timeout,
    });

    const entries = resp.data?.entry || [];
    log(`${prefix} ${entries.length} belge bulundu`);

    return {
      basarili: true,
      durum: "TAMAMLANDI",
      belgeler: entries.map((e) => e.resource),
    };
  }

  async healthCheck() {
    const config = resolveProviderConfig("fhir");
    try {
      await axios.get(`${config.baseUrl}/Patient`, { timeout: 3000 });
      return { healthy: true, detail: `FHIR endpoint erişilebilir: ${config.baseUrl}` };
    } catch (err) {
      return { healthy: false, detail: `FHIR endpoint erişilemedi: ${err.message}` };
    }
  }
}

module.exports = HbysAdapter;
