// Compares client/src/services/sunTimes.js with the live sunrise-sunset.org API (what the app used before).
// Uses the network (about 30 requests, paced). The website runs ~65-100 s off the official definition, so a
// steady offset of that size is expected; see usno-check.mjs for the reference comparison.
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const { getSunTimes } = await (await import("./load-modules.js")).default.loadSunTimes();

const places = [
  ["Nashville TN", 36.1627, -86.7816],
  ["Sydney (south, far east)", -33.8688, 151.2093],
  ["Tokyo", 35.6762, 139.6503],
  ["Quito (equator)", -0.1807, -78.4678],
  ["Anchorage (high lat)", 61.2181, -149.9003],
  ["Reykjavik (very high lat)", 64.1466, -21.9426],
  ["Tromso (polar)", 69.6492, 18.9553],
];
const dates = ["2026-03-20", "2026-06-21", "2026-09-18", "2026-12-21"];

const DAY = 86400;
// difference in seconds, folded so a one-day offset in how each side assigns "the day" doesn't matter
const fold = (a, b) => { let d = (a - b) / 1000; d = ((d + DAY / 2) % DAY + DAY) % DAY - DAY / 2; return d; };

let worst = 0, n = 0, polarMismatch = 0;
const rows = [];
for (const [name, lat, lon] of places) {
  for (const ds of dates) {
    const [y, m, d] = ds.split("-").map(Number);
    const mine = getSunTimes(new Date(y, m - 1, d, 12), lat, lon);
    let api;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&date=${ds}&formatted=0`);
        api = (await r.json()).results;
        if (api) break;
      } catch (e) { /* retry */ }
      await new Promise((r) => setTimeout(r, 1500));
    }
    await new Promise((r) => setTimeout(r, 1100));
    if (!api) { rows.push(`${name.padEnd(28)} ${ds}  API unavailable`); continue; }
    const apiRise = new Date(api.sunrise), apiSet = new Date(api.sunset);
    const apiPolar = apiRise.getUTCFullYear() === 1970 || apiSet.getUTCFullYear() === 1970;
    const minePolar = !mine.sunrise || !mine.sunset;
    if (apiPolar || minePolar) {
      const agree = apiPolar === minePolar;
      if (!agree) polarMismatch++;
      rows.push(`${name.padEnd(28)} ${ds}  polar case: API ${apiPolar ? "no rise/set" : "normal"}, mine ${minePolar ? "no rise/set" : "normal"} -> ${agree ? "AGREE" : "DIFFER"}`);
      continue;
    }
    const dr = fold(mine.sunrise, apiRise), ds2 = fold(mine.sunset, apiSet);
    worst = Math.max(worst, Math.abs(dr), Math.abs(ds2)); n += 2;
    rows.push(`${name.padEnd(28)} ${ds}  sunrise ${dr >= 0 ? "+" : ""}${dr.toFixed(0).padStart(3)}s   sunset ${ds2 >= 0 ? "+" : ""}${ds2.toFixed(0).padStart(3)}s`);
  }
}
console.log(rows.join("\n"));
console.log(`\ncompared ${n} sunrise/sunset times; largest difference: ${worst.toFixed(0)} seconds; polar disagreements: ${polarMismatch}`);
