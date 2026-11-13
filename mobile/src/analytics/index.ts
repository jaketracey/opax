import Constants from 'expo-constants';
import { useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import PostHog, { type PostHogOptions } from 'posthog-react-native';
import {
  cleanEvent,
  screenName,
  scrubEvent,
  sectionOf,
  scrubErrorMessage,
  type AnalyticsContext,
  type AnalyticsEvent,
  type EventProperties,
} from './events';
import { routeErrorPattern } from './route-patterns';

/**
 * Anonymous product analytics (docs/ANALYTICS.md, "iOS and Android app").
 * Only configured production release builds create a client. Debug bundles,
 * dev clients, e2e, and missing/zero build numbers always fail closed.
 */
type AnalyticsConfig = {
  host: string;
  projectToken: string;
  environment: AnalyticsContext['environment'];
};
export function analyticsConfig(extra: unknown): AnalyticsConfig | null {
  const value = (extra as { analytics?: unknown } | undefined)?.analytics;
  if (!value || typeof value !== 'object') return null;
  const { host, projectToken, environment } = value as Record<string, unknown>;
  if (
    typeof host !== 'string' ||
    typeof projectToken !== 'string' ||
    !/^phc_[A-Za-z0-9]{20,64}$/.test(projectToken) ||
    environment !== 'production'
  )
    return null;
  try {
    const url = new URL(host);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'opax.com.au' ||
      url.port ||
      url.pathname !== '/ingest' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      return null;
  } catch {
    return null;
  }
  return { host, projectToken, environment };
}

export function analyticsContext(
  environment: AnalyticsContext['environment'],
): AnalyticsContext {
  const config = Constants.expoConfig;
  return {
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    appVersion: config?.version ?? '',
    appBuild: String(
      (config?.extra as { appBuild?: unknown } | undefined)?.appBuild ?? '',
    ),
    environment,
  };
}

/**
 * The SDK's settings: anonymous only, no person profiles, no flags, surveys,
 * replay, push or touch capture, no GeoIP, and every payload rebuilt by
 * `scrubEvent` before it is queued or sent.
 *
 * Crash and error reports: uncaught exceptions, unhandled promise rejections
 * and native crashes (iOS; Android Java/Kotlin and NDK). Never console lines,
 * which can hold what a reader typed, and no breadcrumbs. The native SDK
 * sends its own crash reports; the plugin patch scrubs those (exceptions.ts).
 */
export function analyticsOptions(
  config: AnalyticsConfig,
  context: AnalyticsContext,
  overrides: Pick<PostHogOptions, 'customStorage' | 'persistence'> = {},
): PostHogOptions {
  return {
    host: config.host,
    persistence: 'file',
    personProfiles: 'never',
    setDefaultPersonProperties: false,
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    sendFeatureFlagEvent: false,
    disableSurveys: true,
    enableSessionReplay: false,
    errorTracking: {
      autocapture: {
        uncaughtExceptions: true,
        unhandledRejections: true,
        console: [],
        nativeCrashes: true,
        androidNdkCrashes: true,
      },
      exceptionSteps: { enabled: false },
    },
    // Installing the native plugin turns these on by default.
    capturePushNotificationSubscriptions: false,
    capturePushNotificationOpened: false,
    captureAppLifecycleEvents: true,
    disableGeoip: true,
    customAppProperties: (defaults) => ({
      $app_name: 'OPAX',
      // With the version and build, how PostHog matches a report to the
      // release its symbols were uploaded for.
      $app_namespace: 'au.com.opax.app',
      $app_version: context.appVersion,
      $app_build: context.appBuild,
      $os_name: context.platform === 'android' ? 'Android' : 'iOS',
      $device_type: defaults.$device_type ?? null,
    }),
    before_send: (event) => scrubEvent(event, context),
    ...overrides,
  };
}

/** Whether this build sends anonymous analytics (About says so only then). */
export function analyticsEnabled() {
  const config = Constants.expoConfig;
  const extra = config?.extra;
  const validBuild = (value: unknown) =>
    (typeof value === 'string' || typeof value === 'number') &&
    /^[1-9][0-9]{0,9}$/.test(String(value));
  const platformBuild =
    Platform.OS === 'android'
      ? config?.android?.versionCode
      : config?.ios?.buildNumber;
  // Constants already exposes the iOS binary's immutable CFBundleVersion.
  // Android SDK 57 exposes only the embedded config here (no new module).
  const nativeBuild =
    Platform.OS === 'ios'
      ? Constants.platform?.ios?.buildNumber
      : platformBuild;
  return (
    !__DEV__ &&
    !Constants.debugMode &&
    Constants.executionEnvironment !== 'storeClient' &&
    (Platform.OS === 'ios' || Platform.OS === 'android') &&
    extra?.variant === 'production' &&
    validBuild(extra?.appBuild) &&
    validBuild(platformBuild) &&
    validBuild(nativeBuild) &&
    String(extra?.appBuild) === String(platformBuild) &&
    String(extra?.appBuild) === String(nativeBuild) &&
    analyticsConfig(extra) !== null
  );
}

let client: PostHog | null | undefined;
let currentScreen: string | null = null;
function analytics(): PostHog | null {
  if (client !== undefined) return client;
  client = null;
  try {
    const config = analyticsEnabled()
      ? analyticsConfig(Constants.expoConfig?.extra)
      : null;
    if (config)
      client = new PostHog(
        config.projectToken,
        analyticsOptions(config, analyticsContext(config.environment)),
      );
  } catch {
    client = null;
  }
  return client;
}

/** Starts the client (and its app-open events) once, at launch. */
export function startAnalytics() {
  analytics();
}

/** One allowlisted event. Analytics never interrupts the app. */
export function track<E extends AnalyticsEvent>(
  event: E,
  properties: EventProperties<E> = {},
) {
  try {
    const posthog = analytics();
    const clean = posthog && cleanEvent(event, properties);
    if (clean) posthog.capture(event, clean);
  } catch {
    /* optional */
  }
}

/**
 * A render error a route boundary caught: the `opax_route_error` count, and
 * one `$exception` with its stack. React does not pass a caught error on to
 * the global handler in release builds, and console capture is off, so this
 * is the only report of it. The shared release gate and the scrubbers apply.
 */
export function reportRouteError(error: unknown, segments: readonly string[]) {
  try {
    analytics()?.captureException(error);
  } catch {
    /* optional */
  }
  try {
    const constructor =
      error !== null && typeof error === 'object'
        ? Object.getPrototypeOf(error)?.constructor?.name
        : undefined;
    track('opax_route_error', {
      error_class: constructor,
      route_pattern: routeErrorPattern(screenName(segments)) ?? '/other',
      error_message: scrubErrorMessage(
        error instanceof Error ? error.message : undefined,
      ),
    });
  } catch {
    /* Reporting must never break the recoverable state. */
  }
}

/** One event per caught error, including React's repeated effect setup. */
export function useRouteErrorReporting(error: unknown) {
  const segments = useSegments();
  const pattern = screenName(segments);
  const last = useRef<{ error: unknown } | null>(null);
  useEffect(() => {
    if (last.current && last.current.error === error) return;
    last.current = { error };
    reportRouteError(error, segments);
  }, [error, pattern, segments]);
}

/** The section of the screen the reader is on ("ask", "person", "today"). */
export const currentSection = () => sectionOf(currentScreen);

/** `$screen` for each route change: the route template only, no parameters. */
export function useScreenTracking() {
  const segments = useSegments();
  const name = screenName(segments);
  useEffect(() => {
    if (name === currentScreen) return;
    currentScreen = name;
    try {
      void analytics()?.screen(name);
    } catch {
      /* optional */
    }
  }, [name]);
}
