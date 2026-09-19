import axios from "axios";

/**
 * Severe weather mode
 *
 * Polls the free National Weather Service alerts feed (no API key) for the
 * home location. While any alert matching SEVERE_EVENT_PATTERNS is active,
 * the display refreshes radar + current conditions faster, starts the radar
 * animation and shows a banner. Edit the list below to change what counts.
 */

// Matched (case-insensitive) against the NWS "event" name, e.g.
// "Tornado Warning", "Severe Thunderstorm Watch". Watches AND warnings count.
export const SEVERE_EVENT_PATTERNS = [
  /tornado/i,
  /severe thunderstorm/i,
  /flash flood/i,
  /hurricane/i,
  /tropical storm/i,
  /extreme wind/i,
  /storm surge/i,
  /blizzard/i,
  /ice storm/i,
  /winter storm/i,
];

export const SEVERE_ALERT_POLL_MS = 5 * 60 * 1000; // check for alerts every 5 min
export const NORMAL_RADAR_REFRESH_MS = 10 * 60 * 1000;
export const SEVERE_RADAR_REFRESH_MS = 5 * 60 * 1000;
// Current conditions, hourly chart and daily chart all refresh together (one call)
export const NORMAL_WEATHER_REFRESH_MS = 10 * 60 * 1000;
export const SEVERE_WEATHER_REFRESH_MS = 5 * 60 * 1000;

/**
 * Is this NWS event name one that should trigger severe weather mode?
 *
 * @param {String} eventName NWS event name
 * @returns {Boolean} true if severe
 */
export function isSevereEvent(eventName) {
  return SEVERE_EVENT_PATTERNS.some((re) => re.test(eventName || ""));
}

/**
 * Gets the active severe alerts for a location. Adding `?severe=test` to the
 * page URL fakes one, to preview severe mode without real weather.
 *
 * @param {Number} latitude
 * @param {Number} longitude
 * @returns {Promise<Array>} Active severe alerts: `{ event, headline }`
 */
export function getSevereAlerts(latitude, longitude) {
  if (/[?&]severe=test\b/.test(window.location.search)) {
    return Promise.resolve([
      { event: "Tornado Warning (TEST)", headline: "Test alert" },
    ]);
  }
  return axios
    .get(
      `https://api.weather.gov/alerts/active?point=${Number(latitude).toFixed(
        4
      )},${Number(longitude).toFixed(4)}`
    )
    .then((res) => {
      const features = (res.data && res.data.features) || [];
      return features
        .map((f) => f.properties || {})
        .filter((p) => p.status === "Actual" && isSevereEvent(p.event))
        .map((p) => ({ event: p.event, headline: p.headline }));
    });
}
