import React, { createContext, useState, useEffect, useRef } from "react";
import { getSettings } from "~/settings";
import PropTypes from "prop-types";
import { getCoordsFromApi } from "~/services/geolocation";
import { getSevereAlerts, SEVERE_ALERT_POLL_MS } from "~/severeWeather";
import { getSunTimes } from "~/services/sunTimes";
import axios from "axios";

export const AppContext = createContext();

const TEMP_UNIT_STORAGE_KEY = "tempUnit";
const SPEED_UNIT_STORAGE_KEY = "speedUnit";
const LENGTH_UNIT_STORAGE_KEY = "lengthUnit";
const CLOCK_UNIT_STORAGE_KEY = "clockTime";
const MOUSE_HIDE_STORAGE_KEY = "mouseHide";

// One weather request covers all three: 4 days of daily data, and the hourly
// chart shows the first 24 hours of it.
const FORECAST_LENGTH_MS = 4 * 24 * 60 * 60 * 1000;
const HOURLY_CHART_POINTS = 24;

/**
 * App context provider
 *
 * @param {Object} props
 * @param {Node} props.children
 * @returns {JSX.Element} Context provider
 */
export function AppContextProvider({ children }) {
  const [weatherApiKey, setWeatherApiKey] = useState(null);
  const [mapApiKey, setMapApiKey] = useState(null);
  const [reverseGeoApiKey, setReverseGeoApiKey] = useState(null);
  const [browserGeo, setBrowserGeo] = useState(null);
  const [mapGeo, setMapGeo] = useState(null);
  const [darkMode, setDarkMode] = useState(true);
  const [currentWeatherData, setCurrentWeatherData] = useState(null);
  const [currentWeatherDataErr, setCurrentWeatherDataErr] = useState(null);
  const [currentWeatherDataErrMsg, setCurrentWeatherDataErrMsg] = useState(
    null
  );
  const [hourlyWeatherData, setHourlyWeatherData] = useState(null);
  const [hourlyWeatherDataErr, setHourlyWeatherDataErr] = useState(null);
  const [hourlyWeatherDataErrMsg, setHourlyWeatherDataErrMsg] = useState(null);
  const [dailyWeatherData, setDailyWeatherData] = useState(null);
  const [dailyWeatherDataErr, setDailyWeatherDataErr] = useState(null);
  const [dailyWeatherDataErrMsg, setDailyWeatherDataErrMsg] = useState(null);
  const [panToCoords, setPanToCoords] = useState(null);
  const [markerIsVisible, setMarkerIsVisible] = useState(true);
  const [tempUnit, setTempUnit] = useState("f"); // fahrenheit or celsius
  const [speedUnit, setSpeedUnit] = useState("mph"); // mph or ms for m/s
  const [lengthUnit, setLengthUnit] = useState("in"); // in or mm
  const [clockTime, setClockTime] = useState("12"); // 12h or 24h time for clock
  const [animateWeatherMap, setAnimateWeatherMap] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [customLat, setCustomLat] = useState(null);
  const [customLon, setCustomLon] = useState(null);
  const [mouseHide, setMouseHide] = useState(false);
  const [sunriseTime, setSunriseTime] = useState(null);
  const [sunsetTime, setSunsetTime] = useState(null);
  const [severeAlerts, setSevereAlerts] = useState([]);
  const severeMode = severeAlerts.length > 0;
  const wasSevereMode = useRef(false);

  // Severe weather mode: poll NWS alerts for the home location. On a failed
  // check the last known state is kept, so a network blip can't switch it off.
  const homeLat = browserGeo ? browserGeo.latitude : null;
  const homeLon = browserGeo ? browserGeo.longitude : null;
  useEffect(() => {
    if (homeLat === null || homeLon === null) {
      return undefined;
    }
    const check = () => {
      getSevereAlerts(homeLat, homeLon)
        // Keep the existing list when nothing changed: a fresh (even empty)
        // array counts as new state and re-rendered the whole app every poll.
        .then((alerts) =>
          setSevereAlerts((prev) =>
            JSON.stringify(prev) === JSON.stringify(alerts) ? prev : alerts
          )
        )
        .catch((err) => console.log("severe alert check failed", err));
    };
    check();
    const interval = setInterval(check, SEVERE_ALERT_POLL_MS);
    return () => clearInterval(interval);
  }, [homeLat, homeLon]);

  // Start the radar animation when severe mode begins, stop it when it ends.
  // (Only on the transition, so pressing the play/stop button still works.)
  useEffect(() => {
    if (severeMode !== wasSevereMode.current) {
      wasSevereMode.current = severeMode;
      setAnimateWeatherMap(severeMode);
    }
  }, [severeMode]);

  /**
   * Save mouse hide state
   *
   * @param {Boolean} newVal
   */
  function saveMouseHide(newVal) {
    let newState;
    try {
      newState = JSON.parse(newVal);
    } catch (e) {
      console.log("saveMouseHide", e);
      return;
    }
    setMouseHide(newState);
    window.localStorage.setItem(MOUSE_HIDE_STORAGE_KEY, newState);
  }

  /**
   * Save clock time
   *
   * @param {String} newVal `12` or `24`
   */
  function saveClockTime(newVal) {
    setClockTime(newVal);
    window.localStorage.setItem(CLOCK_UNIT_STORAGE_KEY, newVal);
  }

  /**
   * Save temp unit
   *
   * @param {String} newVal `f` or `c`
   */
  function saveTempUnit(newVal) {
    setTempUnit(newVal);
    window.localStorage.setItem(TEMP_UNIT_STORAGE_KEY, newVal);
  }

  /**
   * Save speed unit
   *
   * @param {String} newVal `mph` or `ms`
   */
  function saveSpeedUnit(newVal) {
    setSpeedUnit(newVal);
    window.localStorage.setItem(SPEED_UNIT_STORAGE_KEY, newVal);
  }

  /**
   * Save length unit
   *
   * @param {String} newVal  `in` or `mm`
   */
  function saveLengthUnit(newVal) {
    setLengthUnit(newVal);
    window.localStorage.setItem(LENGTH_UNIT_STORAGE_KEY, newVal);
  }

  function loadStoredData() {
    const temp = window.localStorage.getItem(TEMP_UNIT_STORAGE_KEY);
    const speed = window.localStorage.getItem(SPEED_UNIT_STORAGE_KEY);
    const length = window.localStorage.getItem(LENGTH_UNIT_STORAGE_KEY);
    const clock = window.localStorage.getItem(CLOCK_UNIT_STORAGE_KEY);

    let mouseHide;
    try {
      mouseHide = JSON.parse(
        window.localStorage.getItem(MOUSE_HIDE_STORAGE_KEY)
      );
    } catch (e) {
      console.log("mouseHide", e);
    }

    setMouseHide(!!mouseHide);
    if (temp) {
      setTempUnit(temp);
    }
    if (speed) {
      setSpeedUnit(speed);
    }
    if (length) {
      setLengthUnit(length);
    }
    if (clock) {
      setClockTime(clock);
    }
  }

  /**
   * Set custom starting lat/lon
   *
   * @returns {Promise} lat/lon
   * @private
   */
  function getCustomLatLon() {
    return new Promise((resolve, reject) => {
      getSettings()
        .then((res) => {
          if (res) {
            const { startingLat, startingLon } = res;
            if (startingLat) {
              setCustomLat(startingLat);
            }
            if (startingLon) {
              setCustomLon(startingLon);
            }
          }
          resolve(res);
        })
        .catch((err) => {
          console.log("could not read settings.json", err);
          reject(err);
        });
    });
  }

  /**
   * Set the map to a given position
   *
   * @param {Object} coords coordinates
   * @param {String} coords.latitude
   * @param {String} coords.longitude
   */
  function setMapPosition(coords) {
    // No weather fetches here: changing `mapGeo` already makes WeatherInfo
    // re-create its update intervals, and each of those fetches immediately.
    // Fetching here as well doubled the API calls per tap (6 instead of 3).
    setMapGeo(coords);
    setPanToCoords(coords);
  }

  /**
   * Return the map position to browser geolocation coordinates
   */
  function resetMapPosition() {
    setMapPosition(browserGeo);
  }

  /**
   * Gets geolocation and sets it, unless custom starting coordinates are provided.
   *
   * @returns {Object} coords
   */
  function getBrowserGeo() {
    return new Promise((resolve, reject) => {
      getCustomLatLon()
        .then((res) => {
          const { startingLat, startingLon } = res;
          if (startingLat && startingLon) {
            const latLon = {
              latitude: parseFloat(startingLat),
              longitude: parseFloat(startingLon),
            };
            setBrowserGeo(latLon);
            setMapGeo(latLon); //Set initial map coords to custom lat/lon
            resolve(latLon);
          } else {
            getCoordsFromApi()
              .then((res) => {
                if (!res) {
                  return reject("Could not get browser geolocation data");
                }
                const { latitude, longitude } = res;
                setBrowserGeo({ latitude, longitude });
                setMapGeo({ latitude, longitude }); //Set initial map coords to browser geolocation
                resolve(res);
              })
              .catch((err) => {
                reject(err);
              });
          }
        })
        .catch((err) => {
          console.log("err!", err);
        });
    });
  }

  /**
   * Retrieves weather API key and sets it
   *
   * @returns {Promise} Weather API Key
   */
  function getWeatherApiKey() {
    return new Promise((resolve, reject) => {
      getSettings()
        .then((res) => {
          if (!res || (res && !res.weatherApiKey)) {
            setSettingsMenuOpen(true);
            return reject("Weather API key missing");
          }
          setWeatherApiKey(res && res.weatherApiKey ? res.weatherApiKey : null);
          resolve();
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  /**
   * Retrieves map API key and sets it
   *
   * @returns {Promise} Weather API Key
   */
  function getMapApiKey() {
    return new Promise((resolve, reject) => {
      getSettings()
        .then((res) => {
          if (!res || (res && !res.mapApiKey)) {
            setSettingsMenuOpen(true);
            return reject("Map API key missing!");
          }
          setMapApiKey(res && res.mapApiKey ? res.mapApiKey : null);
          resolve();
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  /**
   * Retrieves reverse geolocation API key and sets it
   *
   * @returns {Promise} Weather API Key
   */
  function getReverseGeoApiKey() {
    return new Promise((resolve, reject) => {
      getSettings()
        .then((res) => {
          if (!res || (res && !res.reverseGeoApiKey)) {
            return reject("Reverse geolocation API key missing!");
          }
          setReverseGeoApiKey(
            res && res.reverseGeoApiKey ? res.reverseGeoApiKey : null
          );
          resolve();
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  /**
   * Updates current, hourly and daily weather data with ONE API request.
   * Tomorrow.io returns one timeline per requested timestep, so a single call
   * with `timesteps=current,1h,1d` replaces the three separate calls this used
   * to make (a third of the rate-limit use per refresh, tap or page load). The
   * result is split back into the same three pieces of state, in the same
   * shape the components already read.
   *
   * @param {Object} coords
   * @param {Number} coords.latitude latitude
   * @param {Number} coords.longitude longitude
   *
   * @returns {Promise} raw API response data
   */
  function updateWeatherData(coords) {
    setCurrentWeatherDataErr(null);
    setCurrentWeatherDataErrMsg(null);
    setHourlyWeatherDataErr(null);
    setHourlyWeatherDataErrMsg(null);
    setDailyWeatherDataErr(null);
    setDailyWeatherDataErrMsg(null);

    const fail = (message) => {
      setCurrentWeatherDataErr(true);
      setHourlyWeatherDataErr(true);
      setDailyWeatherDataErr(true);
      if (message) {
        setCurrentWeatherDataErrMsg(message);
        setHourlyWeatherDataErrMsg(message);
        setDailyWeatherDataErrMsg(message);
      }
    };

    return new Promise((resolve, reject) => {
      if (!coords) {
        fail();
        return reject("No coords");
      }
      if (!weatherApiKey) {
        fail();
        setSettingsMenuOpen(true);
        return reject("Missing weather API key");
      }
      const { latitude, longitude } = coords;
      const fields = [
        "temperature",
        "humidity",
        "windSpeed",
        "precipitationIntensity",
        "precipitationType",
        "precipitationProbability",
        "cloudCover",
        "weatherCode",
      ].join("%2c");
      const endTime = new Date(new Date().getTime() + FORECAST_LENGTH_MS).toISOString();

      axios
        .get(
          `https://api.tomorrow.io/v4/timelines?location=${latitude}%2C${longitude}&fields=${fields}&timesteps=current%2c1h%2c1d&apikey=${weatherApiKey}&endTime=${endTime}`
        )
        .then((res) => {
          const timelines = res?.data?.data?.timelines || [];
          const current = timelines.find((t) => t.timestep === "current");
          const hourly = timelines.find((t) => t.timestep === "1h");
          const daily = timelines.find((t) => t.timestep === "1d");
          if (!current || !hourly || !daily) {
            fail("Incomplete weather response");
            return reject({ message: "Incomplete weather response" });
          }
          setCurrentWeatherData({ data: { timelines: [current] } });
          setHourlyWeatherData({
            data: {
              timelines: [
                { ...hourly, intervals: hourly.intervals.slice(0, HOURLY_CHART_POINTS) },
              ],
            },
          });
          setDailyWeatherData({ data: { timelines: [daily] } });
          resolve(res.data);
        })
        .catch((err) => {
          fail(err && err.message);
          reject(err);
        });
    });
  }

  /**
   * Sets today's sunrise and sunset for a location. Calculated on this
   * computer (see services/sunTimes.js) instead of asking a website, so it can
   * never fail or go stale. Rounded to the nearest minute, as almanacs do.
   *
   * @param {Object} coords
   * @param {Number} coords.latitude latitude
   * @param {Number} coords.longitude longitude
   *
   * @returns {Promise} `{ sunrise, sunset }` Dates (null if the sun doesn't rise/set today)
   */
  function updateSunriseSunset(coords) {
    return new Promise((resolve, reject) => {
      if (!coords) {
        setSunriseTime(null);
        setSunsetTime(null);
        return reject("No coords");
      }
      const { sunrise, sunset } = getSunTimes(
        new Date(),
        Number(coords.latitude),
        Number(coords.longitude)
      );
      if (sunrise && sunset) {
        const toMinute = (d) => new Date(Math.round(d.getTime() / 60000) * 60000);
        setSunriseTime(toMinute(sunrise).toISOString());
        setSunsetTime(toMinute(sunset).toISOString());
      } else {
        setSunriseTime(null);
        setSunsetTime(null);
      }
      resolve({ sunrise, sunset });
    });
  }

  /**
   * Toggles the marker on and off
   */
  function toggleMarker() {
    setMarkerIsVisible(!markerIsVisible);
  }

  /**
   * Toggles weather map animation on/off
   */
  function toggleAnimateWeatherMap() {
    setAnimateWeatherMap(!animateWeatherMap);
  }

  /**
   * Toggles settings menu open/closed
   */
  function toggleSettingsMenuOpen() {
    setSettingsMenuOpen(!settingsMenuOpen);
  }

  /**
   * Saves settings to `settings.json`
   *
   * @param {Object} settings
   * @param {String} [settings.mapsKey]
   * @param {String} [settings.weatherKey]
   * @param {String} [settings.geoKey]
   * @param {String} [settings.lat]
   * @param {String} [settings.lon]
   * @returns {Promise} Resolves when complete
   */
  function saveSettingsToJson({ mapsKey, weatherKey, geoKey, lat, lon }) {
    return new Promise((resolve, reject) => {
      axios
        .put("/settings", {
          weatherApiKey: weatherKey,
          mapApiKey: mapsKey,
          reverseGeoApiKey: geoKey,
          startingLat: lat,
          startingLon: lon,
        })
        .then((res) => {
          resolve(res);
          setMapApiKey(mapsKey);
          setWeatherApiKey(weatherKey);
          setReverseGeoApiKey(geoKey);
          setCustomLat(lat);
          setCustomLon(lon);
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  const defaultContext = {
    weatherApiKey,
    getWeatherApiKey,
    reverseGeoApiKey,
    getReverseGeoApiKey,
    mapApiKey,
    getMapApiKey,
    browserGeo,
    getBrowserGeo,
    darkMode,
    setDarkMode,
    mapGeo,
    setMapGeo,
    setMapPosition,
    resetMapPosition,
    panToCoords,
    setPanToCoords,
    markerIsVisible,
    toggleMarker,
    tempUnit,
    saveTempUnit,
    speedUnit,
    saveSpeedUnit,
    lengthUnit,
    saveLengthUnit,
    animateWeatherMap,
    toggleAnimateWeatherMap,
    settingsMenuOpen,
    setSettingsMenuOpen,
    toggleSettingsMenuOpen,
    getCustomLatLon,
    customLat,
    customLon,
    loadStoredData,
    clockTime,
    saveClockTime,
    saveSettingsToJson,
    updateWeatherData,
    currentWeatherData,
    currentWeatherDataErr,
    currentWeatherDataErrMsg,
    hourlyWeatherData,
    hourlyWeatherDataErr,
    hourlyWeatherDataErrMsg,
    dailyWeatherData,
    dailyWeatherDataErr,
    dailyWeatherDataErrMsg,
    mouseHide,
    saveMouseHide,
    updateSunriseSunset,
    sunriseTime,
    sunsetTime,
    severeAlerts,
    severeMode,
  };

  return (
    <AppContext.Provider value={defaultContext}>{children}</AppContext.Provider>
  );
}

AppContextProvider.propTypes = {
  children: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.node),
    PropTypes.node,
  ]).isRequired,
};
