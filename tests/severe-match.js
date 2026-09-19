// Checks which NWS alert names trigger severe weather mode. Offline. node severe-match.js [path to severeWeather.js]
const src = require("fs").readFileSync(process.argv[2] || require("path").join(__dirname, "..", "client", "src", "severeWeather.js"), "utf8");
const list = src.match(/SEVERE_EVENT_PATTERNS = \[([\s\S]*?)\];/)[1];
const patterns = eval("[" + list + "]");
const isSevere = (n) => patterns.some((re) => re.test(n || ""));
const cases = {
  "Tornado Warning": true, "Tornado Watch": true, "Severe Thunderstorm Warning": true, "Severe Thunderstorm Watch": true,
  "Flash Flood Warning": true, "Flash Flood Watch": true, "Hurricane Warning": true, "Tropical Storm Watch": true,
  "Extreme Wind Warning": true, "Winter Storm Warning": true, "Ice Storm Warning": true, "Blizzard Warning": true,
  "Heat Advisory": false, "Excessive Heat Warning": false, "Dense Fog Advisory": false, "Flood Warning": false,
  "Special Weather Statement": false, "Wind Advisory": false, "Frost Advisory": false, "Winter Weather Advisory": false, "Red Flag Warning": false
};
let bad = 0;
for (const [name, want] of Object.entries(cases)) { const got = isSevere(name); if (got !== want) { bad++; console.log("MISMATCH", name, "got", got, "want", want); } }
console.log(Object.keys(cases).length + " cases, " + bad + " mismatches");
