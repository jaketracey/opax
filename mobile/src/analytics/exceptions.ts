/**
 * Anonymous crash and error reports (`$exception`, docs/ANALYTICS.md). The
 * SDK's exception properties are rebuilt here from fixed lists, the same way
 * `scrubEvent` rebuilds every other event: the exception's type, a message
 * only when it is one of a fixed list (else `message_omitted`), its stack
 * frames and the binary images native frames point into.
 * Breadcrumbs (`$exception_steps`), app state, screen sizes, debug fields and
 * anything else the SDK or a caller adds are dropped.
 *
 * Native crash reports never pass through here: the native SDK builds and
 * sends them itself. patches/@posthog+react-native-plugin+2.13.0.patch applies
 * these same rules in Swift and Kotlin, so keep the three in step.
 */

import { routeErrorPattern } from './route-patterns';

/**
 * No message sent is longer than this. Every message that can be sent is a
 * fixed text from the list below, and all are shorter; the cut is kept so a
 * text added later cannot be long. The Swift and Kotlin copies in the plugin
 * patch use the same number (`opaxMessageMaxLength`).
 */
export const EXCEPTION_MESSAGE_MAX_LENGTH = 120;
// Longer input is cut before the rules run.
const MESSAGE_INPUT_MAX_LENGTH = 4000;
const MAX_EXCEPTIONS = 10;
const MAX_FRAMES = 250;
const MAX_IMAGES = 500;

/**
 * The messages an exception may carry: [pattern, case-insensitive, the fixed
 * text sent]. A message is sent only when it matches one of these, first
 * match first, and what is sent is the fixed text on the right, never the
 * message itself. Anything else is left out, and the report says so
 * (`message_omitted: true`).
 *
 * Rewriting free text by pattern cannot make it safe: "No electorate for
 * Grayndler" has no quote, address or long number in it. So nothing is
 * rewritten. The first group are whole messages with nothing interpolated
 * (the ones `opax_route_error` allows, events.ts, and the test report's).
 * The second are framework messages with a fixed opening; some go on to
 * interpolate a value (an object's keys, a property's name), and that tail
 * is never sent because only the fixed text is.
 *
 * The Swift and Kotlin copies in the plugin patch use these exact pattern
 * texts and fixed texts, in this order (tests/analytics-exceptions.test.ts
 * compares them), so they are written for JavaScript's `u` flag and for
 * ICU, which runs NSRegularExpression and Android's java.util.regex:
 * `(?![\s\S])` is the end of the message in all three (`$` is not: ICU's
 * also matches before a final line break).
 */
const whole = (text: string) =>
  [`^${text.replace(/[.]/g, '\\.')}(?![\\s\\S])`, false, text] as const;
const opening = (text: string) =>
  [`^${text}(?![\\p{L}\\p{N}_-])`, false, text] as const;
export const MESSAGE_RULES: readonly (readonly [string, boolean, string])[] = [
  whole('Network request failed'),
  whole('Failed to fetch'),
  whole('The request timed out'),
  whole('Maximum call stack size exceeded'),
  whole('Rendered more hooks than during the previous render.'),
  whole('Rendered fewer hooks than expected.'),
  whole('Missing OPAX build configuration'),
  whole('OPAX test error report'),
  opening('Maximum update depth exceeded'),
  opening('Rendered more hooks than during the previous render'),
  opening('Rendered fewer hooks than expected'),
  opening('Too many re-renders'),
  opening('Objects are not valid as a React child'),
  opening('Invalid hook call'),
  opening('Text strings must be rendered within a <Text> component'),
  // Hermes names the property in the middle ("Cannot read property 'x' of
  // undefined"), V8 at the end ("Cannot read properties of undefined
  // (reading 'x')"). The name is never sent.
  [
    String.raw`^Cannot read propert(?:y|ies)(?![\p{L}\p{N}_-])[\s\S]* of undefined(?![\p{L}\p{N}_-])`,
    false,
    'Cannot read properties of undefined',
  ],
  [
    String.raw`^Cannot read propert(?:y|ies)(?![\p{L}\p{N}_-])[\s\S]* of null(?![\p{L}\p{N}_-])`,
    false,
    'Cannot read properties of null',
  ],
];
const messageRules = MESSAGE_RULES.map(
  ([pattern, ignoreCase, fixed]) =>
    [new RegExp(pattern, ignoreCase ? 'iu' : 'u'), fixed] as const,
);

/**
 * The message an exception may carry: the fixed text of the first rule it
 * matches, or undefined when it matches none.
 */
export function scrubExceptionMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.slice(0, MESSAGE_INPUT_MAX_LENGTH);
  for (const [rule, fixed] of messageRules)
    if (rule.test(text))
      return Array.from(fixed).slice(0, EXCEPTION_MESSAGE_MAX_LENGTH).join('');
  return undefined;
}

type Json = string | number | boolean | Json[] | { [key: string]: Json };
type Rule = (value: unknown) => Json | undefined;

const integer: Rule = (value) =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
const flag: Rule = (value) => (typeof value === 'boolean' ? value : undefined);
const token =
  (pattern: RegExp): Rule =>
  (value) =>
    typeof value === 'string' && pattern.test(value) ? value : undefined;
const address = token(/^0x[0-9a-f]{1,16}$/i);

/**
 * The exception types that may be sent. A type is the error's `name`, which
 * code can set to anything: `Object.assign(new Error('x'), { name:
 * 'Grayndler' })` has an identifier-shaped name, so shape proves nothing.
 * Only a name on this list is sent; any other is "Error". The list is the
 * JavaScript error classes and the app's own, the kernel's exception and
 * signal names, Foundation's and the C++ library's exception names, the
 * usual Java, Kotlin, Android and React Native classes, and Swift's three
 * fatal kinds. The Swift and Kotlin copies in the plugin patch hold the same
 * list (`opaxExceptionTypes`; tests/analytics-exceptions.test.ts compares).
 */
export const EXCEPTION_TYPES: readonly string[] = [
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
  'ElectionUnavailable',
  'OpaxTestReport',
  'EXC_BAD_ACCESS',
  'EXC_BAD_INSTRUCTION',
  'EXC_ARITHMETIC',
  'EXC_EMULATION',
  'EXC_SOFTWARE',
  'EXC_BREAKPOINT',
  'EXC_SYSCALL',
  'EXC_MACH_SYSCALL',
  'EXC_RPC_ALERT',
  'EXC_CRASH',
  'EXC_RESOURCE',
  'EXC_GUARD',
  'EXC_CORPSE_NOTIFY',
  'SIGABRT',
  'SIGBUS',
  'SIGFPE',
  'SIGILL',
  'SIGKILL',
  'SIGPIPE',
  'SIGSEGV',
  'SIGSYS',
  'SIGTERM',
  'SIGTRAP',
  'NSGenericException',
  'NSRangeException',
  'NSInvalidArgumentException',
  'NSInternalInconsistencyException',
  'NSMallocException',
  'NSObjectInaccessibleException',
  'NSObjectNotAvailableException',
  'NSDestinationInvalidException',
  'NSPortTimeoutException',
  'NSInvalidSendPortException',
  'NSInvalidReceivePortException',
  'NSPortSendException',
  'NSPortReceiveException',
  'NSCharacterConversionException',
  'NSFileHandleOperationException',
  'NSUnknownKeyException',
  'NSParseErrorException',
  'NSInvalidArchiveOperationException',
  'NSInvalidUnarchiveOperationException',
  'std::exception',
  'std::runtime_error',
  'std::logic_error',
  'std::out_of_range',
  'std::bad_alloc',
  'std::invalid_argument',
  'std::length_error',
  'std::bad_cast',
  'java.lang.ArithmeticException',
  'java.lang.ArrayIndexOutOfBoundsException',
  'java.lang.AssertionError',
  'java.lang.ClassCastException',
  'java.lang.ClassNotFoundException',
  'java.lang.Error',
  'java.lang.Exception',
  'java.lang.ExceptionInInitializerError',
  'java.lang.IllegalArgumentException',
  'java.lang.IllegalStateException',
  'java.lang.IndexOutOfBoundsException',
  'java.lang.InterruptedException',
  'java.lang.LinkageError',
  'java.lang.NegativeArraySizeException',
  'java.lang.NoClassDefFoundError',
  'java.lang.NoSuchFieldError',
  'java.lang.NoSuchMethodError',
  'java.lang.NullPointerException',
  'java.lang.NumberFormatException',
  'java.lang.OutOfMemoryError',
  'java.lang.RuntimeException',
  'java.lang.SecurityException',
  'java.lang.StackOverflowError',
  'java.lang.StringIndexOutOfBoundsException',
  'java.lang.UnsatisfiedLinkError',
  'java.lang.UnsupportedOperationException',
  'java.lang.VerifyError',
  'java.io.IOException',
  'java.io.FileNotFoundException',
  'java.util.ConcurrentModificationException',
  'java.util.NoSuchElementException',
  'java.util.concurrent.CancellationException',
  'java.util.concurrent.ExecutionException',
  'java.util.concurrent.RejectedExecutionException',
  'java.util.concurrent.TimeoutException',
  'kotlin.KotlinNullPointerException',
  'kotlin.NoWhenBranchMatchedException',
  'kotlin.NotImplementedError',
  'kotlin.TypeCastException',
  'kotlin.UninitializedPropertyAccessException',
  'android.app.RemoteServiceException',
  'android.content.ActivityNotFoundException',
  'android.database.sqlite.SQLiteException',
  'android.os.BadParcelableException',
  'android.os.DeadObjectException',
  'android.os.NetworkOnMainThreadException',
  'android.os.RemoteException',
  'android.os.TransactionTooLargeException',
  'android.util.AndroidRuntimeException',
  'android.view.InflateException',
  'com.facebook.jni.CppException',
  'com.facebook.react.bridge.JSApplicationIllegalArgumentException',
  'com.facebook.react.common.JavascriptException',
  'com.facebook.react.uimanager.IllegalViewOperationException',
  'Assertion failed',
  'Fatal error',
  'Precondition failed',
];
const exceptionTypes: ReadonlySet<string> = new Set(EXCEPTION_TYPES);
function exceptionType(value: unknown): string {
  return typeof value === 'string' && exceptionTypes.has(value)
    ? value
    : 'Error';
}

/**
 * The patterns a stack frame's fields are held to. The Swift and Kotlin
 * copies in the plugin patch use these exact texts
 * (tests/analytics-exceptions.test.ts compares them), so they are written
 * for JavaScript's `u` flag and for ICU. Each must match the whole value.
 * `(?![\s\S]{n})` at the start is a length limit: fewer than n characters.
 */
export const FRAME_PATTERNS = {
  /**
   * A JavaScript function's name as Hermes prints it: the function's own
   * `name` (hermes lib/VM/JSError.cpp), so an identifier, a dotted path of
   * them, `anonymous`, `?anon_0_name` for a generator's inner function, and
   * the SDK's `?` or `<anonymous>` for none. No space and no colon: a line
   * of an error's message is not a function.
   */
  jsFunction: String.raw`^(?![\s\S]{129})(?:\?|<anonymous>|\??[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)$`,
  /**
   * The app's JavaScript bundle: `main.jsbundle` (iOS) or
   * `index.android.bundle`, alone or at the end of the path Hermes prints
   * it with. Only the bundle's name (the group) is sent, never the path.
   */
  jsBundle: String.raw`^(?:[A-Za-z0-9_.:/-]{0,400}/)?(main\.jsbundle|index\.android\.bundle)$`,
  /**
   * A native symbol as posthog-ios reads it: a C, C++ or Swift symbol
   * (mangled, so one run of identifier characters), or an Objective-C
   * method (`-[Class selector:]`, `+[Class(Category) selector]`), with the
   * numbered prefix and `_block_invoke` suffix a block's symbol has.
   */
  appleFunction: String.raw`^(?![\s\S]{257})(?:[A-Za-z_$][A-Za-z0-9_$.]*|(?:__[0-9]+)?[-+]\[[A-Za-z_][A-Za-z0-9_]*(?:\([A-Za-z0-9_]+\))? [A-Za-z_][A-Za-z0-9_:]*\](?:_block_invoke[A-Za-z0-9_.]*)?)$`,
  /** A binary image's name: `OPAX`, `Foundation`, `libsystem_kernel.dylib`. */
  appleModule: String.raw`^[A-Za-z0-9_.+-]{1,128}$`,
  /**
   * A binary image's file: `OPAX`, `Foundation`, `libhermes.so`, alone or at
   * the end of the path it was loaded from. Only the file's name (the group)
   * is sent. The path is not: on a phone the app's own binaries load from
   * the install's container folder, whose name is the same on every report
   * from that install. Symbols are matched by `debug_id` and the addresses.
   */
  binaryName: String.raw`^(?:/(?:[^\s/]{1,255}/){0,32})?([A-Za-z0-9_.+-]{1,128})$`,
  /** A Java or Kotlin class name with its package: `a.b.Foo$Bar`. */
  javaModule: String.raw`^(?![\s\S]{257})[A-Za-z_$-][A-Za-z0-9_$-]*(?:\.[A-Za-z_$-][A-Za-z0-9_$-]*)*$`,
  /** A Java or Kotlin method name: `invoke`, `<init>`, `lambda$onCreate$0`. */
  javaFunction: String.raw`^(?:<init>|<clinit>|[A-Za-z_$][A-Za-z0-9_$-]{0,127})$`,
  /** A class's source file name, never a path: `Foo.kt`, `SourceFile`. */
  javaFilename: String.raw`^[A-Za-z0-9_$.-]{1,128}$`,
  /** The release a Java frame's R8 mapping belongs to. */
  mapId: String.raw`^[A-Za-z0-9_.:@+-]{1,128}$`,
} as const;
const framePattern = (name: keyof typeof FRAME_PATTERNS) =>
  new RegExp(FRAME_PATTERNS[name], 'u');
/** A file sent as its name alone: the pattern's group, never the path. */
const named =
  (name: keyof typeof FRAME_PATTERNS): Rule =>
  (value) =>
    typeof value === 'string' ? framePattern(name).exec(value)?.[1] : undefined;
const bundle = named('jsBundle');
const binaryName = named('binaryName');

/**
 * Stack frames: where the code is, never what it was working on. A frame is
 * kept only as one of three shapes, chosen by its `platform`, and only with
 * the fields of that shape; a frame of any other platform, or without the
 * fields its shape needs, is dropped whole.
 *
 * The SDK reads a JavaScript error's `stack` a line at a time, and a line of
 * the error's message that has a path or a URL in it parses as a frame whose
 * `function` and `filename` are that line's words. So a JavaScript frame
 * needs all three of a whole-number line, a function that is a plain name
 * and a file that is the app's bundle. The other two shapes are built by
 * the native SDKs from the binary's own tables, never from text: an Apple
 * frame is located by its instruction address, a Java frame by its class
 * and method.
 */
const jsFrameFields: Record<string, Rule> = {
  platform: token(/^(?:hermes|web:javascript)$/),
  function: token(framePattern('jsFunction')),
  filename: bundle,
  lineno: integer,
  colno: integer,
  in_app: flag,
  chunk_id: token(/^[0-9a-f-]{1,64}$/i),
};
const appleFrameFields: Record<string, Rule> = {
  platform: token(/^apple$/),
  instruction_addr: address,
  image_addr: address,
  symbol_addr: address,
  in_app: flag,
  module: token(framePattern('appleModule')),
  package: binaryName,
  function: token(framePattern('appleFunction')),
};
const javaFrameFields: Record<string, Rule> = {
  platform: token(/^java$/),
  module: token(framePattern('javaModule')),
  function: token(framePattern('javaFunction')),
  filename: token(framePattern('javaFilename')),
  lineno: integer,
  in_app: flag,
  map_id: token(framePattern('mapId')),
  method_synthetic: flag,
};
type FrameShape = {
  fields: Record<string, Rule>;
  /** A frame without every one of these, valid, is dropped. */
  required: readonly string[];
};
const jsFrame: FrameShape = {
  fields: jsFrameFields,
  required: ['function', 'filename', 'lineno'],
};
const frameShapes = new Map<string, FrameShape>([
  ['hermes', jsFrame],
  ['web:javascript', jsFrame],
  ['apple', { fields: appleFrameFields, required: ['instruction_addr'] }],
  ['java', { fields: javaFrameFields, required: ['module', 'function'] }],
]);
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
  code_file: binaryName,
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

function scrubFrame(value: unknown): Record<string, Json> | null {
  const platform = record(value)?.platform;
  const shape =
    typeof platform === 'string' ? frameShapes.get(platform) : undefined;
  if (!shape) return null;
  const clean = pickFields(shape.fields, value);
  return shape.required.every((key) => Object.hasOwn(clean, key))
    ? clean
    : null;
}

function scrubOne(value: unknown): Record<string, Json> | null {
  const exception = record(value);
  if (!exception) return null;
  const clean: Record<string, Json> = { type: exceptionType(exception.type) };
  const message = scrubExceptionMessage(exception.value);
  if (message) clean.value = message;
  // A Java exception's package ("java.lang"): a dotted name, or nothing.
  const module = token(framePattern('javaModule'))(exception.module);
  if (module) clean.module = module;
  const thread = integer(exception.thread_id);
  if (thread !== undefined) clean.thread_id = thread;
  const mechanism = pickFields(mechanismFields, exception.mechanism);
  if (Object.keys(mechanism).length) clean.mechanism = mechanism;
  const stack = record(exception.stacktrace);
  const frames = list(stack?.frames, MAX_FRAMES)
    .map(scrubFrame)
    .filter((frame) => frame !== null);
  // No frame that may be sent: no stack at all.
  if (stack && frames.length)
    clean.stacktrace = {
      type: stack.type === 'resolved' ? 'resolved' : 'raw',
      frames,
    };
  return clean;
}

const exceptionLevels = ['fatal', 'error', 'warning', 'log', 'info', 'debug'];
/** A message was there, and it is not one that may be sent. */
function messageOmitted(value: unknown): boolean {
  const message = record(value)?.value;
  return (
    typeof message === 'string' &&
    message.length > 0 &&
    scrubExceptionMessage(message) === undefined
  );
}

/**
 * The `$exception` properties that may leave the phone, or null when the
 * event carries no exception at all. Every report is held to the same
 * rule, whatever caught the error (the global handler, the rejection
 * tracker, a route boundary, the test report): a message is sent only from
 * the fixed list, and `message_omitted: true` says one was left out. The
 * error's type and stack frames still locate it.
 */
export function scrubExceptionProperties(
  raw: Record<string, unknown>,
): Record<string, Json> | null {
  const listed = list(raw.$exception_list, MAX_EXCEPTIONS);
  const exceptions = listed
    .map(scrubOne)
    .filter((exception) => exception !== null);
  if (!exceptions.length) return null;
  const clean: Record<string, Json> = { $exception_list: exceptions };
  if (listed.some(messageOmitted)) clean.message_omitted = true;
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
  // The marker of a deliberate test report (sendTestErrorReport): the fixed
  // flag only, so dashboards can leave test reports out. JavaScript reports
  // only; a native crash report never carries it.
  if (raw.opax_test === true) clean.opax_test = true;
  // The route the error happened on: one of the fixed route-file patterns
  // ("/bill/[key]"), or nothing. A route boundary names it itself
  // (reportRouteError); for any other report it is the SDK's screen, which
  // the app sets to a route template, kept only when it is on that list.
  // Never a path, a parameter's value or a query. The SDK's own screen
  // property is not sent on a report (events.ts). JavaScript reports only.
  const route =
    routeErrorPattern(raw.route_pattern) ?? routeErrorPattern(raw.$screen_name);
  if (route) clean.route_pattern = route;
  return clean;
}
