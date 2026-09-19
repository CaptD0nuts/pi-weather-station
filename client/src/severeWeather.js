import axios from "axios";

/**
 * Severe weather mode
 *
 * Polls the free National Weather Service alerts feed (no API key) for the
 * home location. While any alert matching SEVERE_EVENT_PATTERNS is active
 * (or a Special Weather Statement about a storm hazard, see below), the
 * display refreshes radar + current conditions faster, starts the radar
 * animation and shows a banner. Edit the lists below to change what counts.
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

// A Special Weather Statement is what the NWS issues for a strong storm that is
// not (yet) a Watch or Warning, e.g. "a strong thunderstorm ... wind gusts up to
// 45 mph and pea size hail". It is also used for fog, smoke, heat and more, so
// it only counts when its text is about one of these hazards. First match wins.
export const STORM_STATEMENT_HAZARDS = [
  { pattern: /thunderstorm|lightning|hail/i, label: "Strong thunderstorm" },
  { pattern: /tornado|waterspout|funnel cloud/i, label: "Tornado or waterspout" },
  { pattern: /flood/i, label: "Flooding" },
];

/**
 * Which storm hazard, if any, does the text of a Special Weather Statement describe?
 *
 * @param {String} text the alert's headline and description
 * @returns {String|null} short label such as "Strong thunderstorm", or null
 */
export function statementHazard(text) {
  const hit = STORM_STATEMENT_HAZARDS.find((h) => h.pattern.test(text || ""));
  return hit ? hit.label : null;
}

/**
 * The name to show for an NWS alert if it should trigger severe weather mode,
 * otherwise null. Only real alerts count (status "Actual", not "Test").
 *
 * @param {Object} props one alert's `properties` from the NWS feed
 * @returns {String|null} banner name, or null when the alert is not severe
 */
export function severeAlertName(props) {
  const p = props || {};
  if (p.status !== "Actual") {
    return null;
  }
  if (isSevereEvent(p.event)) {
    return p.event;
  }
  if (/special weather statement/i.test(p.event || "")) {
    const hazard = statementHazard(`${p.headline || ""} ${p.description || ""}`);
    if (hazard) {
      return `Weather Statement: ${hazard}`;
    }
  }
  return null;
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
        .map((p) => ({ event: severeAlertName(p), headline: p.headline }))
        .filter((a) => a.event);
    });
}
