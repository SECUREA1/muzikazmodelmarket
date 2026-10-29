// Loaded only by the isolated pressure-test child, never by normal startup.
import {monitorEventLoopDelay, performance} from 'node:perf_hooks';
const histogram = monitorEventLoopDelay({resolution: 10});
histogram.enable();
let cpu = process.cpuUsage(), utilization = performance.eventLoopUtilization(), at = performance.now();
const externalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const address = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(address.hostname)) {
    return Promise.reject(new Error('Pressure-test fixture blocks external HTTP requests.'));
  }
  return externalFetch(input, options);
};
const timer = setInterval(() => {
  const now = performance.now(), nextCpu = process.cpuUsage(), nextUtilization = performance.eventLoopUtilization();
  const elapsed = now - at;
  if (process.connected) process.send({type: 'pressure-sample', time: Date.now(),
    rssBytes: process.memoryUsage().rss, heapUsedBytes: process.memoryUsage().heapUsed,
    cpuPercentOfOneCore: ((nextCpu.user - cpu.user + nextCpu.system - cpu.system) / 1000) / elapsed * 100,
    eventLoopUtilization: performance.eventLoopUtilization(nextUtilization, utilization).utilization,
    eventLoopP99Ms: histogram.percentile(99) / 1e6, eventLoopMaxMs: histogram.max / 1e6});
  cpu = nextCpu; utilization = nextUtilization; at = now; histogram.reset();
}, 1000);
timer.unref();
