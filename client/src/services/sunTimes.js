/**
 * Sunrise / sunset, calculated locally (NOAA solar calculator equations) so no
 * outside website is needed. Accurate to well under a minute for all but the
 * polar regions.
 */

const RAD = Math.PI / 180;
// Sun's centre 90.833 degrees from straight up = its top edge on the horizon,
// including atmospheric refraction. This is the standard sunrise/sunset definition.
const SUNRISE_ZENITH = 90.833;
const UNIX_EPOCH_JD = 2440587.5;
const J2000_JD = 2451545;

/**
 * The sun's declination (radians) and the equation of time (minutes) at a moment
 *
 * @param {Number} jd Julian date
 * @returns {Object} `{ declination, eqTime }`
 */
function sunPosition(jd) {
  const jc = (jd - J2000_JD) / 36525;
  const meanLong = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const eccentricity = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const m = meanAnomaly * RAD;
  const centre =
    Math.sin(m) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * m) * 0.000289;
  const omega = 125.04 - 1934.136 * jc;
  const apparentLong =
    meanLong + centre - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const meanObliquity =
    23 +
    (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const obliquity = (meanObliquity + 0.00256 * Math.cos(omega * RAD)) * RAD;

  const declination = Math.asin(
    Math.sin(obliquity) * Math.sin(apparentLong * RAD)
  );
  const y = Math.tan(obliquity / 2) ** 2;
  const l = meanLong * RAD;
  const eqTime =
    (4 *
      (y * Math.sin(2 * l) -
        2 * eccentricity * Math.sin(m) +
        4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l) -
        0.5 * y * y * Math.sin(4 * l) -
        1.25 * eccentricity * eccentricity * Math.sin(2 * m))) /
    RAD;
  return { declination, eqTime };
}

/**
 * Minutes after 00:00 UTC (of the given day) at which the sun rises or sets
 *
 * @param {Number} midnightJd Julian date of 00:00 UTC of the day
 * @param {Number} guessMinutes when to evaluate the sun's position
 * @param {Number} latitude degrees north
 * @param {Number} longitude degrees east
 * @param {Boolean} rising true for sunrise, false for sunset
 * @returns {Number|null} minutes, or null if the sun doesn't rise/set that day
 */
function eventMinutes(midnightJd, guessMinutes, latitude, longitude, rising) {
  const { declination, eqTime } = sunPosition(midnightJd + guessMinutes / 1440);
  const lat = latitude * RAD;
  const cosHourAngle =
    Math.cos(SUNRISE_ZENITH * RAD) / (Math.cos(lat) * Math.cos(declination)) -
    Math.tan(lat) * Math.tan(declination);
  if (!(cosHourAngle >= -1 && cosHourAngle <= 1)) {
    return null; // polar day or polar night
  }
  const hourAngle = Math.acos(cosHourAngle) / RAD; // degrees
  return 720 - 4 * (longitude + (rising ? hourAngle : -hourAngle)) - eqTime;
}

/**
 * Sunrise and sunset for a place, on the calendar day of `date` (as seen by
 * this computer's clock).
 *
 * @param {Date} date any moment on the day you want
 * @param {Number} latitude degrees north (negative = south)
 * @param {Number} longitude degrees east (negative = west)
 * @returns {Object} `{ sunrise, sunset }` as Dates; either is null when the sun
 *   doesn't rise / doesn't set that day (polar regions)
 */
export function getSunTimes(date, latitude, longitude) {
  const midnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const midnightJd = midnight / 86400000 + UNIX_EPOCH_JD;

  const find = (rising) => {
    // First pass at about solar noon, then refine at the event time itself
    const first = eventMinutes(midnightJd, 720 - 4 * longitude, latitude, longitude, rising);
    if (first === null) {
      return null;
    }
    const refined = eventMinutes(midnightJd, first, latitude, longitude, rising);
    return refined === null ? null : new Date(midnight + refined * 60000);
  };

  return { sunrise: find(true), sunset: find(false) };
}
