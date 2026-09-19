// Loads client source files (ES modules without a package "type") into plain node by copying them to
// temporary .mjs files, so the tests can exercise the real code.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const src = (...parts) => path.join(__dirname, "..", "client", "src", ...parts);

module.exports = {
  // client/src/services/sunTimes.js: the local sunrise/sunset calculation
  async loadSunTimes() {
    const copy = path.join(os.tmpdir(), "sunTimes.weather-test.mjs");
    fs.copyFileSync(src("services", "sunTimes.js"), copy);
    return import(pathToFileURL(copy).href);
  },
  // client/src/severeWeather.js: which NWS alerts trigger severe weather mode. It imports axios for the
  // network call, which the pure matching functions do not need, so a stub is swapped in.
  async loadSevereWeather() {
    const code = fs.readFileSync(src("severeWeather.js"), "utf8").replace('import axios from "axios";', "const axios = {};");
    const copy = path.join(os.tmpdir(), "severeWeather.weather-test.mjs");
    fs.writeFileSync(copy, code);
    return import(pathToFileURL(copy).href);
  },
};
module.exports.default = module.exports;
