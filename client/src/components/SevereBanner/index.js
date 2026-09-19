import React, { useContext } from "react";
import { AppContext } from "~/AppContext";
import styles from "./styles.css";

/**
 * Red banner across the top of the map while severe weather mode is active
 *
 * @returns {JSX.Element|null} Banner, or nothing when there is no severe alert
 */
const SevereBanner = () => {
  const { severeMode, severeAlerts } = useContext(AppContext);

  if (!severeMode) {
    return null;
  }
  const names = [...new Set(severeAlerts.map((a) => a.event))];
  return (
    <div className={styles.banner}>
      <span className={styles.icon}>&#9888;</span> {names.join("  •  ")}
    </div>
  );
};

export default SevereBanner;
