// Counts React re-renders ("commits") while the 5-minute alert check runs on a quiet day, and checks that the
// severe-weather banner still appears (for a Tornado Warning), ignores a Heat Advisory, and clears again.
// Only the 5-minute timer is fast-forwarded (300000 ms -> 300 ms). All outside services are faked.
//   node alerts.js [dist folder] [label]
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const DIST = process.argv[2] || path.join(__dirname, "..", "client", "dist");
const LABEL = process.argv[3] || DIST;
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("No Chrome/Chromium found. Set CHROME_PATH to its executable.");
  return found;
}
const CHROME = findChrome();
const SETTINGS = { weatherApiKey: "FAKE", mapApiKey: "pk.FAKE", reverseGeoApiKey: "pk.FAKE", startingLat: 36.1627, startingLon: -86.7816 };
const MIME = { ".js": "application/javascript", ".html": "text/html", ".css": "text/css" };

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  if (url === "/settings") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(SETTINGS)); }
  const file = path.join(DIST, url === "/" ? "index.html" : url);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) { res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" }); return fs.createReadStream(file).pipe(res); }
  res.writeHead(404); res.end();
});

const iso = (ms) => new Date(Date.now() + ms).toISOString();
const tomorrow = (url) => {
  const steps = decodeURIComponent(/timesteps=([^&]+)/.exec(url)[1]).split(",");
  const endM = /endTime=([^&]+)/.exec(url);
  const hours = endM ? Math.floor((new Date(decodeURIComponent(endM[1])) - Date.now()) / 3600000) + 1 : 1;
  const mk = (step) => ({ timestep: step, intervals: Array.from({ length: step === "current" ? 1 : step === "1h" ? hours : 6 }, (_, i) => ({ startTime: iso(i * (step === "1d" ? 86400000 : 3600000)), values: { temperature: 25, humidity: 60, windSpeed: 3, precipitationIntensity: 0, precipitationType: 0, precipitationProbability: 5, cloudCover: 10, weatherCode: 1000 } })) });
  return { data: { timelines: steps.map(mk).reverse() } };
};

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 600 });
  await page.setRequestInterception(true);

  // NWS alert fixtures (text modelled on real alerts, place names replaced)
  const props = (event, description = "") => ({ properties: { status: "Actual", event, headline: event + " issued by the NWS", description } });
  const STRONG_STORM = "At 113 PM CDT, Doppler radar was tracking a strong thunderstorm near Exampleville, moving south at 10 mph. HAZARD...Wind gusts up to 45 mph and pea size hail.";
  const FOG = "Areas of dense fog with visibility below one quarter mile.";
  const HEAT = "Heat index values near 105 degrees.";
  const FEATURES = {
    none: [],
    tornado: [props("Tornado Warning"), props("Heat Advisory", HEAT)],
    // a strong-storm Special Weather Statement, plus a fog statement and a heat advisory that must be ignored
    statement: [props("Special Weather Statement", STRONG_STORM), props("Special Weather Statement", FOG), props("Heat Advisory", HEAT)],
    fogonly: [props("Special Weather Statement", FOG)],
  };
  let alertMode = "none";
  let alertPolls = 0;
  page.on("request", (req) => {
    const u = req.url();
    if (u.startsWith(`http://127.0.0.1:${port}`)) return req.continue();
    const cors = { "access-control-allow-origin": "*" };
    const json = (o) => req.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("api.tomorrow.io")) return json(tomorrow(u));
    if (u.includes("sunrise-sunset")) return json({ results: { sunrise: iso(-40000000), sunset: iso(10000000) } });
    if (u.includes("locationiq") || u.includes("reverse")) return json({ address: { city: "Testville", state: "Alabama", country_code: "us", country: "USA" } });
    if (u.includes("api.weather.gov")) {
      alertPolls++;
      return json({ features: FEATURES[alertMode] });
    }
    if (u.includes("weather-maps.json")) return json({ host: "https://tilecache.rainviewer.com", radar: { past: [{ time: 1, path: "/v2/radar/x" }] } });
    return req.respond({ status: 200, headers: cors, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") });
  });

  await page.evaluateOnNewDocument(() => {
    window.__commits = 0;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; }, onCommitFiberRoot() { window.__commits++; }, onCommitFiberUnmount() {}, isDisabled: false, checkDCE() {} };
    const si = window.setInterval;
    window.setInterval = (fn, ms, ...a) => si(fn, ms === 300000 ? 300 : ms, ...a);
  });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 5000)); // let startup loads finish
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const commits = () => page.evaluate(() => window.__commits);

  // A) quiet day: 4 s of polls that all return "no alerts"
  const c0 = await commits(), p0 = alertPolls;
  await wait(4000);
  const c1 = await commits(), p1 = alertPolls;

  // B) banner: alert starts (Tornado Warning + an ignored Heat Advisory), then clears
  alertMode = "tornado";
  await wait(1500);
  const textOn = await page.evaluate(() => document.body.innerText);
  alertMode = "none";
  await wait(1500);
  const textOff = await page.evaluate(() => document.body.innerText);

  // C) a Special Weather Statement about a strong thunderstorm (what the NWS issues before a warning) shows the
  //    banner; fog and heat statements alone do not
  alertMode = "statement";
  await wait(1500);
  const textStatement = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: path.join(require("os").tmpdir(), "weather-test-shot-statement.png") });
  alertMode = "fogonly";
  await wait(1500);
  const textFogOnly = await page.evaluate(() => document.body.innerText);

  console.log(`\n=== ${LABEL} ===`);
  console.log(`quiet 4 s: ${p1 - p0} alert polls, ${c1 - c0} React re-renders (the clock alone accounts for ~4)`);
  console.log("banner shows TORNADO WARNING when alert active :", /TORNADO WARNING/.test(textOn));
  console.log("ignored Heat Advisory not shown                :", !/HEAT ADVISORY/.test(textOn));
  console.log("banner gone after alert clears                 :", !/TORNADO WARNING/.test(textOff));
  console.log("strong-thunderstorm statement shows a banner   :", /WEATHER STATEMENT: STRONG THUNDERSTORM/.test(textStatement));
  console.log("fog statement + heat advisory in it not shown  :", !/DENSE FOG|HEAT ADVISORY/.test(textStatement));
  console.log("a fog-only statement shows no banner           :", !/WEATHER STATEMENT/.test(textFogOnly));
  await browser.close();
  server.close();
})().catch((e) => { console.error("TEST ERROR", e); process.exit(1); });
