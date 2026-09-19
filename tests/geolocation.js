// Tests the server's /geolocation route with a fake outside service (no network): a good answer is passed
// through, and failures give a short message and status instead of dumping the raw error object.
//
//   node geolocation.js
//
// Needs the server's dependencies only to resolve `axios`; the outside call itself is faked.
const Module = require("module");
const path = require("path");

let reply;
const realRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "axios") return { get: () => reply() };
  return realRequire.apply(this, arguments);
};
const { getCoords } = require(path.join(__dirname, "..", "server", "geolocationCtrl.js"));
Module.prototype.require = realRequire;

function call() {
  return new Promise((resolve) => {
    const res = {
      status(code) { this.code = code; return this; },
      json(body) { this.body = body; return this; },
      end() { resolve({ code: this.code, body: this.body }); return this; },
    };
    getCoords({}, res);
  });
}

const results = [];
const check = (label, ok) => { results.push(ok); console.log((ok ? "PASS  " : "FAIL  ") + label); };

(async () => {
  reply = () => Promise.resolve({ status: 200, data: { latitude: 1.5, longitude: -2.5, city: "Somewhere" } });
  let r = await call();
  check("a good answer is passed through unchanged", r.code === 200 && r.body.latitude === 1.5 && r.body.longitude === -2.5);

  const upstream = (status) => () => Promise.reject(Object.assign(new Error("Request failed with status code " + status), { name: "AxiosError", stack: "SECRET-STACK", config: { headers: { a: "SECRET-HEADER" } }, response: { status } }));
  reply = upstream(429);
  r = await call();
  check("rate limited (429) answers 429 with a short message", r.code === 429 && typeof r.body.message === "string" && /rate limit/i.test(r.body.message));
  check("the 429 answer holds only a message (no stack or request details)", Object.keys(r.body).join() === "message" && !JSON.stringify(r.body).includes("SECRET"));

  reply = upstream(500);
  r = await call();
  check("another upstream error answers 502 with a short message", r.code === 502 && Object.keys(r.body).join() === "message" && !JSON.stringify(r.body).includes("SECRET"));

  reply = () => Promise.reject(Object.assign(new Error("getaddrinfo ENOTFOUND ipapi.co"), { code: "ENOTFOUND" }));
  r = await call();
  check("no network answers 502 with a short message", r.code === 502 && Object.keys(r.body).join() === "message");

  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length} checks, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
