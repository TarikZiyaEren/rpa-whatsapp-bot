const axios = require("axios");

async function provizyonGonder(payload) {
  const baseUrl = process.env.MEDULA_BASE_URL || "http://127.0.0.1:6000";

  const resp = await axios.post(`${baseUrl}/medula/provizyon`, payload, {
    timeout: 10000,
  });

  return resp.data;
}

module.exports = { provizyonGonder };