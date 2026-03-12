/**
 * Hybrid Cloud Katmanı
 * Lokal (SQLite) ↔ Cloud (S3/Azure Blob) senkronizasyonu
 * Hassas veri lokalde, raporlar/yedekler cloud'da
 */

const CLOUD_TIP = process.env.CLOUD_TIP || "mock"; // mock | s3 | azure

async function yedekYukle(icerik, dosyaAdi, progress = () => {}) {
  progress(`[Cloud] Yedek yükleniyor: ${dosyaAdi} (${CLOUD_TIP})`);
  switch (CLOUD_TIP) {
    case "s3":    return s3Yukle(icerik, dosyaAdi, progress);
    case "azure": return azureYukle(icerik, dosyaAdi, progress);
    case "mock":
    default:      return mockYukle(dosyaAdi, progress);
  }
}

async function yedekIndir(dosyaAdi, progress = () => {}) {
  progress(`[Cloud] Yedek indiriliyor: ${dosyaAdi}`);
  switch (CLOUD_TIP) {
    case "s3":    return s3Indir(dosyaAdi, progress);
    case "azure": return azureIndir(dosyaAdi, progress);
    case "mock":
    default:      return mockIndir(dosyaAdi, progress);
  }
}

// DB yedeği al ve cloud'a yükle
async function dbYedekle(dbBuffer, progress = () => {}) {
  const tarih    = new Date().toISOString().slice(0, 10);
  const dosyaAdi = `yedek/rpa_${tarih}.db`;
  return yedekYukle(dbBuffer, dosyaAdi, progress);
}

// ── Mock ──────────────────────────────────────────────────────────────
async function mockYukle(dosyaAdi, progress) {
  progress(`[Cloud/Mock] "${dosyaAdi}" yüklendi (simüle).`);
  return { basarili: true, url: `mock://cloud/${dosyaAdi}`, tip: "mock" };
}

async function mockIndir(dosyaAdi, progress) {
  progress(`[Cloud/Mock] "${dosyaAdi}" indirildi (simüle).`);
  return { basarili: true, icerik: null, tip: "mock" };
}

// ── AWS S3 ────────────────────────────────────────────────────────────
async function s3Yukle(icerik, dosyaAdi, progress) {
  const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: process.env.AWS_REGION || "eu-central-1",
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key:    dosyaAdi,
    Body:   icerik,
  }));
  progress(`[Cloud/S3] Yüklendi: s3://${process.env.S3_BUCKET}/${dosyaAdi}`);
  return { basarili: true, url: `s3://${process.env.S3_BUCKET}/${dosyaAdi}`, tip: "s3" };
}

async function s3Indir(dosyaAdi, progress) {
  const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
  const s3 = new S3Client({ region: process.env.AWS_REGION || "eu-central-1" });
  const res = await s3.send(new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key:    dosyaAdi,
  }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  progress(`[Cloud/S3] İndirildi: ${dosyaAdi}`);
  return { basarili: true, icerik: Buffer.concat(chunks), tip: "s3" };
}

// ── Azure Blob ────────────────────────────────────────────────────────
async function azureYukle(icerik, dosyaAdi, progress) {
  const { BlobServiceClient } = require("@azure/storage-blob");
  const client = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  const container = client.getContainerClient(process.env.AZURE_CONTAINER || "rpa-yedek");
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(dosyaAdi);
  await blob.upload(icerik, icerik.length);
  progress(`[Cloud/Azure] Yüklendi: ${dosyaAdi}`);
  return { basarili: true, url: blob.url, tip: "azure" };
}

async function azureIndir(dosyaAdi, progress) {
  const { BlobServiceClient } = require("@azure/storage-blob");
  const client = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  const container = client.getContainerClient(process.env.AZURE_CONTAINER || "rpa-yedek");
  const blob = container.getBlockBlobClient(dosyaAdi);
  const res = await blob.download();
  const chunks = [];
  for await (const chunk of res.readableStreamBody) chunks.push(chunk);
  progress(`[Cloud/Azure] İndirildi: ${dosyaAdi}`);
  return { basarili: true, icerik: Buffer.concat(chunks), tip: "azure" };
}

module.exports = { yedekYukle, yedekIndir, dbYedekle };