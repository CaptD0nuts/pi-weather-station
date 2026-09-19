// Counts the outbound API calls a built copy of the app makes, and checks what the screen shows.
// Every outside service is faked, so this uses none of your real API quota.
//
//   node api-calls.js [dist folder] [label] [normal|fast] [screenshot-name]
//
// Simulates map taps (skip them with NOTAPS=1) and reports calls at startup, per tap and for the
// location arrow. "fast" fast-forwards every timer longer than 1 s by 600x (10 minutes = 1 second) so refresh
// cadence and retry back-off can be measured in seconds.
// Environment: FAILFIRST=n  the first n weather calls answer HTTP 429 (tests recovery)
//              NOTAPS=1     skip the simulated taps
//              CHROME_PATH  browser executable, if not found automatically
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

const SETTINGS = {
  weatherApiKey: "FAKEWEATHERKEY",
  mapApiKey: "pk.FAKEMAPKEY",
  reverseGeoApiKey: "pk.FAKEGEOKEY",
  startingLat: 36.1627,
  startingLon: -86.7816,
};

const MIME = { ".js": "application/javascript", ".html": "text/html", ".css": "text/css" };
const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  if (url === "/settings") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(SETTINGS));
  }
  const file = path.join(DIST, url === "/" ? "index.html" : url);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(404);
  res.end();
});

let T0 = Date.now();
const iso = (ms) => new Date(Date.now() + ms).toISOString();
function tomorrowResponse(url) {
  const steps = decodeURIComponent(/timesteps=([^&]+)/.exec(url)[1]).split(",");
  const endM = /endTime=([^&]+)/.exec(url);
  const hours = endM ? Math.floor((new Date(decodeURIComponent(endM[1])) - Date.now()) / 3600000) + 1 : 1;
  const mk = (step) => {
    const n = step === "current" ? 1 : step === "1h" ? hours : Math.min(6, Math.ceil(hours / 24) + 1);
    const stepMs = step === "1d" ? 86400000 : 3600000;
    return {
      timestep: step,
      intervals: Array.from({ length: n }, (_, i) => ({
        startTime: iso(i * stepMs),
        values: { temperature: 80 + (i % 5), humidity: 60, windSpeed: 3, precipitationIntensity: 0,
                  precipitationType: 0, precipitationProbability: 5, cloudCover: 10, weatherCode: 1000 },
      })),
    };
  };
  return { data: { timelines: steps.map(mk).reverse() } };
}

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 600 });
  await page.setRequestInterception(true);

  let failLeft = Number(process.env.FAILFIRST || 0);
  const counts = { weather: 0, sunrise: 0, geocode: 0, alerts: 0, radarList: 0 };
  const log = [];
  page.on("request", (req) => {
    const u = req.url();
    if (u.startsWith(`http://127.0.0.1:${port}`)) return req.continue();
    const cors = { "access-control-allow-origin": "*" };
    const json = (obj) => req.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(obj) });
    if (u.includes("api.tomorrow.io/v4/timelines")) {
      if (failLeft > 0) { failLeft--; log.push("+" + (Date.now() - T0) + "ms weather -> 429"); return req.respond({ status: 429, headers: cors, contentType: "application/json", body: JSON.stringify({ code: 429001 }) }); }
      counts.weather++; log.push("+" + (Date.now() - T0) + "ms weather OK");
      return json(tomorrowResponse(u));
    }
    if (u.includes("sunrise-sunset.org")) { counts.sunrise++; return json({ results: { sunrise: iso(-40000000), sunset: iso(10000000) } }); }
    if (u.includes("locationiq") || u.includes("reverse")) { counts.geocode++; return json({ address: { city: "Testville", state: "Alabama", country_code: "us", country: "USA" } }); }
    if (u.includes("api.weather.gov")) { counts.alerts++; return json({ features: [] }); }
    if (u.includes("weather-maps.json")) { counts.radarList++; return json({ host: "https://tilecache.rainviewer.com", radar: { past: [{ time: 1, path: "/v2/radar/x" }] } }); }
    // tiles / fonts / anything else: empty 1x1 response, never leaves the machine
    return req.respond({ status: 200, headers: cors, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") });
  });

  const click = (x, y) => (process.env.NOTAPS ? null : page.mouse.click(x, y));
  const snap = () => ({ ...counts });
  const diff = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, b[k] - a[k]]));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const FAST = process.argv[4] === "fast";
  T0 = Date.now();
  if (FAST) await page.evaluateOnNewDocument(() => { const o = window.setInterval; window.setInterval = (fn, ms, ...a) => o(fn, ms > 1000 ? ms / 600 : ms, ...a); const t = window.setTimeout; window.setTimeout = (fn, ms, ...a) => t(fn, ms > 1000 ? ms / 600 : ms, ...a); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await wait(6000);
  const afterLoad = snap();
  const loadCalls = log.slice();
  const startupText = await page.evaluate(() => document.body.innerText);
  const startupState = /Could not retrieve/.test(startupText)
    ? "ERROR PANEL: " + (startupText.match(/Request failed[^\n]*/) || ["(no message)"])[0]
    : /Testville/.test(startupText) ? "weather data shown" : "loading spinner (no data yet)";
  await page.screenshot({ path: path.join(require("os").tmpdir(), "weather-test-shot-startup-" + (process.argv[5] || "x") + ".png") });

  // Tap 1: click on the map away from the marker (Leaflet click -> setMapPosition)
  log.length = 0;
  await click(200, 300);
  await wait(3500);
  const afterTap1 = snap();
  const tap1Log = log.slice();

  // Tap 2: another spot
  log.length = 0;
  await click(400, 450);
  await wait(3500);
  const afterTap2 = snap();

  // Reset arrow button (bottom of info panel, first button)
  log.length = 0;
  await click(755, 585);
  await wait(3500);
  const afterReset = snap();
  const resetLog = log.slice();

  const panelText = await page.evaluate(() => document.body.innerText);
  const { getSunTimes } = await require("./load-modules.js").loadSunTimes();
  const st = getSunTimes(new Date(), 36.1627, -86.7816);
  const fmtT = (d) => new Date(Math.round(d.getTime() / 60000) * 60000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const norm = (x) => x.replace(/[\s\u202f\u00a0]+/g, "");
  const expectSun = fmtT(st.sunrise) + " / " + fmtT(st.sunset);
  const shows = {
    sunTimesOnScreen: norm(startupText).includes(norm(fmtT(st.sunrise))) && norm(startupText).includes(norm(fmtT(st.sunset))),
    expectedSun: expectSun,
    weatherShown: /Testville/.test(panelText),
    sunriseSunset: /AM|PM/.test(panelText),
    noErrorText: !/Could not retrieve|Cannot get/.test(panelText),
  };
  await page.screenshot({ path: path.join(require("os").tmpdir(), "weather-test-shot-" + (process.argv[5] || "x") + ".png") });
  let fastReport = null;
  if (FAST) {
    log.length = 0;
    const a = snap();
    await wait(5500);
    fastReport = "FAST idle 5.5s (10min=1s, 1h=6s): " + JSON.stringify(diff(a, snap())) + " -> " + log.join(", ");
  }
  console.log(`\n=== ${LABEL} ===`);
  console.log("screen 6s after load:", startupState);
  console.log("page shows data:", JSON.stringify(shows));
  if (fastReport) console.log(fastReport);
  console.log("startup      :", JSON.stringify(afterLoad), "->", loadCalls.join(", "));
  console.log("tap 1  (+)   :", JSON.stringify(diff(afterLoad, afterTap1)), "->", tap1Log.join(", "));
  console.log("tap 2  (+)   :", JSON.stringify(diff(afterTap1, afterTap2)));
  console.log("reset arrow(+):", JSON.stringify(diff(afterTap2, afterReset)), "->", resetLog.join(", "));
  await browser.close();
  server.close();
})().catch((e) => { console.error("TEST ERROR", e); process.exit(1); });
