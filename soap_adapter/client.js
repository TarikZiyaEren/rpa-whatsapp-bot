const axios = require("axios");

async function sgkProvizyonIstegi(payload) {
  const baseUrl = process.env.SGK_MOCK_BASE_URL || "http://127.0.0.1:7000";

  const resp = await axios.post(`${baseUrl}/sgk/provizyon`, payload, {
    timeout: 10000,
  });

  return resp.data;
}

module.exports = { sgkProvizyonIstegi };