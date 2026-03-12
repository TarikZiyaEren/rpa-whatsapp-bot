const { getDb, saveDb } = require("../db/core");
const { uid } = require("../db/utils");
const { encrypt, decrypt } = require("../db/crypto");

function assertHospitalId(hospitalId) {
  if (!hospitalId || typeof hospitalId !== "string" || !hospitalId.trim()) {
    throw new Error("credentialRepository: hospitalId zorunludur.");
  }
}

function assertUserId(userId) {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new Error("credentialRepository: userId zorunludur.");
  }
}

function normalizeHospitalId(hospitalId) {
  assertHospitalId(hospitalId);
  return String(hospitalId).trim();
}

function normalizeUserId(userId) {
  assertUserId(userId);
  return String(userId).trim();
}

function normalizeProvider(provider) {
  const value = String(provider || "").trim().toLowerCase();
  if (!value) {
    throw new Error("credentialRepository: provider zorunludur.");
  }
  return value;
}

function normalizeCredentialPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      username: "",
      password: "",
    };
  }

  const out = {};

  for (const [key, value] of Object.entries(input)) {
    out[key] = value == null ? "" : String(value).trim();
  }

  if (!("username" in out)) out.username = "";
  if (!("password" in out)) out.password = "";

  return out;
}

async function findExistingCredentialRow(db, hospitalId, userId, provider) {
  // Önce yeni tenant-aware mantık
  let r = db.exec(
    `
    SELECT id, hospital_id, user_id, provider
    FROM credentials
    WHERE hospital_id=? AND user_id=? AND provider=?
    LIMIT 1
    `,
    [hospitalId, userId, provider]
  );

  if (r[0]?.values?.length) {
    const [id, rowHospitalId, rowUserId, rowProvider] = r[0].values[0];
    return {
      id,
      hospital_id: rowHospitalId,
      user_id: rowUserId,
      provider: rowProvider,
    };
  }

  // Eski unique(user_id, provider) şemasını da yakala
  r = db.exec(
    `
    SELECT id, hospital_id, user_id, provider
    FROM credentials
    WHERE user_id=? AND provider=?
    LIMIT 1
    `,
    [userId, provider]
  );

  if (r[0]?.values?.length) {
    const [id, rowHospitalId, rowUserId, rowProvider] = r[0].values[0];
    return {
      id,
      hospital_id: rowHospitalId,
      user_id: rowUserId,
      provider: rowProvider,
    };
  }

  return null;
}

async function saveCredential(
  hospitalId,
  userId,
  provider,
  usernameOrPayload,
  password
) {
  const finalHospitalId = normalizeHospitalId(hospitalId);
  const finalUserId = normalizeUserId(userId);
  const finalProvider = normalizeProvider(provider);

  const db = await getDb();

  let payload;

  if (
    usernameOrPayload &&
    typeof usernameOrPayload === "object" &&
    !Array.isArray(usernameOrPayload)
  ) {
    payload = normalizeCredentialPayload(usernameOrPayload);
  } else {
    payload = normalizeCredentialPayload({
      username: usernameOrPayload,
      password,
    });
  }

  const encUsername = encrypt(String(payload.username || ""));
  const encPayload = encrypt(JSON.stringify(payload));

  const existing = await findExistingCredentialRow(
    db,
    finalHospitalId,
    finalUserId,
    finalProvider
  );

  if (existing) {
    db.run(
      `
      UPDATE credentials
      SET hospital_id=?,
          user_id=?,
          provider=?,
          enc_username=?,
          enc_password=?
      WHERE id=?
      `,
      [
        finalHospitalId,
        finalUserId,
        finalProvider,
        encUsername,
        encPayload,
        existing.id,
      ]
    );
  } else {
    db.run(
      `
      INSERT INTO credentials (
        id,
        hospital_id,
        user_id,
        provider,
        enc_username,
        enc_password
      )
      VALUES (?,?,?,?,?,?)
      `,
      [
        uid(),
        finalHospitalId,
        finalUserId,
        finalProvider,
        encUsername,
        encPayload,
      ]
    );
  }

  await saveDb();
}

async function getCredential(hospitalId, userId, provider) {
  const finalHospitalId = normalizeHospitalId(hospitalId);
  const finalUserId = normalizeUserId(userId);
  const finalProvider = normalizeProvider(provider);

  const db = await getDb();

  let r = db.exec(
    `
    SELECT enc_username, enc_password
    FROM credentials
    WHERE hospital_id=? AND user_id=? AND provider=?
    LIMIT 1
    `,
    [finalHospitalId, finalUserId, finalProvider]
  );

  if (!r[0]?.values?.length) {
    // eski kayıt şeması fallback
    r = db.exec(
      `
      SELECT enc_username, enc_password
      FROM credentials
      WHERE user_id=? AND provider=?
      LIMIT 1
      `,
      [finalUserId, finalProvider]
    );
  }

  if (!r[0]?.values?.length) {
    return null;
  }

  const [encUser, encPass] = r[0].values[0];
  const username = encUser ? decrypt(encUser) : "";

  if (!encPass) {
    return {
      username,
      password: "",
    };
  }

  try {
    const decryptedPayload = decrypt(encPass);
    const parsed = JSON.parse(decryptedPayload);

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const normalized = normalizeCredentialPayload(parsed);

      return {
        username: normalized.username || username || "",
        password: normalized.password || "",
        ...normalized,
      };
    }
  } catch {
    // eski format: enc_password sadece şifreydi
  }

  return {
    username,
    password: decrypt(encPass),
  };
}

async function listCredentials(hospitalId, userId) {
  const finalHospitalId = normalizeHospitalId(hospitalId);
  const finalUserId = normalizeUserId(userId);

  const db = await getDb();

  const r = db.exec(
    `
    SELECT provider
    FROM credentials
    WHERE hospital_id=? AND user_id=?
    `,
    [finalHospitalId, finalUserId]
  );

  if (!r[0]?.values?.length) {
    return [];
  }

  return r[0].values
    .map(([provider]) => String(provider || "").trim())
    .filter(Boolean);
}

async function listCredentialsByHospital(hospitalId) {
  const finalHospitalId = normalizeHospitalId(hospitalId);
  const db = await getDb();

  const r = db.exec(
    `
    SELECT user_id, provider
    FROM credentials
    WHERE hospital_id=?
    `,
    [finalHospitalId]
  );

  if (!r[0]?.values?.length) {
    return [];
  }

  return r[0].values.map(([userId, provider]) => ({
    userId: String(userId || "").trim(),
    provider: String(provider || "").trim(),
  }));
}

module.exports = {
  saveCredential,
  getCredential,
  listCredentials,
  listCredentialsByHospital,
};