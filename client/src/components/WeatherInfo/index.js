import React, { useEffect, useContext, useState } from "react";
import Spinner from "~/components/Spinner";
import { AppContext } from "~/AppContext";
import styles from "./styles.css";
import LocationName from "~/components/LocationName";
import CurrentWeather from "~/components/CurrentWeather";
import DailyChart from "~/components/weatherCharts/DailyChart";
import HourlyChart from "~/components/weatherCharts/HourlyChart";
import {
  NORMAL_WEATHER_REFRESH_MS,
  SEVERE_WEATHER_REFRESH_MS,
} from "~/severeWeather";
import { startRefreshLoop } from "~/services/refresh";

const SUNRISE_SUNSET_UPDATE_INTERVAL = 60 * 60 * 1000; //every hour

/**
 * Displays weather info
 *
 * @returns {JSX.Element} Clock component
 */
const WeatherInfo = () => {
  const {
    getWeatherApiKey,
    getReverseGeoApiKey,
    reverseGeoApiKey,
    updateWeatherData,
    mapGeo,
    weatherApiKey,
    currentWeatherDataErr,
    currentWeatherDataErrMsg,
    darkMode,
    setSettingsMenuOpen,
    currentWeatherData,
    updateSunriseSunset,
    severeMode,
  } = useContext(AppContext);

  const [err, setErr] = useState(null);

  useEffect(() => {
    setErr(false);
    if (!weatherApiKey) {
      getWeatherApiKey().catch((err) => {
        console.log("error getting weather api key:", err);
        setErr(true);
        setSettingsMenuOpen(true);
      });
    }
    if (!reverseGeoApiKey) {
      getReverseGeoApiKey().catch((err) => {
        console.log("error getting reverse geo api key:", err);
      });
    }
  }, [weatherApiKey, reverseGeoApiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Current conditions + hourly chart + daily chart: ONE request per refresh,
  // every 10 minutes normally and every 5 in severe weather mode. A failed
  // refresh is retried after 1, 2, 4... minutes (see startRefreshLoop).
  useEffect(() => {
    if (!weatherApiKey || !mapGeo) {
      return undefined;
    }
    return startRefreshLoop({
      run: () => updateWeatherData(mapGeo),
      intervalMs: severeMode
        ? SEVERE_WEATHER_REFRESH_MS
        : NORMAL_WEATHER_REFRESH_MS,
    });
  }, [weatherApiKey, mapGeo, severeMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sunrise / sunset are calculated locally (no network, no API key). They only
  // change by about a minute a day; recalculating hourly also handles midnight.
  useEffect(() => {
    if (!mapGeo) {
      return undefined;
    }
    return startRefreshLoop({
      run: () => updateSunriseSunset(mapGeo),
      intervalMs: SUNRISE_SUNSET_UPDATE_INTERVAL,
    });
  }, [mapGeo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (currentWeatherData) {
    return (
      <div className={styles.container}>
        <div className={styles.location}>
          <LocationName />
        </div>
        <div>
          <CurrentWeather />
        </div>
        <div className={styles.weatherChart}>
          <HourlyChart />
        </div>
        <div className={styles.weatherChart}>
          <DailyChart />
        </div>
      </div>
    );
  } else if (currentWeatherData || currentWeatherDataErr || err) {
    return (
      <div
        className={`${styles.errContainer} ${
          darkMode ? styles.dark : styles.light
        }`}
      >
        <div>Could not retrieve weather data.</div>
        <div>Is your weather API key valid?</div>
        {currentWeatherDataErr ? (
          <div className={styles.message}>{currentWeatherDataErrMsg}</div>
        ) : null}
      </div>
    );
  } else {
    return (
      <div className={styles.loadingContainer}>
        <Spinner size={"20px"} color={darkMode ? "#f6f6f444" : "#3a393844"} />
      </div>
    );
  }
};

export default WeatherInfo;
