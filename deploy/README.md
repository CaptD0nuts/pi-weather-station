# Running the weather station as an always-on Raspberry Pi display

How this fork is run on a Raspberry Pi 4 (4 GB) with a 1024x600 HDMI touchscreen, so that it
comes back on its own after a power cut. Everything here was tested on that setup: Raspberry Pi OS
(Bookworm, Wayfire desktop) with desktop auto-login.

## What you need

- `nodejs` and `npm`, `firefox-esr`, `curl` (all standard on Raspberry Pi OS)
- optional: `grim` (screenshots over SSH, handy for checking the display remotely)
- API keys, kept **only** in `settings.json` (see below)

## Setup

1. Clone this repo on the Pi and run `npm install` in the repo folder (installs the server's dependencies).
2. Create `settings.json` next to `package.json` (start from `settings.example.json`):
   - `weatherApiKey`: a Tomorrow.io key
   - `mapApiKey`: a Mapbox token
   - `reverseGeoApiKey`: a LocationIQ key (optional, only used for the place name)
   - `startingLat` / `startingLon`: your location. If left out, the server guesses it from your IP address (via
     ipapi.co), which is only approximate, so setting it is better

   **`settings.json` is git-ignored. Never commit it, and never paste keys into the code.**
3. Copy the startup script and make it executable:
   `cp deploy/start-weather ~/Desktop/start-weather && chmod +x ~/Desktop/start-weather`
4. Install the cron entries from `deploy/crontab.example` (`crontab -e`).
5. Reboot. The display should appear on its own in about a minute.

## What `start-weather` does

- Starts the web server (`npm start`) if it is not already answering on port 8080.
- Waits, with time limits, for the server, the desktop, and network plus a correct clock (an
  HTTPS answer from the internet and NTP sync; without a correct clock the weather API's secure
  connections fail). If a wait runs out it launches anyway, so a slow router after a power cut
  never leaves the screen blank; the app retries failed loads by itself.
- Then keeps the full-screen Firefox running in a loop: if it exits or crashes it is started again
  after a few seconds (checking the server first); if it dies within 20 seconds of starting it waits
  30 seconds so a broken browser cannot spin the CPU.
- While the browser is open, a background health check looks at the server once a minute. If it has not
  answered 3 times in a row it is restarted (logged as `health check: ...`); the open page keeps running and
  reloads its data by itself. The check stops when `start-weather` stops.
- Firefox is started as a native Wayland app (`MOZ_ENABLE_WAYLAND=1`); running it through the X11
  compatibility layer left a 16 pixel strip of wallpaper at the bottom of the screen.
- The script assumes the desktop user is uid 1000 (`/run/user/1000`), the default first user.
- Progress is logged with time since boot to `~/start-weather.log`.

Test switches (normally unset): `DRY_RUN=1` (do everything except open the browser),
`KIOSK_CMD="sleep 5"` (run this instead of the browser, to test the loop),
`NET_PROBE_URL` and `WAIT_NET_SECONDS` (override the network check),
`HEALTH_INTERVAL` and `HEALTH_FAILS` (seconds between server checks, misses before a restart).

## Rebuilding the client

`client/dist` is committed, so nothing needs building on the Pi. To change the client, build on a
computer with more memory than a Pi, commit the result, and update the Pi (next section):

```
cd client
npm ci
npx webpack --mode production      # same as: npm run prod
```

Since the merge with upstream v3.0.2 the client builds with webpack 5, so no Node compatibility flag is
needed (the older webpack 4 build needed `NODE_OPTIONS=--openssl-legacy-provider`). The build writes
`bundle.min.js`, a small `810.bundle.min.js`, `bundle.min.js.LICENSE.txt` and `index.html` to `client/dist`
and cleans out anything else there. On Windows, build from a short folder path: the installed packages
nest deeply and can exceed the path length limit.

The `@iconify/*` packages in `client/package.json` are pinned to exact versions (no `^`) on purpose. Newer
releases of the icon sets redraw every icon on a padded 30x30 canvas, which makes the degree sign and the
weather stat icons visibly smaller and detached from the temperature. Upstream's own webpack 5 build looks
like that because its lock file picked up the new releases. If you ever update these packages, check the
temperature and icons area of the screen afterwards.

See `tests/` for headless-browser tests that count API calls, check the clock and the severe-weather
banner, and verify the sunrise/sunset calculation.

## Updating the display

If the Pi's project folder is a git clone of your repo, an update is a pull plus a browser restart:

```
cd ~/pi-weather-station
git pull --ff-only
pkill -f "[f]irefox-esr --kiosk"        # start-weather reopens the browser a few seconds later, on the new files
```

If the pull changed anything under `server/` (or `package.json`), close the server first so `start-weather`
starts the new one when it reopens the browser:

```
pkill -f "node ./server/index.js"; pkill -f "[f]irefox-esr --kiosk"
```

`git pull --ff-only` refuses to run if the Pi has local edits that conflict, instead of overwriting them.
`settings.json` (your keys) is git-ignored, so pulling never touches it.

## Things worth knowing

- **Tomorrow.io free plan:** the rate limit window resets on the hour, and every page load or
  reboot uses one call, so avoid reloading or rebooting repeatedly within an hour. Normal running
  uses about 6 calls an hour (12 in severe weather mode).
- **Severe weather mode:** append `?severe=test` to the page address to preview it with a fake alert.
- **Measure on the Pi.** A "GPU-friendly" CSS opacity fade turned out to use *more* CPU than the
  effect it replaced on a Pi 4 with Firefox, so performance changes here were checked on the device.
- **Optional trimming** (saves very little memory, only do it if you do not use these): printing,
  modem and Bluetooth services can be switched off with
  `sudo systemctl disable --now ModemManager.service cups.service cups.socket cups.path cups-browsed.service bluetooth.service`
  and back on with `enable --now`.
