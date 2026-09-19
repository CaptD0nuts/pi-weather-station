# Tests

Headless-browser tests used to verify the changes in this fork. They load a **built** copy of the app
(`client/dist` by default) in Chrome/Chromium and replace every outside service (Tomorrow.io, the
National Weather Service, RainViewer, Mapbox, the place-name lookup) with fakes, so they are quick,
repeatable and use **none of your real API quota**. No real keys are needed; the fake settings use
placeholder keys.

## Setup

```
cd tests
npm install            # installs puppeteer-core (it drives a browser you already have)
```

You need Chrome, Chromium or Edge installed. It is found automatically in the usual places; otherwise
set `CHROME_PATH` to the executable.

To test code changes, build the client first (see `../deploy/README.md`), or pass the folder of any build
as the first argument.

## The tests

| Command | What it checks |
|---|---|
| `node api-calls.js` | How many weather/sunrise/geocode/alert/radar calls the app makes at startup, per map tap and per tap on the location arrow, and what the screen shows. `FAILFIRST=3` makes the first 3 weather calls answer HTTP 429 to test retry back-off; add the `fast` argument (`node api-calls.js ../client/dist label fast`) to fast-forward long timers 600x. |
| `node alerts.js` | The severe-weather banner appears for a Tornado Warning and for a strong-thunderstorm Special Weather Statement, ignores a Heat Advisory and fog statements, and clears; counts React re-renders while the alert check runs quietly. |
| `node clock.js` | Re-renders while idle, how soon after the minute changes the screen updates, date rollover at midnight, and catch-up after a sudden system clock jump (uses a fake system time). |
| `node settings-save.js` | End to end: runs a scratch copy of the real server with FAKE keys, changes the latitude/longitude in the Settings menu in headless Chrome, clicks Save, and checks what was written to `settings.json`. Never touches your real settings file. Needs the server's dependencies (`npm install` in the repo root) and a free port 8080. |
| `node geolocation.js` | Offline: the server's `/geolocation` route passes a good answer through, and on a failure (including the lookup service's HTTP 429 rate limit) gives a short message and status, never the raw error. |
| `node severe-match.js` | Offline, uses the real matching code: which National Weather Service alerts trigger severe mode, including that a Special Weather Statement counts only when its text is about a storm hazard (not fog, heat or smoke), and that test/exercise messages never count. |
| `node sun-check.mjs` | Compares the local sunrise/sunset calculation with sunrise-sunset.org for 7 places and 4 dates. **Uses the network.** That site is known to run about a minute or two off the official definition, so a steady offset is expected. |
| `node usno-check.mjs` | Compares the local calculation with the US Naval Observatory (the official reference). **Uses the network.** |

Screenshots taken during a run are written to your system temp folder as `weather-test-shot-*.png`.
