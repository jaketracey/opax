# Draft: a PostHog ingestion rule for app exception messages

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
- Never `$current_url`, `$pathname` or route parameters: they are on no list
  in any build. The rule drops them anyway, so it does not depend on that.

This rule applies the same list to those reports as they arrive.

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
// OPAX app: an exception message is sent on only when it is on the fixed list.
// The same list as MESSAGE_RULES in mobile/src/analytics/exceptions.ts.

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
          "frames": [{ "function": "seatFor", "filename": "main.jsbundle", "lineno": 1, "colno": 48213, "in_app": true }]
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
          "frames": [{ "function": "seatFor", "filename": "main.jsbundle", "lineno": 1, "colno": 48213, "in_app": true }]
        }
      }
    ]
  }
}
```

`value` is empty, `message_omitted` is true, `$screen_name` is gone. The type
and the frames are untouched.

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

## To check before enabling

These are the things this draft could not confirm without touching PostHog.

1. **Order.** Error tracking reads `$exception_list` to group issues and may
   copy the message into other properties or an issue's title. Confirm in a
   test project that this transformation runs before that, so no copy of the
   original message is stored. If it runs after, this rule does not do its
   job and the question goes back to the hub.
2. **Hog details.** Run both worked examples in the transformation tester and
   compare the output with the "Out" above. In particular: `typeof` returning
   `'array'` and `'string'`; `match` taking these RE2 patterns, `(?s)`
   included; `kept[key] := value` building an object; `has` on an array of
   strings; and `item.value := ''` changing the item that is then pushed.
3. **Grouping.** Emptying a message changes how existing issues group. Expect
   issues from older builds to regroup by type and stack.
4. **New builds.** A report from a build with the fixed list already carries
   only a fixed text or no `value`. The rule leaves it as it is: a fixed text
   matches the list, and a missing or empty `value` is skipped.
5. **Stored events.** This changes events as they arrive. It does not touch
   what is already stored; removing messages from stored events is a separate
   decision.
