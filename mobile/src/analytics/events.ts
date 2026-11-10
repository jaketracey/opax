/**
 * The app's analytics boundary, the same contract as the website's
 * portal/analytics/privacy.mjs (docs/ANALYTICS.md). Only the event names
 * below leave the device, and each carries only its listed categories,
 * counts and flags. No question, search phrase, answer, title, postcode,
 * route parameter or error text is ever accepted: every value is checked
 * against a fixed list or a number range, and anything else is dropped.
 *
 * `cleanEvent` guards what app code asks to send. `scrubEvent` runs on the
 * SDK's final payload (`before_send`) and rebuilds it from the same lists,
 * so SDK enrichment (deep link URLs, screen sizes, flags, person
 * properties) cannot slip through either.
 */

type Value = string | number | boolean;
type Rule = (value: unknown) => Value | undefined;

const count: Rule = (value) =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 1_000_000
    ? value
    : undefined;
const duration: Rule = (value) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 3_600_000
    ? Math.round(value)
    : undefined;
const flag: Rule = (value) => (typeof value === 'boolean' ? value : undefined);
const oneOf =
  (...allowed: readonly string[]): Rule =>
  (value) =>
    typeof value === 'string' && allowed.includes(value) ? value : undefined;
const pattern =
  (re: RegExp): Rule =>
  (value) =>
    typeof value === 'string' && re.test(value) ? value : undefined;

/** A screen's top-level section, from its route file name (never a parameter). */
const sectionPattern = /^[a-z][a-z0-9-]{0,31}$/;
export const section: Rule = (value) =>
  typeof value === 'string' && sectionPattern.test(value) ? value : 'other';
const version = pattern(/^\d{1,4}(?:\.\d{1,4}){0,3}$/);
const build = pattern(/^\d{1,10}$/);

/**
 * Where a search ran: speeches, every record type ("Type: All records"), or
 * one of the list groups in features/search/scopes.ts.
 */
export const searchScopes = [
  'speech',
  'all',
  'topics',
  'electorates',
  'parties',
  'interests',
  'pay',
  'expenses',
  'grants',
  'agencies',
] as const;

/** Custom events: the website's names where they match, with app properties. */
export const eventFields = {
  opax_ask_started: { from_section: section, follow_up: flag },
  opax_ask_completed: {
    from_section: section,
    follow_up: flag,
    duration_ms: duration,
    source_count: count,
    has_answer: flag,
  },
  opax_ask_failed: {
    from_section: section,
    follow_up: flag,
    duration_ms: duration,
    cancelled: flag,
  },
  opax_search_started: {
    scope: oneOf(...searchScopes),
    page: count,
    filter_count: count,
  },
  opax_search_completed: {
    scope: oneOf(...searchScopes),
    page: count,
    result_count: count,
    total_count: count,
    duration_ms: duration,
  },
  opax_search_failed: {
    scope: oneOf(...searchScopes),
    page: count,
    duration_ms: duration,
  },
  opax_source_open: {
    from_section: section,
    destination: oneOf('app', 'browser'),
  },
  opax_chip: {
    chip_kind: oneOf('ask', 'search'),
    placement: oneOf('ask', 'today'),
  },
  opax_voice_card: {
    action: oneOf('open'),
    account: oneOf('signed_in', 'signed_out'),
  },
} as const satisfies Record<string, Record<string, Rule>>;
export type AnalyticsEvent = keyof typeof eventFields;
export type EventProperties<E extends AnalyticsEvent> = {
  [K in keyof (typeof eventFields)[E]]?: Value;
};

/** SDK events the app lets through: screen views and the app lifecycle. */
const sdkEventFields: Record<string, Record<string, Rule>> = {
  $screen: {},
  'Application Installed': {},
  'Application Updated': { previous_version: version, previous_build: build },
  'Application Opened': {},
  'Application Became Active': {},
  'Application Backgrounded': {},
};

/**
 * A route template ("/person/[slug]"): expo-router segments with groups
 * removed. Segments are file names, so parameters stay as [names] (or
 * [...names]); any
 * segment that is not a plain file name becomes "/other".
 */
const routeSegment =
  /^(?:[a-z0-9][a-z0-9-]{0,47}|\[(?:\.\.\.)?[A-Za-z]{1,24}\])$/;
export function screenName(segments: readonly string[]): string {
  const parts = segments.filter((s) => !/^\(.*\)$/.test(s) && s !== 'index');
  if (parts.length > 8 || !parts.every((s) => routeSegment.test(s)))
    return '/other';
  return `/${parts.join('/')}`;
}
const screenRule: Rule = (value) => {
  if (typeof value !== 'string') return undefined;
  if (value === '/') return value;
  const parts = value.split('/');
  return parts[0] === '' && screenName(parts.slice(1)) === value
    ? value
    : '/other';
};
/** The section an action happened in: the screen's first segment. */
export function sectionOf(screen: string | null): string {
  const first = screen?.split('/')[1];
  if (screen === '/') return 'today';
  return first && sectionPattern.test(first) ? first : 'other';
}

/** Properties the SDK adds that are categories, not content. */
const sdkProperties: Record<string, Rule> = {
  $lib: oneOf('posthog-react-native'),
  $lib_version: version,
  $session_id: pattern(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  ),
  $device_type: oneOf('Mobile', 'Tablet', 'Desktop', 'TV'),
  $os_name: oneOf('iOS', 'iPadOS', 'Android'),
  $app_name: oneOf('OPAX'),
  $app_version: version,
  $app_build: build,
  $screen_name: screenRule,
};

export type AnalyticsContext = {
  platform: 'ios' | 'android';
  appVersion: string;
  appBuild: string;
  environment: 'production' | 'development';
};

/** App code's guard: the event's listed properties, or null for any other name. */
export function cleanEvent(
  event: string,
  properties: Record<string, unknown> = {},
): Record<string, Value> | null {
  if (!Object.hasOwn(eventFields, event)) return null;
  return pick(eventFields[event as AnalyticsEvent], properties);
}
function pick(
  rules: Record<string, Rule>,
  properties: Record<string, unknown>,
) {
  const clean: Record<string, Value> = {};
  for (const [key, rule] of Object.entries(rules)) {
    if (!Object.hasOwn(properties, key)) continue;
    const value = rule(properties[key]);
    if (value !== undefined) clean[key] = value;
  }
  return clean;
}

type CaptureEvent = {
  event: string;
  properties?: Record<string, unknown>;
  $set?: unknown;
  $set_once?: unknown;
  [key: string]: unknown;
};
/**
 * `before_send`: drop any event not on the lists, then rebuild its
 * properties from the lists alone. Person processing stays off, GeoIP stays
 * off, and every event is tagged with the platform and app version.
 */
export function scrubEvent<T extends CaptureEvent>(
  captured: T | null,
  context: AnalyticsContext,
): T | null {
  if (!captured || typeof captured.event !== 'string') return null;
  const rules = Object.hasOwn(eventFields, captured.event)
    ? (eventFields[captured.event as AnalyticsEvent] as Record<string, Rule>)
    : Object.hasOwn(sdkEventFields, captured.event)
      ? sdkEventFields[captured.event]!
      : null;
  if (!rules) return null;
  const raw = captured.properties ?? {};
  const properties: Record<string, Value> = {
    ...pick(sdkProperties, raw),
    ...pick(rules, raw),
    $process_person_profile: false,
    $is_identified: false,
    $geoip_disable: true,
    platform: context.platform,
    app: 'opax',
    app_version: context.appVersion,
    app_build: context.appBuild,
    environment: context.environment,
  };
  if (captured.event === '$screen' && !properties.$screen_name) return null;
  return {
    ...captured,
    properties,
    $set: undefined,
    $set_once: undefined,
  };
}
