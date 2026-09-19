// Compares client/src/services/sunTimes.js with the US Naval Observatory's sunrise/sunset service (the official
// reference; it publishes whole minutes). Needs the network.
const { getSunTimes } = await (await import("./load-modules.js")).default.loadSunTimes();
const cases = [["Nashville TN", 36.1627, -86.7816, "2026-09-18", -5], ["Nashville TN", 36.1627, -86.7816, "2026-12-21", -6], ["Nashville TN", 36.1627, -86.7816, "2026-06-21", -5], ["Anchorage", 61.2181, -149.9003, "2026-06-21", -8]];
const fmt = (d, off) => { const t = new Date(d.getTime() + off * 3600000); return t.toISOString().slice(11, 19); };
for (const [name, lat, lon, ds, tz] of cases) {
  const url = `https://aa.usno.navy.mil/api/rstt/oneday?date=${ds}&coords=${lat},${lon}&tz=${tz}`;
  try {
    const r = await fetch(url); const j = await r.json();
    const dd = j.properties?.data || j.properties?.data;
    const sd = j.properties?.data?.sundata;
    const rise = sd?.find((x) => x.phen === "Rise")?.time, set = sd?.find((x) => x.phen === "Set")?.time;
    const [y, m, d] = ds.split("-").map(Number);
    const mine = getSunTimes(new Date(y, m - 1, d, 12), lat, lon);
    const [rh, rm] = rise.split(":").map(Number), [sh, sm] = set.split(":").map(Number);
    const mineRise = fmt(mine.sunrise, tz), mineSet = fmt(mine.sunset, tz);
    console.log(`${name} ${ds} (UTC${tz}): USNO rise ${rise} set ${set}  |  mine rise ${mineRise.slice(0,5)}(${mineRise.slice(6)}s) set ${mineSet.slice(0,5)}(${mineSet.slice(6)}s)`);
  } catch (e) { console.log(name, ds, "USNO lookup failed:", e.message); }
  await new Promise((r) => setTimeout(r, 800));
}
