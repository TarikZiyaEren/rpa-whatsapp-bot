/**
 * Sahte FHIR R4 sunucusu — test için
 * Çalıştır: node fake_fhir.js
 * URL: http://localhost:5000
 */

const express = require("express");
const app = express();
app.use(express.json());

const HASTALAR = {
  "12345678901": {
    id: "hasta-001",
    resourceType: "Patient",
    identifier: [{ value: "12345678901" }],
    name: [{ text: "Ayşe Demir" }],
    birthDate: "1985-03-15",
    gender: "female",
  },
  "10399645546": {
    id: "hasta-002",
    resourceType: "Patient",
    identifier: [{ value: "10399645546" }],
    name: [{ text: "Tarık Ziya Eren" }],
    birthDate: "2000-12-25",
    gender: "male",
  },
};

const EPIKRIZLER = {
  "hasta-001": [{
    resourceType: "DocumentReference",
    id: "doc-001",
    date: "2024-01-10",
    description: "Hasta kronik hipertansiyon nedeniyle takip edilmektedir. Son kontrol muayenesinde kan basıncı 150/95 mmHg olarak ölçülmüş, ilaç tedavisine devam edilmesi planlanmıştır.",
    content: [{ attachment: { contentType: "text/plain", data: Buffer.from("Hasta kronik hipertansiyon tedavisi görmektedir.").toString("base64") } }],
  }],
  "hasta-002": [{
    resourceType: "DocumentReference",
    id: "doc-002",
    date: "2024-02-20",
    description: "Rutin dahiliye muayenesi. Hasta genel durumu iyi, şikayeti yok.",
    content: [{ attachment: { contentType: "text/plain", data: Buffer.from("Rutin kontrol muayenesi yapıldı.").toString("base64") } }],
  }],
};

const TESHISLER = {
  "hasta-001": [
    { resourceType: "Condition", id: "con-001", code: { coding: [{ code: "I10", display: "Hipertansiyon" }] }, clinicalStatus: { coding: [{ code: "active" }] } },
  ],
  "hasta-002": [],
};

// ── FHIR Endpoints ────────────────────────────────────────────────────
app.get("/Patient", (req, res) => {
  const identifier = req.query.identifier || "";
  const tc = identifier.split("|").pop();
  const hasta = HASTALAR[tc];

  res.json({
    resourceType: "Bundle",
    entry: hasta ? [{ resource: hasta }] : [],
  });
});

app.get("/DocumentReference", (req, res) => {
  const hastaId = req.query.patient;
  const docs = EPIKRIZLER[hastaId] || [];
  res.json({ resourceType: "Bundle", entry: docs.map(r => ({ resource: r })) });
});

app.get("/Condition", (req, res) => {
  const hastaId = req.query.patient;
  const conds = TESHISLER[hastaId] || [];
  res.json({ resourceType: "Bundle", entry: conds.map(r => ({ resource: r })) });
});

app.get("/MedicationRequest", (req, res) => {
  res.json({ resourceType: "Bundle", entry: [] });
});

app.listen(5000, () => {
  console.log("🏥 Fake FHIR Sunucusu: http://localhost:5000");
  console.log("Test TC'leri: 12345678901, 10399645546");
});