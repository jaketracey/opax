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
  type AnalyticsContext,
  type AnalyticsEvent,
  type EventProperties,
} from './events';
import { routeErrorPattern } from './route-patterns';

/**
 * Anonymous product analytics (docs/ANALYTICS.md, "iOS and Android app").
 * Only production builds, and development builds made with OPAX_ANALYTICS=1,
 * carry `extra.analytics`; e2e builds never do, so they create no client and
 * send nothing. The host is the opax.com.au/ingest proxy, never PostHog's.
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
    (environment !== 'production' && environment !== 'development')
  )
    return null;
  try {
    const url = new URL(host);
    if (
      url.protocol !== 'https:' ||
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
 * replay, exception or touch capture, no GeoIP, and every payload rebuilt by
 * `scrubEvent` before it is queued or sent.
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
    errorTracking: { autocapture: false },
    captureAppLifecycleEvents: true,
    disableGeoip: true,
    customAppProperties: (defaults) => ({
      $app_name: 'OPAX',
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
export const analyticsEnabled = () =>
  analyticsConfig(Constants.expoConfig?.extra) !== null;

let client: PostHog | null | undefined;
let currentScreen: string | null = null;
function analytics(): PostHog | null {
  if (client !== undefined) return client;
  client = null;
  try {
    const config = analyticsConfig(Constants.expoConfig?.extra);
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

/** The existing iOS build gate and both payload scrubbers apply here too. */
export function reportRouteError(error: unknown, segments: readonly string[]) {
  if (Platform.OS !== 'ios') return;
  try {
    const constructor =
      error !== null && typeof error === 'object'
        ? Object.getPrototypeOf(error)?.constructor?.name
        : undefined;
    track('opax_route_error', {
      error_class: constructor,
      route_pattern: routeErrorPattern(screenName(segments)) ?? '/other',
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
