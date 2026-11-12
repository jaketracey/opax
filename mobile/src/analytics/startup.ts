// Monotonic where available, with one consistent clock for each JS runtime.
export const analyticsNow =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now();
export const bundleStartedAt = analyticsNow();
