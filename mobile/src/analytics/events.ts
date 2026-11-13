/**
 * The app's analytics boundary, the same contract as the website's
 * portal/analytics/privacy.mjs (docs/ANALYTICS.md). Only the event names
 * below leave the device, and each carries only its listed categories,
 * counts and flags. No question, search phrase, answer, title, postcode,
 * route parameter or arbitrary error text is ever accepted: every value is checked
 * against a fixed list or a number range, and anything else is dropped.
 *
 * `cleanEvent` guards what app code asks to send. `scrubEvent` runs on the
 * SDK's final payload (`before_send`) and rebuilds it from the same lists,
 * so SDK enrichment (deep link URLs, screen sizes, flags, person
 * properties) cannot slip through either. Crash and error reports
 * (`$exception`) are rebuilt the same way by ./exceptions.ts.
 */
import { scrubExceptionProperties } from './exceptions';
import { routeErrorPattern } from './route-patterns';

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
const askReason = oneOf('stall', 'deadline', 'network', 'server', 'no_answer');

/** A screen's top-level section, from its route file name (never a parameter). */
const sectionPattern = /^[a-z][a-z0-9-]{0,31}$/;
export const section: Rule = (value) =>
  typeof value === 'string' && sectionPattern.test(value) ? value : 'other';
const version = pattern(/^\d{1,4}(?:\.\d{1,4}){0,3}$/);
// The native SDKs report the build as a whole number; it is kept as digits.
const build: Rule = (value) =>
  pattern(/^\d{1,10}$/)(
    typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : value,
  );

// Constructor names are categories, never error.name/message/stack or a
// caller-provided class name. Unknown constructors use the fixed "other".
const errorClasses = new Set([
  'Error',
  'AggregateError',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
  'ApiError',
  'PersonIdentityError',
  'ChatSyncError',
  'AskFailure',
  'other',
]);
const errorClass: Rule = (value) =>
  typeof value === 'string' && errorClasses.has(value) ? value : 'other';

export const ERROR_MESSAGE_MAX_LENGTH = 80;
// Exact, content-free diagnostics only. Redacting arbitrary prose cannot
// reliably remove record names or user text. Never truncate unsafe input.
const errorMessages = new Set([
  'Network request failed',
  'Failed to fetch',
  'The request timed out',
  'Maximum call stack size exceeded',
  'Rendered more hooks than during the previous render.',
  'Rendered fewer hooks than expected.',
  'Missing OPAX build configuration',
]);
export function scrubErrorMessage(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length <= ERROR_MESSAGE_MAX_LENGTH &&
    errorMessages.has(value)
    ? value
    : undefined;
}

export const timedRoutes = [
  '/',
  '/person/[slug]',
  '/bill/[key]',
  '/your-mp',
  '/search',
  '/ask',
] as const;
export type TimedRoute = (typeof timedRoutes)[number];

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
  opax_route_error: {
    error_class: errorClass,
    route_pattern: routeErrorPattern,
    error_message: scrubErrorMessage,
  },
  opax_app_start: { duration_ms: duration },
  opax_screen_ready: {
    route_pattern: oneOf(...timedRoutes),
    duration_ms: duration,
  },
  opax_ask_started: { from_section: section, follow_up: flag },
  opax_ask_completed: {
    from_section: section,
    follow_up: flag,
    duration_ms: duration,
    source_count: count,
    has_answer: flag,
    reason: askReason,
  },
  opax_ask_failed: {
    from_section: section,
    follow_up: flag,
    duration_ms: duration,
    cancelled: flag,
    reason: askReason,
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
  // The welcome's electorate step: which screen, how it ended and which
  // control chose. Never a seat, a state, typed text or a position.
  opax_first_run: {
    step: oneOf('welcome', 'seat', 'state'),
    outcome: oneOf('chosen', 'skipped'),
    method: oneOf('search', 'location', 'browse'),
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
  $app_namespace: oneOf('au.com.opax.app'),
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
  const raw = captured.properties ?? {};
  // Crash and error reports: their own fixed lists (./exceptions.ts).
  const exception =
    captured.event === '$exception' ? scrubExceptionProperties(raw) : null;
  if (captured.event === '$exception' && !exception) return null;
  const rules = Object.hasOwn(eventFields, captured.event)
    ? (eventFields[captured.event as AnalyticsEvent] as Record<string, Rule>)
    : Object.hasOwn(sdkEventFields, captured.event)
      ? sdkEventFields[captured.event]!
      : null;
  if (!rules && !exception) return null;
  const properties: Record<string, unknown> = {
    ...pick(sdkProperties, raw),
    ...(rules ? pick(rules, raw) : exception),
    $process_person_profile: false,
    $is_identified: false,
    $geoip_disable: true,
    platform: context.platform,
    app: 'opax',
    app_version: context.appVersion,
    app_build: context.appBuild,
    environment: context.environment,
  };
  // This report has its own fixed route allowlist. Do not inherit the SDK's
  // screen property, which is irrelevant here and may contain a pathname.
  if (
    captured.event === 'opax_route_error' ||
    captured.event === 'opax_screen_ready' ||
    captured.event === 'opax_app_start'
  )
    delete properties.$screen_name;
  if (captured.event === '$screen' && !properties.$screen_name) return null;
  return {
    ...captured,
    properties,
    $set: undefined,
    $set_once: undefined,
  };
}
