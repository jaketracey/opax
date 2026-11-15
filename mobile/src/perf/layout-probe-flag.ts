import Constants from 'expo-constants';

/**
 * The layout probe's build flag (see `layout-probe.ts`). On only in a build
 * configured with `OPAX_LAYOUT_PROBE=1`, which `app.config.ts`
 * carries as `extra.layoutProbe`. Every other build, and every App Store
 * build, leaves the probe out. Read from the build configuration, not from
 * `process.env`: a value inlined into the bundle is kept by Metro's
 * transform cache and can outlive the build that set it.
 */
export const layoutProbeEnabled =
  (Constants.expoConfig?.extra as { layoutProbe?: unknown } | undefined)
    ?.layoutProbe === true;
