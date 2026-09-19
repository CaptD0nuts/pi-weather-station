// Offline check of which National Weather Service alerts trigger severe weather mode, using the real
// matching code from client/src/severeWeather.js.   node severe-match.js
const { loadSevereWeather } = require("./load-modules.js");

// Text modelled on real NWS Special Weather Statements (place names replaced with "Exampleville").
const STRONG_STORM = "At 113 PM CDT, Doppler radar was tracking a strong thunderstorm near Exampleville, moving south at 10 mph. HAZARD...Wind gusts up to 45 mph and pea size hail. SOURCE...Radar indicated. IMPACT...Gusty winds could knock down tree limbs.";
const HAIL_ONLY = "Quarter size hail is possible with storms moving through the area this evening.";
const WATERSPOUT = "A waterspout was reported near the coast and may move onshore.";
const FLOODING = "Locally heavy rainfall may cause minor flooding of low-lying and poor drainage areas.";
const FOG = "Areas of dense fog with visibility below one quarter mile will develop overnight.";
const SMOKE = "Smoke from a nearby wildfire will reduce visibility and air quality this afternoon.";
const HEAT = "Heat index values near 105 degrees are expected this afternoon.";

const alert = (event, description = "", status = "Actual") => ({ event, status, headline: event + " issued by the NWS", description });

// [alert, expected banner name or null]
const cases = [
  // watches and warnings by event name
  [alert("Tornado Warning"), "Tornado Warning"], [alert("Tornado Watch"), "Tornado Watch"],
  [alert("Severe Thunderstorm Warning"), "Severe Thunderstorm Warning"], [alert("Severe Thunderstorm Watch"), "Severe Thunderstorm Watch"],
  [alert("Flash Flood Warning"), "Flash Flood Warning"], [alert("Flash Flood Watch"), "Flash Flood Watch"],
  [alert("Hurricane Warning"), "Hurricane Warning"], [alert("Tropical Storm Watch"), "Tropical Storm Watch"],
  [alert("Extreme Wind Warning"), "Extreme Wind Warning"], [alert("Winter Storm Warning"), "Winter Storm Warning"],
  [alert("Ice Storm Warning"), "Ice Storm Warning"], [alert("Blizzard Warning"), "Blizzard Warning"],
  // not severe
  [alert("Heat Advisory", HEAT), null], [alert("Excessive Heat Warning", HEAT), null], [alert("Dense Fog Advisory", FOG), null],
  [alert("Flood Warning"), null], [alert("Wind Advisory"), null], [alert("Frost Advisory"), null],
  [alert("Winter Weather Advisory"), null], [alert("Red Flag Warning"), null],
  // Special Weather Statements: only when the text is about a storm hazard
  [alert("Special Weather Statement", STRONG_STORM), "Weather Statement: Strong thunderstorm"],
  [alert("Special Weather Statement", HAIL_ONLY), "Weather Statement: Strong thunderstorm"],
  [alert("Special Weather Statement", WATERSPOUT), "Weather Statement: Tornado or waterspout"],
  [alert("Special Weather Statement", FLOODING), "Weather Statement: Flooding"],
  [alert("Special Weather Statement", FOG), null], [alert("Special Weather Statement", SMOKE), null],
  [alert("Special Weather Statement", HEAT), null], [alert("Special Weather Statement", ""), null],
  // test/exercise messages never count
  [alert("Tornado Warning", "", "Test"), null], [alert("Special Weather Statement", STRONG_STORM, "Exercise"), null],
  [{}, null], [undefined, null],
];

(async () => {
  const { severeAlertName } = await loadSevereWeather();
  let bad = 0;
  cases.forEach(([props, want], i) => {
    const got = severeAlertName(props);
    if (got !== want) {
      bad++;
      console.log(`MISMATCH #${i}: ${props && props.event} -> got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
  });
  console.log(`${cases.length} cases, ${bad} mismatches`);
  process.exit(bad ? 1 : 0);
})();
