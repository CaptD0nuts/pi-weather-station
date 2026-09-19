const axios = require("axios");

/**
 * Gets coordinates from an external API
 *
 * The lookup service is free and rate limited (HTTP 429 when a home connection asks too often), so a failure
 * answers with a short message and a status the client can tell apart, never the raw error object.
 */
function getCoords(req, res) {
  axios
    .get("https://ipapi.co/json/")
    .then((result) => {
      return res.status(result.status).json(result.data).end();
    })
    .catch((err) => {
      const upstream = err && err.response && err.response.status;
      const message = upstream === 429
        ? "The location lookup service is rate limiting this connection; try again later."
        : "Could not look up the location.";
      return res.status(upstream === 429 ? 429 : 502).json({ message }).end();
    });
}

module.exports = {
  getCoords,
};
