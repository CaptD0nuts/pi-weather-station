import React, { useEffect, useState, useContext } from "react";
import { AppContext } from "~/AppContext";
import { format } from "date-fns";
import styles from "./styles.css";
import SunRiseSet from "~/components/SunRiseSet";

/**
 * Displays time and date
 *
 * @returns {JSX.Element} Clock component
 */
const Clock = () => {
  const { clockTime } = useContext(AppContext);
  const [date, setDate] = useState(new Date().getTime());

  // Only hours:minutes and the date are shown, so update once a minute, just
  // after the minute changes (not every second: 59 of every 60 redraws of the
  // clock, and the sunrise/sunset inside it, changed nothing). The delay is
  // recalculated from the real time on every tick, so it stays on the minute
  // and corrects itself if the system clock is stepped (e.g. by NTP).
  useEffect(() => {
    let timer;
    const tick = () => {
      const now = new Date().getTime();
      setDate((prev) =>
        Math.floor(prev / 60000) === Math.floor(now / 60000) ? prev : now
      );
      timer = setTimeout(tick, 60000 - (now % 60000) + 50);
    };
    timer = setTimeout(
      tick,
      60000 - (new Date().getTime() % 60000) + 50
    );
    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <div>
      <div className={styles.date}>
        {format(date, "cccc").toUpperCase()}{" "}
        {format(date, "LLLL").toUpperCase()} {format(date, "d")}
      </div>
      <div className={styles.time}>{format(date, clockTime === "12" ? "p" : "HH:mm")}</div>
      <div className={styles.sunRiseSetContainer}>
        <SunRiseSet/>
      </div>
    </div>
  );
};

export default Clock;
