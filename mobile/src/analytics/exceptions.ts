/**
 * Anonymous crash and error reports (`$exception`, docs/ANALYTICS.md). The
 * SDK's exception properties are rebuilt here from fixed lists, the same way
 * `scrubEvent` rebuilds every other event: the exception's type, a scrubbed
 * message, its stack frames and the binary images native frames point into.
 * Breadcrumbs (`$exception_steps`), app state, screen sizes, debug fields and
 * anything else the SDK or a caller adds are dropped.
 *
 * Native crash reports never pass through here: the native SDK builds and
 * sends them itself. patches/@posthog+react-native-plugin+2.13.0.patch applies
 * these same rules in Swift and Kotlin, so keep the three in step.
 */

export const EXCEPTION_MESSAGE_MAX_LENGTH = 120;
// Longer input is cut before the rules run; a quote the cut opens is then
// caught by the unclosed-quote rule, so nothing past it survives.
const MESSAGE_INPUT_MAX_LENGTH = 4000;
const MAX_EXCEPTIONS = 10;
const MAX_FRAMES = 250;
const MAX_IMAGES = 500;

const notAfterWord = String.raw`(?<![\p{L}\p{N}_])`;
const notBeforeWord = String.raw`(?![\p{L}\p{N}_])`;
/**
 * Message rules, in order. Free text cannot be recognised in general, so a
 * message keeps only what sits outside quotes, URL queries and fragments,
 * email addresses and long numbers, cut to a short length.
 */
const messageRules: readonly (readonly [RegExp, string])[] = [
  // A URL keeps its scheme, host and path; the query string and fragment go.
  [/([a-z][a-z0-9+.-]*:\/\/[^\s?#"'`<>]*)[?#][^\s"'`<>]*/giu, '$1'],
  // A query string on any other path or token.
  [/\?[^\s"'`<>]*=[^\s"'`<>]*/gu, ''],
  [/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, '[email]'],
  // Quoted strings. Inside single quotes, an apostrophe followed by a letter
  // (O'Brien, it's) does not close the quote.
  [
    new RegExp(
      `${notAfterWord}(?:"[^"\\n]*"|“[^”\\n]*”|«[^»\\n]*»|\`[^\`\\n]*\`|'(?:[^'\\n]|'(?=[\\p{L}\\p{N}_]))*'${notBeforeWord}|‘(?:[^’\\n]|’(?=[\\p{L}\\p{N}_]))*’${notBeforeWord})`,
      'gu',
    ),
    '[redacted]',
  ],
  // A quote that never closes hides the rest of its line.
  [new RegExp(`${notAfterWord}["“«\`'‘][^\\n]*`, 'gu'), '[redacted]'],
  // Codes, postcodes and phone numbers.
  [/\p{N}{4,}/gu, '#'],
  [/\s+/gu, ' '],
];

/** The message an exception may carry, or undefined when nothing is left. */
export function scrubExceptionMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let text = value.slice(0, MESSAGE_INPUT_MAX_LENGTH);
  for (const [rule, replacement] of messageRules)
    text = text.replace(rule, replacement);
  text = Array.from(text.trim())
    .slice(0, EXCEPTION_MESSAGE_MAX_LENGTH)
    .join('')
    .trim();
  return text || undefined;
}

type Json = string | number | boolean | Json[] | { [key: string]: Json };
type Rule = (value: unknown) => Json | undefined;

const text =
  (max: number): Rule =>
  (value) =>
    typeof value === 'string' && value.length > 0 && value.length <= max
      ? value
      : undefined;
/** A file or path: the query string and fragment are removed. */
const path =
  (max: number): Rule =>
  (value) =>
    typeof value === 'string'
      ? text(max)(value.replace(/[?#].*$/su, ''))
      : undefined;
const integer: Rule = (value) =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
const flag: Rule = (value) => (typeof value === 'boolean' ? value : undefined);
const token =
  (pattern: RegExp): Rule =>
  (value) =>
    typeof value === 'string' && pattern.test(value) ? value : undefined;
const address = token(/^0x[0-9a-f]{1,16}$/i);

// Built-in, SDK and runtime names ("TypeError", "java.lang.IllegalState
// Exception", "EXC_BAD_ACCESS", "SIGABRT"), or Swift's fixed fatal kinds.
const swiftFatalTypes = ['Assertion failed', 'Fatal error', 'Precondition failed'];
function exceptionType(value: unknown): string {
  return typeof value === 'string' &&
    (/^[A-Za-z_$][A-Za-z0-9_$.:]{0,79}$/.test(value) ||
      swiftFatalTypes.includes(value))
    ? value
    : 'Error';
}

/** Stack frame fields: where the code is, never what it was working on. */
const frameFields: Record<string, Rule> = {
  platform: token(/^[a-z:]{1,32}$/),
  function: text(256),
  filename: path(512),
  abs_path: path(512),
  module: text(256),
  package: path(512),
  lineno: integer,
  colno: integer,
  in_app: flag,
  instruction_addr: address,
  image_addr: address,
  symbol_addr: address,
  chunk_id: token(/^[0-9a-f-]{1,64}$/i),
  map_id: text(128),
  method_synthetic: flag,
  client_resolved: flag,
};
const mechanismFields: Record<string, Rule> = {
  type: token(/^[a-z_]{1,40}$/),
  handled: flag,
  synthetic: flag,
  exception_id: integer,
  parent_id: integer,
};
/** Native binary images, which native frames are symbolicated against. */
const imageFields: Record<string, Rule> = {
  type: token(/^[a-z]{1,16}$/),
  debug_id: token(/^[0-9a-f-]{1,64}$/i),
  code_id: token(/^[0-9a-f]{1,64}$/i),
  code_file: path(512),
  image_addr: address,
  image_vmaddr: address,
  image_size: integer,
  arch: token(/^[a-z0-9_]{1,16}$/),
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function pickFields(rules: Record<string, Rule>, value: unknown) {
  const source = record(value);
  const clean: Record<string, Json> = {};
  if (!source) return clean;
  for (const [key, rule] of Object.entries(rules)) {
    if (!Object.hasOwn(source, key)) continue;
    const kept = rule(source[key]);
    if (kept !== undefined) clean[key] = kept;
  }
  return clean;
}
function list(value: unknown, max: number) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function scrubOne(value: unknown): Record<string, Json> | null {
  const exception = record(value);
  if (!exception) return null;
  const clean: Record<string, Json> = { type: exceptionType(exception.type) };
  const message = scrubExceptionMessage(exception.value);
  if (message) clean.value = message;
  const module = text(256)(exception.module);
  if (module) clean.module = module;
  const thread = integer(exception.thread_id);
  if (thread !== undefined) clean.thread_id = thread;
  const mechanism = pickFields(mechanismFields, exception.mechanism);
  if (Object.keys(mechanism).length) clean.mechanism = mechanism;
  const stack = record(exception.stacktrace);
  if (stack) {
    const frames = list(stack.frames, MAX_FRAMES)
      .map((frame) => pickFields(frameFields, frame))
      .filter((frame) => Object.keys(frame).length > 0);
    clean.stacktrace = {
      type: stack.type === 'resolved' ? 'resolved' : 'raw',
      frames,
    };
  }
  return clean;
}

const exceptionLevels = ['fatal', 'error', 'warning', 'log', 'info', 'debug'];
/**
 * The `$exception` properties that may leave the phone, or null when the
 * event carries no exception at all.
 */
export function scrubExceptionProperties(
  raw: Record<string, unknown>,
): Record<string, Json> | null {
  const exceptions = list(raw.$exception_list, MAX_EXCEPTIONS)
    .map(scrubOne)
    .filter((exception) => exception !== null);
  if (!exceptions.length) return null;
  const clean: Record<string, Json> = { $exception_list: exceptions };
  const level = raw.$exception_level;
  if (typeof level === 'string' && exceptionLevels.includes(level))
    clean.$exception_level = level;
  const source = token(/^[a-z_.]{1,40}$/)(raw.$exception_source);
  if (source) clean.$exception_source = source;
  const fingerprint = token(/^[A-Za-z0-9_.:-]{1,128}$/)(
    raw.$exception_fingerprint,
  );
  if (fingerprint) clean.$exception_fingerprint = fingerprint;
  const images = list(raw.$debug_images, MAX_IMAGES)
    .map((image) => pickFields(imageFields, image))
    .filter((image) => Object.keys(image).length > 0);
  if (images.length) clean.$debug_images = images;
  return clean;
}
