// Tests the clock with a fake system time: (1) React re-renders while idle, (2) how soon after the minute
// changes the screen updates, (3) date rollover at midnight, (4) how long the screen takes to follow a
// sudden system clock jump. All outside services are faked.
//   node clock.js [dist folder] [label]
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

async function scenario(browser, port, targetMs, watchMs) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 600 });
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = req.url();
    if (u.startsWith(`http://127.0.0.1:${port}`)) return req.continue();
    const cors = { "access-control-allow-origin": "*" };
    const json = (o) => req.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("api.tomorrow.io")) return json(tomorrow(u));
    if (u.includes("locationiq") || u.includes("reverse")) return json({ address: { city: "Testville", state: "Alabama", country_code: "us", country: "USA" } });
    if (u.includes("api.weather.gov")) return json({ features: [] });
    if (u.includes("weather-maps.json")) return json({ host: "https://tilecache.rainviewer.com", radar: { past: [{ time: 1, path: "/v2/radar/x" }] } });
    return req.respond({ status: 200, headers: cors, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") });
  });

  await page.evaluateOnNewDocument((target) => {
    window.__commits = 0;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; }, onCommitFiberRoot() { window.__commits++; }, onCommitFiberUnmount() {}, isDisabled: false, checkDCE() {} };
    const RealDate = Date;
    const offset = target - RealDate.now();
    class FakeDate extends RealDate {
      constructor(...a) { if (a.length === 0) super(RealDate.now() + offset); else super(...a); }
      static now() { return RealDate.now() + offset; }
    }
    let off = offset; window.__stepClock = (ms) => { off += ms; };
    class FD extends RealDate { constructor(...a) { if (a.length === 0) super(RealDate.now() + off); else super(...a); } static now() { return RealDate.now() + off; } }
    window.Date = FD;
  }, targetMs);

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  // watch the clock text + date text for changes, stamping each with the (fake) time
  await page.waitForFunction(() => [...document.querySelectorAll("div")].some((e) => !e.children.length && /^\d{1,2}:\d{2}\s?[AP]M$/.test(e.innerText.trim())), { timeout: 15000 });
  await page.evaluate(() => {
    const find = (re) => { const el = [...document.querySelectorAll("div")].find((e) => !e.children.length && re.test(e.innerText.trim())); return el ? el.innerText.trim() : null; };
    const read = () => ({ time: find(/^\d{1,2}:\d{2}\s?[AP]M$/), date: find(/^[A-Z]+ [A-Z]+ \d{1,2}$/) });
    window.__log = [{ ...read(), msPastMinute: Date.now() % 60000 }];
    new MutationObserver(() => {
      const r = read(), last = window.__log[window.__log.length - 1];
      if (r.time !== last.time || r.date !== last.date) window.__log.push({ ...r, msPastMinute: Date.now() % 60000 });
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await new Promise((r) => setTimeout(r, 3000)); // let startup loads settle
  const c0 = await page.evaluate(() => window.__commits);
  await new Promise((r) => setTimeout(r, watchMs));
  const c1 = await page.evaluate(() => window.__commits);
  const log = await page.evaluate(() => window.__log);
  await page.close();
  return { commits: c1 - c0, log };
}

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const now = new Date();
  const at = (h, m, s, dayOffset = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, h, m, s).getTime();

  console.log(`\n=== ${LABEL} ===`);
  // 1) idle: next minute change is ~50 s away, so a 5 s window should contain none
  const idle = await scenario(browser, port, at(10, 14, 5), 5000);
  console.log(`1) idle 5 s (no minute change inside the window): ${idle.commits} React re-renders`);

  // 2) minute flip: page time starts at 10:14:55 - flips to 10:15 about 5 s later.
  //    The 3 s startup wait is included, so watch long enough to cover the flip.
  const flip = await scenario(browser, port, at(10, 14, 55), 4500);
  const flipped = flip.log.find((e) => /10:15/.test(e.time || ""));
  console.log(`2) minute flip 10:14 -> 10:15: ${flipped ? `screen updated ${flipped.msPastMinute} ms after the minute changed` : "DID NOT UPDATE"}`);

  // 3) midnight: 23:59:56 -> 00:00; date must roll to tomorrow
  const mid = await scenario(browser, port, at(23, 59, 56), 5500);
  const tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const want = `${tmr.toLocaleDateString("en-US", { weekday: "long" })} ${tmr.toLocaleDateString("en-US", { month: "long" })} ${tmr.getDate()}`.toUpperCase();
  const rolled = mid.log.find((e) => e.date === want);
  console.log(`3) midnight rollover: ${rolled ? `date changed to "${rolled.date}" and time to "${rolled.time}", ${rolled.msPastMinute} ms after midnight` : "DATE DID NOT ROLL OVER (log: " + JSON.stringify(mid.log.map((e) => e.date + " " + e.time)) + ")"}`);

  // 4) system clock jumps forward 2 hours (like an NTP step) at 10:14:05 - how long until the screen follows?
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 600 });
  await page.setRequestInterception(true);
  page.on("request", (req) => { const u = req.url(); if (u.startsWith("http://127.0.0.1:" + port)) return req.continue(); const cors = { "access-control-allow-origin": "*" }; const json = (o) => req.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(o) }); if (u.includes("api.tomorrow.io")) return json(tomorrow(u)); if (u.includes("locationiq") || u.includes("reverse")) return json({ address: { city: "T", state: "AL", country_code: "us", country: "USA" } }); if (u.includes("api.weather.gov")) return json({ features: [] }); if (u.includes("weather-maps.json")) return json({ host: "https://x", radar: { past: [] } }); return req.respond({ status: 200, headers: cors, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") }); });
  await page.evaluateOnNewDocument((target) => {
    const RealDate = Date; let off = target - RealDate.now(); window.__stepClock = (ms) => { off += ms; };
    class FD extends RealDate { constructor(...a) { if (a.length === 0) super(RealDate.now() + off); else super(...a); } static now() { return RealDate.now() + off; } }
    window.Date = FD;
  }, at(10, 14, 5));
  await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "load" });
  const timeText = () => page.evaluate(() => { const el = [...document.querySelectorAll("div")].find((e) => !e.children.length && /^\d{1,2}:\d{2}\s?[AP]M$/.test(e.innerText.trim())); return el ? el.innerText.trim() : null; });
  await new Promise((r) => setTimeout(r, 2500));
  const before = await timeText();
  await page.evaluate(() => window.__stepClock(2 * 3600 * 1000));
  const t0 = Date.now(); let after = before;
  while (Date.now() - t0 < 70000) { after = await timeText(); if (after && after !== before && /12:/.test(after)) break; await new Promise((r) => setTimeout(r, 250)); }
  console.log("4) clock stepped +2 h: screen showed " + before + " -> " + after + " after " + ((Date.now() - t0) / 1000).toFixed(1) + " s");
  await browser.close();
  server.close();
})().catch((e) => { console.error("TEST ERROR", e); process.exit(1); });
