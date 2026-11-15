/**
 * The layout probe's build flag (see `layout-probe.ts`). On only in a build
 * made with `EXPO_PUBLIC_OPAX_LAYOUT_PROBE=1`; any other value, and every
 * App Store build, leaves the probe out.
 */
export const layoutProbeEnabled =
  process.env.EXPO_PUBLIC_OPAX_LAYOUT_PROBE === '1';
