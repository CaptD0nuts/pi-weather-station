// End-to-end test of the app's Settings menu: starts a scratch copy of the REAL server with FAKE keys, opens the
// built app in headless Chrome, changes the custom latitude/longitude, clicks Save, and checks what the server
// wrote to its settings.json. Saving replaces the whole file with what the app sends, so this test never touches
// your real settings.json: everything happens in a temporary folder that is deleted afterwards.
//
//   node settings-save.js [dist folder]
//
// Needs the server's dependencies (run `npm install` in the repo root), or point PROJECT_NODE_MODULES at any
// node_modules folder that has them. The server listens on the fixed port 8080, which must be free.
// Every outside service (weather, alerts, radar...) is faked; the only real traffic is to the local scratch server.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-core");

const ROOT = path.join(__dirname, "..");
const DIST = process.argv[2] || path.join(ROOT, "client", "dist");
const NODE_MODULES = process.env.PROJECT_NODE_MODULES || path.join(ROOT, "node_modules");

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

const FAKE = {
  weatherApiKey: "FAKE-WEATHER-KEY-0000",
  mapApiKey: "pk.FAKE-MAP-KEY-0000",
  reverseGeoApiKey: "pk.FAKE-GEO-KEY-0000",
  startingLat: 36.1627,
  startingLon: -86.7816,
};
const NEW_LAT = "35.5", NEW_LON = "-85.25";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (ms) => new Date(Date.now() + ms).toISOString();

function fakeWeather(url) {
  const steps = decodeURIComponent(/timesteps=([^&]+)/.exec(url)[1]).split(",");
  const mk = (step) => ({
    timestep: step,
    intervals: Array.from({ length: step === "current" ? 1 : step === "1h" ? 24 : 5 }, (_, i) => ({
      startTime: iso(i * (step === "1d" ? 86400000 : 3600000)),
      values: { temperature: 20, humidity: 60, windSpeed: 3, precipitationIntensity: 0, precipitationType: 0, precipitationProbability: 5, cloudCover: 10, weatherCode: 1000 },
    })),
  });
  return { data: { timelines: steps.map(mk) } };
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b })); }).on("error", reject);
  });
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "weather-settings-test-"));
  let server, browser, serverLog = "";
  const results = [];
  const check = (label, ok) => { results.push(ok); console.log((ok ? "PASS  " : "FAIL  ") + label); };
  try {
    // scratch copy of the app: server/, client/dist, package.json (for the version) and a FAKE settings.json
    fs.cpSync(path.join(ROOT, "server"), path.join(tmp, "server"), { recursive: true });
    fs.cpSync(DIST, path.join(tmp, "client", "dist"), { recursive: true });
    fs.copyFileSync(path.join(ROOT, "package.json"), path.join(tmp, "package.json"));
    const settingsFile = path.join(tmp, "settings.json");
    fs.writeFileSync(settingsFile, JSON.stringify(FAKE));

    server = spawn(process.execPath, [path.join(tmp, "server", "index.js")], { env: { ...process.env, NODE_PATH: NODE_MODULES }, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout.on("data", (d) => (serverLog += d));
    server.stderr.on("data", (d) => (serverLog += d));
    let up = false;
    for (let i = 0; i < 40 && !up; i++) { try { up = (await get("http://localhost:8080/settings")).status === 200; } catch (e) { await wait(250); } }
    if (!up) throw new Error("the scratch server did not start on port 8080 (is the port free? are the server dependencies installed?)\n" + serverLog.slice(0, 400));

    browser = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 600 });
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const u = req.url();
      if (u.startsWith("http://localhost:8080")) return req.continue();
      const cors = { "access-control-allow-origin": "*" };
      const json = (o) => req.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(o) });
      if (u.includes("api.tomorrow.io")) return json(fakeWeather(u));
      if (u.includes("locationiq") || u.includes("reverse")) return json({ address: { city: "Testville", state: "Alabama", country_code: "us", country: "USA" } });
      if (u.includes("api.weather.gov")) return json({ features: [] });
      if (u.includes("weather-maps.json")) return json({ host: "https://tilecache.rainviewer.com", radar: { past: [{ time: 1, path: "/v2/radar/x" }] } });
      return req.respond({ status: 200, headers: cors, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") });
    });

    await page.goto("http://localhost:8080/", { waitUntil: "load" });
    await wait(4000);
    const shown = await page.evaluate(() => document.body.innerText);
    check("the app loaded its settings from the real server and shows weather", /Testville/.test(shown));

    // Open the Settings menu, fill in lat/lon, click Save. The menu can already be open (the app opens it by
    // itself when a key is missing), so only click the gear if it is not; and click it through the page itself,
    // not by screen position: in headless Chrome the info panel grows taller than the window, which pushes
    // the button bar out of view.
    const inputCount = () => page.evaluate(() => document.querySelectorAll("input").length);
    if ((await inputCount()) !== 5) {
      await page.evaluate(() => document.querySelector('[class*="ControlButtons"]').lastElementChild.click());
    }
    let opened = false;
    try { await page.waitForFunction(() => document.querySelectorAll("input").length === 5, { timeout: 6000 }); opened = true; } catch (e) { /* reported below */ }
    await wait(600); // let the open animation finish
    check("the Settings menu is open with 5 text fields", opened);
    for (const [idx, val] of [[3, NEW_LAT], [4, NEW_LON]]) {
      // focus the field and select its old text, then type over it like a user would
      await page.evaluate((i) => { const el = document.querySelectorAll("input")[i]; el.focus(); el.select(); }, idx);
      await page.keyboard.type(val);
    }
    const typed = await page.evaluate(() => [...document.querySelectorAll("input")].slice(3).map((i) => i.value));
    check("the typed latitude and longitude are in the fields" + (typed[0] === NEW_LAT && typed[1] === NEW_LON ? "" : " (fields contain: " + JSON.stringify(typed) + ")"), typed[0] === NEW_LAT && typed[1] === NEW_LON);
    const save = await page.$('[class*="save-button"]');
    check("found the Save button", !!save);
    await save.click();
    await wait(2000);

    let saved = null;
    try { saved = JSON.parse(fs.readFileSync(settingsFile, "utf8")); } catch (e) { /* reported below */ }
    check("settings.json on the server is still valid JSON", !!saved);
    check("the new latitude and longitude were saved", !!saved && String(saved.startingLat) === NEW_LAT && String(saved.startingLon) === NEW_LON);
    check("the API keys in the file were kept unchanged", !!saved && saved.weatherApiKey === FAKE.weatherApiKey && saved.mapApiKey === FAKE.mapApiKey && saved.reverseGeoApiKey === FAKE.reverseGeoApiKey);
    const fields = saved ? Object.keys(saved).sort().join(",") : "";
    check("the file still has exactly the 5 expected fields", fields === "mapApiKey,reverseGeoApiKey,startingLat,startingLon,weatherApiKey");
    const again = await get("http://localhost:8080/settings");
    check("the server serves the saved values back", again.status === 200 && (() => { try { return String(JSON.parse(again.body).startingLat) === NEW_LAT; } catch (e) { return false; } })());
    check("the server logged no errors", !/error|Error|UnhandledPromise/.test(serverLog));
  } catch (e) {
    console.log("FAIL  test could not run: " + e.message);
    results.push(false);
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
    await wait(300);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* temp folder, harmless */ }
  }
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length} checks, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
