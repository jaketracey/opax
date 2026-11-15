# Draft: a PostHog ingestion rule for app exception messages, types and frames

**Status: a draft. Nothing here has been created, changed or run in PostHog.**
No PostHog API was called to write it. It is written for whoever sets it up to
check in PostHog's own transformation tester first.

## Why

From the build that carries the fixed message list (see "Messages" in
`ANALYTICS.md`), the app sends an exception's message only when it is on that
list, and never sends `$screen_name` on a report. Builds already on phones
(1.1.4 and earlier, and 1.1.5 before that change) cannot be changed. They send:

- `$exception_list[].value`: the message after pattern rewriting (quotes,
  URLs, emails and long numbers removed, cut to 120 characters). Unquoted free
  text survives that, for example `No electorate for Grayndler`.
- `$screen_name`: the SDK's screen, kept when it has the shape of a route
  template. The app sets it to a template (`/person/[slug]`), but the shape
  check would also pass a path with a record's key in it.
- `$exception_list[].type`: the error's name, kept when it has the shape of
  an identifier. Code can set a name to anything, and `Grayndler` has that
  shape. From the build with the fixed type set (see "Types"), only a name in
  the set is sent.
- Stack frames with a free-text `function` and `filename`. The SDK reads an
  error's `stack` a line at a time, and a line of the message with a path or
  a URL in it parses as a frame: `AskFailure: No electorate for Grayndler
  2042 at /electorate/grayndler` arrives as a frame whose `function` is
  "AskFailure: No electorate for Grayndler 2042 at " and whose `filename` is
  "/electorate/grayndler". From the build with the frame rule (see "Frames"),
  such a frame is dropped.
- Never `$current_url`, `$pathname` or route parameters: they are on no list
  in any build. The rule drops them anyway, so it does not depend on that.

This rule applies the same message list, type set and frame rule to those
reports as they arrive. An audit of the app's stored reports from 11 Nov 2026
on (5 events, 190 frames) found no frame with a space or a colon in its name
and none with a route or a URL for its source, so no stored leak is known;
the rule is for the ones that could arrive.

## What it runs on (the filter)

A realtime transformation (Data pipelines, Transformations, a custom Hog
function), filtered to:

- event name is `$exception`, and
- event property `platform` is `ios` or `android`.

Not `$lib`. The app's own scrub keeps `$lib` only when it is
`posthog-react-native`, so a JS report carries it, but a native crash report
(built by posthog-ios or posthog-android) arrives with no `$lib` at all.
`platform` is set to `ios` or `android` by every copy of the scrub, on every
report, and the website does not set it to either value. If the website's
events are ever given a `platform` of `ios` or `android`, add `app` equals
`opax` and check the website does not send that either.

Order: it must run before anything that reads the message. See "To check
before enabling", item 1.

## The transformation (Hog source)

```hog
// OPAX app: an exception's message is sent on only when it is on the fixed
// list, its type only when it is in the fixed set, and a stack frame only when
// it is a code location. The same rules as MESSAGE_RULES, EXCEPTION_TYPES and
// FRAME_PATTERNS in mobile/src/analytics/exceptions.ts.

// Whole messages with nothing interpolated: kept as they are.
let exact := [
    'Network request failed',
    'Failed to fetch',
    'The request timed out',
    'Maximum call stack size exceeded',
    'Rendered more hooks than during the previous render.',
    'Rendered fewer hooks than expected.',
    'Missing OPAX build configuration',
    'OPAX test error report'
]

// Framework messages with a fixed opening: [pattern, the fixed text kept].
// What the message goes on to say is not kept.
let openings := [
    ['^Maximum update depth exceeded($|[^A-Za-z0-9_-])', 'Maximum update depth exceeded'],
    ['^Rendered more hooks than during the previous render($|[^A-Za-z0-9_-])', 'Rendered more hooks than during the previous render'],
    ['^Rendered fewer hooks than expected($|[^A-Za-z0-9_-])', 'Rendered fewer hooks than expected'],
    ['^Too many re-renders($|[^A-Za-z0-9_-])', 'Too many re-renders'],
    ['^Objects are not valid as a React child($|[^A-Za-z0-9_-])', 'Objects are not valid as a React child'],
    ['^Invalid hook call($|[^A-Za-z0-9_-])', 'Invalid hook call'],
    ['^Text strings must be rendered within a <Text> component($|[^A-Za-z0-9_-])', 'Text strings must be rendered within a <Text> component'],
    ['(?s)^Cannot read propert(y|ies) (.* )?of undefined($|[^A-Za-z0-9_-])', 'Cannot read properties of undefined'],
    ['(?s)^Cannot read propert(y|ies) (.* )?of null($|[^A-Za-z0-9_-])', 'Cannot read properties of null']
]

// The types that may be kept (EXCEPTION_TYPES). Any other becomes 'Error'.
let types := [
    'Error', 'AggregateError', 'EvalError', 'RangeError', 'ReferenceError',
    'SyntaxError', 'TypeError', 'URIError', 'ApiError', 'PersonIdentityError',
    'ChatSyncError', 'AskFailure', 'ElectionUnavailable', 'OpaxTestReport',
    'EXC_BAD_ACCESS', 'EXC_BAD_INSTRUCTION', 'EXC_ARITHMETIC', 'EXC_EMULATION',
    'EXC_SOFTWARE', 'EXC_BREAKPOINT', 'EXC_SYSCALL', 'EXC_MACH_SYSCALL',
    'EXC_RPC_ALERT', 'EXC_CRASH', 'EXC_RESOURCE', 'EXC_GUARD', 'EXC_CORPSE_NOTIFY',
    'SIGABRT', 'SIGBUS', 'SIGFPE', 'SIGILL', 'SIGKILL', 'SIGPIPE', 'SIGSEGV', 'SIGSYS',
    'SIGTERM', 'SIGTRAP', 'NSGenericException', 'NSRangeException',
    'NSInvalidArgumentException', 'NSInternalInconsistencyException',
    'NSMallocException', 'NSObjectInaccessibleException',
    'NSObjectNotAvailableException', 'NSDestinationInvalidException',
    'NSPortTimeoutException', 'NSInvalidSendPortException',
    'NSInvalidReceivePortException', 'NSPortSendException', 'NSPortReceiveException',
    'NSCharacterConversionException', 'NSFileHandleOperationException',
    'NSUnknownKeyException', 'NSParseErrorException',
    'NSInvalidArchiveOperationException', 'NSInvalidUnarchiveOperationException',
    'std::exception', 'std::runtime_error', 'std::logic_error', 'std::out_of_range',
    'std::bad_alloc', 'std::invalid_argument', 'std::length_error', 'std::bad_cast',
    'java.lang.ArithmeticException', 'java.lang.ArrayIndexOutOfBoundsException',
    'java.lang.AssertionError', 'java.lang.ClassCastException',
    'java.lang.ClassNotFoundException', 'java.lang.Error', 'java.lang.Exception',
    'java.lang.ExceptionInInitializerError', 'java.lang.IllegalArgumentException',
    'java.lang.IllegalStateException', 'java.lang.IndexOutOfBoundsException',
    'java.lang.InterruptedException', 'java.lang.LinkageError',
    'java.lang.NegativeArraySizeException', 'java.lang.NoClassDefFoundError',
    'java.lang.NoSuchFieldError', 'java.lang.NoSuchMethodError',
    'java.lang.NullPointerException', 'java.lang.NumberFormatException',
    'java.lang.OutOfMemoryError', 'java.lang.RuntimeException',
    'java.lang.SecurityException', 'java.lang.StackOverflowError',
    'java.lang.StringIndexOutOfBoundsException', 'java.lang.UnsatisfiedLinkError',
    'java.lang.UnsupportedOperationException', 'java.lang.VerifyError',
    'java.io.IOException', 'java.io.FileNotFoundException',
    'java.util.ConcurrentModificationException', 'java.util.NoSuchElementException',
    'java.util.concurrent.CancellationException',
    'java.util.concurrent.ExecutionException',
    'java.util.concurrent.RejectedExecutionException',
    'java.util.concurrent.TimeoutException', 'kotlin.KotlinNullPointerException',
    'kotlin.NoWhenBranchMatchedException', 'kotlin.NotImplementedError',
    'kotlin.TypeCastException', 'kotlin.UninitializedPropertyAccessException',
    'android.app.RemoteServiceException', 'android.content.ActivityNotFoundException',
    'android.database.sqlite.SQLiteException', 'android.os.BadParcelableException',
    'android.os.DeadObjectException', 'android.os.NetworkOnMainThreadException',
    'android.os.RemoteException', 'android.os.TransactionTooLargeException',
    'android.util.AndroidRuntimeException', 'android.view.InflateException',
    'com.facebook.jni.CppException',
    'com.facebook.react.bridge.JSApplicationIllegalArgumentException',
    'com.facebook.react.common.JavascriptException',
    'com.facebook.react.uimanager.IllegalViewOperationException', 'Assertion failed',
    'Fatal error', 'Precondition failed'
]

// Frame patterns (FRAME_PATTERNS), for RE2. A length limit the app writes as a
// lookahead is checked with length() where the pattern is used.
let jsFunction := '^([?]|<anonymous>|[?]?[A-Za-z_$][A-Za-z0-9_$]*([.][A-Za-z_$][A-Za-z0-9_$]*)*)$'
let jsBundle := '^([A-Za-z0-9_.:/-]{0,400}/)?(main[.]jsbundle|index[.]android[.]bundle)$'
let appleFunction := '^([A-Za-z_$][A-Za-z0-9_$.]*|(__[0-9]+)?[-+]\\[[A-Za-z_][A-Za-z0-9_]*([(][A-Za-z0-9_]+[)])? [A-Za-z_][A-Za-z0-9_:]*\\](_block_invoke[A-Za-z0-9_.]*)?)$'
let appleModule := '^[A-Za-z0-9_.+-]{1,128}$'
let applePackage := '^((/private)?/var/containers/Bundle/Application/[0-9A-Fa-f-]{36}/OPAX[.]app/(OPAX|Frameworks/[A-Za-z0-9_.+-]{1,64}(/[A-Za-z0-9_.+-]{1,64})?)|(/private/preboot/Cryptexes/OS)?/(System/Library|usr/lib)/[A-Za-z0-9_.+/-]{1,300})$'
let javaModule := '^[A-Za-z_$-][A-Za-z0-9_$-]*([.][A-Za-z_$-][A-Za-z0-9_$-]*)*$'
let javaFunction := '^(<init>|<clinit>|[A-Za-z_$][A-Za-z0-9_$-]{0,127})$'
let javaFilename := '^[A-Za-z0-9_$.-]{1,128}$'
let mapId := '^[A-Za-z0-9_.:@+-]{1,128}$'
let address := '^0x[0-9a-fA-F]{1,16}$'
let chunkId := '^[0-9a-fA-F-]{1,64}$'

fun isText(value, pattern, max) {
    return typeof(value) = 'string' and length(value) <= max and match(value, pattern)
}
fun isWhole(value) {
    return typeof(value) = 'integer' or (typeof(value) = 'float' and value = floor(value))
}

// The frame that may be kept, rebuilt from its platform's fields, or null.
fun cleanFrame(frame) {
    if (typeof(frame) != 'object') {
        return null
    }
    let platform := frame.platform
    let clean := {}
    if (platform = 'hermes' or platform = 'web:javascript') {
        // A JavaScript frame: a whole-number line, a plain function name and
        // the app's bundle, sent as the bundle's name alone.
        if (not isWhole(frame.lineno) or not isText(frame.function, jsFunction, 128) or not isText(frame.filename, jsBundle, 512)) {
            return null
        }
        clean.platform := platform
        clean.function := frame.function
        clean.filename := match(frame.filename, 'main[.]jsbundle$') ? 'main.jsbundle' : 'index.android.bundle'
        clean.lineno := frame.lineno
        if (isWhole(frame.colno)) { clean.colno := frame.colno }
        if (typeof(frame.in_app) = 'boolean') { clean.in_app := frame.in_app }
        if (isText(frame.chunk_id, chunkId, 64)) { clean.chunk_id := frame.chunk_id }
        return clean
    }
    if (platform = 'apple') {
        // An Apple frame is located by its instruction address.
        if (not isText(frame.instruction_addr, address, 18)) {
            return null
        }
        clean.platform := platform
        clean.instruction_addr := frame.instruction_addr
        if (isText(frame.image_addr, address, 18)) { clean.image_addr := frame.image_addr }
        if (isText(frame.symbol_addr, address, 18)) { clean.symbol_addr := frame.symbol_addr }
        if (typeof(frame.in_app) = 'boolean') { clean.in_app := frame.in_app }
        if (isText(frame.module, appleModule, 128)) { clean.module := frame.module }
        if (isText(frame.package, applePackage, 512)) { clean.package := frame.package }
        if (isText(frame.function, appleFunction, 256)) { clean.function := frame.function }
        return clean
    }
    if (platform = 'java') {
        // A Java frame is located by its class and method.
        if (not isText(frame.module, javaModule, 256) or not isText(frame.function, javaFunction, 128)) {
            return null
        }
        clean.platform := platform
        clean.module := frame.module
        clean.function := frame.function
        if (isText(frame.filename, javaFilename, 128)) { clean.filename := frame.filename }
        if (isWhole(frame.lineno)) { clean.lineno := frame.lineno }
        if (typeof(frame.in_app) = 'boolean') { clean.in_app := frame.in_app }
        if (isText(frame.map_id, mapId, 128)) { clean.map_id := frame.map_id }
        if (typeof(frame.method_synthetic) = 'boolean') { clean.method_synthetic := frame.method_synthetic }
        return clean
    }
    return null
}

if (event.event != '$exception') {
    return event
}

let returnEvent := event
let properties := returnEvent.properties ?? {}
let omitted := false

let list := properties.$exception_list
if (typeof(list) = 'array') {
    let cleaned := []
    for (let exception in list) {
        let item := exception
        let message := item?.value
        if (typeof(message) = 'string' and notEmpty(message)) {
            let known := null
            if (has(exact, message)) {
                known := message
            }
            for (let rule in openings) {
                if (known = null and match(message, rule.1)) {
                    known := rule.2
                }
            }
            if (known = null) {
                item.value := ''
                omitted := true
            } else {
                item.value := known
            }
        }
        // The type: a name in the fixed set, else 'Error'.
        if (not (typeof(item?.type) = 'string' and has(types, item.type))) {
            item.type := 'Error'
        }
        // An exception's module: a dotted name (a Java package), else nothing.
        if (item?.module != null and not isText(item.module, javaModule, 256)) {
            item.module := null
        }
        // The frames: each rebuilt from its platform's fields, or dropped. With
        // none left, the exception has no stack.
        if (item?.stacktrace != null) {
            let frames := []
            if (typeof(item.stacktrace?.frames) = 'array') {
                for (let frame in item.stacktrace.frames) {
                    let clean := cleanFrame(frame)
                    if (clean != null) {
                        frames := arrayPushBack(frames, clean)
                    }
                }
            }
            if (length(frames) > 0) {
                item.stacktrace := {
                    'type': item.stacktrace?.type = 'resolved' ? 'resolved' : 'raw',
                    'frames': frames
                }
            } else {
                item.stacktrace := null
            }
        }
        cleaned := arrayPushBack(cleaned, item)
    }
    properties.$exception_list := cleaned
}

// Rebuild the properties without the screen and URL properties, and without
// any copy of the message outside the list.
let dropped := [
    '$screen_name',
    '$current_url',
    '$pathname',
    '$exception_message',
    '$exception_values'
]
let kept := {}
for (let key, value in properties) {
    if (not has(dropped, key)) {
        kept[key] := value
    }
}
if (omitted) {
    kept.message_omitted := true
}

returnEvent.properties := kept
return returnEvent
```

The patterns are written for RE2, which Hog's `match` uses: RE2 has no
lookahead, so the app's `(?![\p{L}\p{N}_-])` (the opening ends at a word's end)
is written `($|[^A-Za-z0-9_-])`, and `(?s)` lets `.` cross a line break. The
ASCII class is a little looser than the app's Unicode one. That is safe: the
only thing ever kept is the fixed text on the right.

The type set and the frame patterns are the app's (`EXCEPTION_TYPES` and
`FRAME_PATTERNS` in `mobile/src/analytics/exceptions.ts`; "Types" and
"Frames" in `ANALYTICS.md` state the rule). For RE2 the app's length
lookahead `(?![\s\S]{129})` becomes a `length()` check, a non-capturing
group becomes a plain one, and `\.`, `\?`, `\(` are written `[.]`, `[?]`,
`[(]` so that only the Objective-C pattern's `\[` and `\]` need a backslash
(written `\\[` in a Hog string; see item 2 below). The frame fields are the
ones the SDK sends (`function`, `filename`, `lineno`). Error tracking stores
a processed frame (`mangled_name`, `resolved_name`, `source`, `line`) made
from them; item 1 is to confirm a transformation runs before that.

## Worked examples

### 1. Free text: the message goes, and the report says so

In (from 1.1.4, an uncaught error on a member's page):

```json
{
  "event": "$exception",
  "properties": {
    "$lib": "posthog-react-native",
    "$exception_level": "error",
    "$screen_name": "/person/[slug]",
    "platform": "ios",
    "app": "opax",
    "app_version": "1.1.4",
    "app_build": "73",
    "$exception_list": [
      {
        "type": "Error",
        "value": "No electorate for Grayndler",
        "mechanism": { "type": "onuncaughtexception", "handled": false },
        "stacktrace": {
          "type": "raw",
          "frames": [{ "platform": "hermes", "function": "seatFor", "filename": "main.jsbundle", "lineno": 1, "colno": 48213, "in_app": true }]
        }
      }
    ]
  }
}
```

Out:

```json
{
  "event": "$exception",
  "properties": {
    "$lib": "posthog-react-native",
    "$exception_level": "error",
    "platform": "ios",
    "app": "opax",
    "app_version": "1.1.4",
    "app_build": "73",
    "message_omitted": true,
    "$exception_list": [
      {
        "type": "Error",
        "value": "",
        "mechanism": { "type": "onuncaughtexception", "handled": false },
        "stacktrace": {
          "type": "raw",
          "frames": [{ "platform": "hermes", "function": "seatFor", "filename": "main.jsbundle", "lineno": 1, "colno": 48213, "in_app": true }]
        }
      }
    ]
  }
}
```

`value` is empty, `message_omitted` is true, `$screen_name` is gone. The type
is in the set and the frame is a code location, so both stay.

### 2. A known framework message: its fixed text stays, its tail goes

In (from 1.1.4; the app's pattern rewriting had already replaced the quoted
property name):

```json
{
  "event": "$exception",
  "properties": {
    "$lib": "posthog-react-native",
    "$screen_name": "/bill/[key]",
    "platform": "android",
    "app": "opax",
    "app_version": "1.1.4",
    "app_build": "73",
    "$exception_list": [
      { "type": "TypeError", "value": "Cannot read property [redacted] of undefined" },
      { "type": "Error", "value": "Network request failed" }
    ]
  }
}
```

Out:

```json
{
  "event": "$exception",
  "properties": {
    "$lib": "posthog-react-native",
    "platform": "android",
    "app": "opax",
    "app_version": "1.1.4",
    "app_build": "73",
    "$exception_list": [
      { "type": "TypeError", "value": "Cannot read properties of undefined" },
      { "type": "Error", "value": "Network request failed" }
    ]
  }
}
```

Both messages are on the list, so nothing is omitted and `message_omitted` is
not set. `$screen_name` is gone.

### 3. A type named from data and a message read as frames: both go

In (from 1.1.5 before the frame rule; the SDK read the stack's first line,
`Grayndler: No seat at /electorate/grayndler`, as a frame, and the real frame
carries the bundle's path on the phone):

```json
{
  "event": "$exception",
  "properties": {
    "$lib": "posthog-react-native",
    "platform": "ios",
    "app": "opax",
    "app_version": "1.1.5",
    "app_build": "80",
    "message_omitted": true,
    "$exception_list": [
      {
        "type": "Grayndler",
        "mechanism": { "type": "onuncaughtexception", "handled": false },
        "stacktrace": {
          "type": "raw",
          "frames": [
            { "platform": "hermes", "function": "seatFor", "filename": "/private/var/containers/Bundle/Application/5F0C3A1E-7B0D-4F4E-9D0B-3F2A6C1D9E77/OPAX.app/main.jsbundle", "lineno": 1, "colno": 48213, "in_app": true },
            { "platform": "hermes", "function": "next", "filename": "native", "in_app": true },
            { "platform": "hermes", "function": "Grayndler: No seat at ", "filename": "/electorate/grayndler", "in_app": true }
          ]
        }
      },
      {
        "type": "AskFailure",
        "stacktrace": {
          "type": "raw",
          "frames": [{ "platform": "hermes", "function": "Jane Citizen housing ", "filename": "https://x/s", "in_app": true }]
        }
      }
    ]
  }
}
```

Out:

```json
{
  "event": "$exception",
  "properties": {
    "$lib": "posthog-react-native",
    "platform": "ios",
    "app": "opax",
    "app_version": "1.1.5",
    "app_build": "80",
    "message_omitted": true,
    "$exception_list": [
      {
        "type": "Error",
        "mechanism": { "type": "onuncaughtexception", "handled": false },
        "stacktrace": {
          "type": "raw",
          "frames": [{ "platform": "hermes", "function": "seatFor", "filename": "main.jsbundle", "lineno": 1, "colno": 48213, "in_app": true }]
        }
      },
      { "type": "AskFailure", "stacktrace": null }
    ]
  }
}
```

`Grayndler` is not in the set, so the type is `Error`. The real frame stays,
with the bundle's name in place of its path. The `(native)` frame has no line
and the two lines of text are not frames, so they go; the second exception
has no frame left and so no stack: the rule sets `stacktrace` (and a
`module` that is not a dotted name) to `null` rather than removing the key.
If the tester shows a way to remove a key from an object, use it.

## To check before enabling

These are the things this draft could not confirm without touching PostHog.

1. **Order.** Error tracking reads `$exception_list` to group issues and may
   copy the message into other properties or an issue's title. Confirm in a
   test project that this transformation runs before that, so no copy of the
   original message is stored. If it runs after, this rule does not do its
   job and the question goes back to the hub. The same for frames: the rule
   reads the fields the SDK sends (`function`, `filename`, `lineno`,
   `platform`). If the transformation is instead handed Error tracking's
   processed frames (`mangled_name`, `resolved_name`, `source`, `line`), the
   frame part must be rewritten for those names before it is enabled.
2. **Hog details.** Run both worked examples in the transformation tester and
   compare the output with the "Out" above. In particular: `typeof` returning
   `'array'` and `'string'`; `match` taking these RE2 patterns, `(?s)`
   included; `kept[key] := value` building an object; `has` on an array of
   strings; and `item.value := ''` changing the item that is then pushed.
   For the type and frame rules, run example 3 and also check: `fun`
   declarations and a function reading the patterns declared above it; the
   `? :` conditional; `floor`; `typeof` returning `'integer'`, `'float'`,
   `'boolean'` and `'object'`; an object literal with quoted keys; setting a
   property to `null`; `match` with `{0,400}` and `{36}` counts; and that
   `'\\['` in a Hog string reaches RE2 as `\[` (the Objective-C method
   pattern). Then confirm in the tester that a frame whose `function` is
   `AskFailure: No electorate for Grayndler 2042 at ` is dropped and that an
   Apple and a Java frame from a real crash come through whole.
3. **Grouping.** Emptying a message changes how existing issues group. Expect
   issues from older builds to regroup by type and stack. Sending the
   bundle's name for its path, and dropping `(native)` frames and frames that
   were lines of text, changes a stack's fingerprint too.
4. **New builds.** A report from a build with the fixed list already carries
   only a fixed text or no `value`. The rule leaves it as it is: a fixed text
   matches the list, and a missing or empty `value` is skipped. A report from
   a build with the type set and the frame rule already carries only what
   this rule keeps, so its types and frames pass unchanged.
5. **Stored events.** This changes events as they arrive. It does not touch
   what is already stored; removing messages from stored events is a separate
   decision.
