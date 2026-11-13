// Metro substitutes probe.production.ts in release bundles (metro.config.js),
// and the production block list refuses probe.e2e.ts.
export { perfHeap, perfMark, perfOnce, useDrawnMark } from './probe.e2e';
