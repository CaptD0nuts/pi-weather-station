const RETRY_BASE_MS = 60 * 1000; // first retry after a failure: 1 minute
const RETRY_MAX_MS = 5 * 60 * 1000; // ...then 2, 4, and never longer than 5

/**
 * How long to wait before retrying after `failures` failures in a row
 *
 * @param {Number} failures consecutive failures so far (1 = first failure)
 * @returns {Number} delay in ms
 */
export function retryDelayMs(failures) {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (failures - 1));
}

/**
 * Runs `run` now and then every `intervalMs`. If a run fails (its promise
 * rejects) it is retried after 1, 2, 4... minutes (max 5, and never later than
 * the normal interval) instead of waiting out the whole interval, then goes
 * back to the normal schedule after the first success. Without this, one
 * failed load (Wi-Fi not up yet after a power cut, a rate-limit error) left the
 * display empty until the next scheduled refresh.
 *
 * @param {Object} params
 * @param {Function} params.run function returning a promise
 * @param {Number} params.intervalMs normal time between runs, ms
 * @returns {Function} call it to stop the loop
 */
export function startRefreshLoop({ run, intervalMs }) {
  let timer = null;
  let stopped = false;
  let failures = 0;

  const schedule = (ms) => {
    if (!stopped) {
      timer = setTimeout(tick, ms);
    }
  };

  const tick = () => {
    Promise.resolve()
      .then(run)
      .then(() => {
        failures = 0;
        schedule(intervalMs);
      })
      .catch((err) => {
        failures += 1;
        console.log("refresh failed, will retry:", err);
        schedule(Math.min(intervalMs, retryDelayMs(failures)));
      });
  };

  tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
