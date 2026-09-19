// Loads client/src/services/sunTimes.js (an ES module without a package "type") into plain node
// by copying it to a temporary .mjs file.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

module.exports = {
  async loadSunTimes() {
    const source = path.join(__dirname, "..", "client", "src", "services", "sunTimes.js");
    const copy = path.join(os.tmpdir(), "sunTimes.weather-test.mjs");
    fs.copyFileSync(source, copy);
    return import(pathToFileURL(copy).href);
  },
};
module.exports.default = module.exports;
