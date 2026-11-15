import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyticsConfig, analyticsOptions } from '../src/analytics';
import { scrubEvent, type AnalyticsContext } from '../src/analytics/events';
import {
  EXCEPTION_MESSAGE_MAX_LENGTH,
  EXCEPTION_TYPES,
  MESSAGE_RULES,
  scrubExceptionMessage,
} from '../src/analytics/exceptions';

// Crash and error reports (docs/ANALYTICS.md). Every value below is
// invented. Each one sits where an error message or the SDK could carry it,
// and none may reach the payload `scrubEvent` returns.
const secrets = {
  search: 'wombat crossing grants',
  question: 'Did Senator Fixture vote against the bush tucker levy?',
  talk: 'tell me about the platypus inquiry',
  email: 'jo.fixture@example.org',
  code: '482913',
  field: 'Kookaburra Lane Smithfield',
};
const context: AnalyticsContext = {
  platform: 'ios',
  appVersion: '1.1.4',
  appBuild: '43',
  environment: 'production',
};
const frame = {
  platform: 'web:javascript',
  function: 'renderAnswer',
  filename: `main.jsbundle?q=${encodeURIComponent(secrets.search)}`,
  lineno: 1,
  colno: 48213,
  in_app: true,
  chunk_id: '5f0c3a1e-7b0d-4f4e-9d0b-3f2a6c1d9e77',
  // Source context and locals can hold strings the code was working on.
  context_line: `const q = "${secrets.question}"`,
  pre_context: [secrets.talk],
  vars: { search: secrets.search },
};
const nativeFrame = {
  platform: 'apple',
  instruction_addr: '0x0000000104a3c1d8',
  image_addr: '0x0000000104a00000',
  symbol_addr: '0x0000000104a3c100',
  package: '/private/var/containers/Bundle/Application/X/OPAX.app/OPAX',
  in_app: true,
};
function exceptionEvent(value: string, extra: Record<string, unknown> = {}) {
  return {
    event: '$exception',
    properties: {
      $lib: 'posthog-react-native',
      $lib_version: '4.85.1',
      $session_id: '01a1d2da-3c1f-7473-ae26-a29720df9a91',
      $os_name: 'iOS',
      $device_type: 'Mobile',
      $app_name: 'OPAX',
      $app_namespace: 'au.com.opax.app',
      $app_version: '1.1.4',
      $app_build: '43',
      $screen_name: '/person/[slug]',
      $screen_width: 1206,
      $screen_height: 2622,
      $app_state: 'active',
      $recording_status: 'disabled',
      $sdk_debug_session_start: 1794538880031,
      $exception_level: 'error',
      $exception_list: [
        {
          type: 'TypeError',
          value,
          mechanism: {
            type: 'onuncaughtexception',
            handled: false,
            synthetic: false,
            exception_id: 0,
            source: secrets.field,
          },
          stacktrace: { type: 'raw', frames: [frame, nativeFrame] },
          extra: secrets.question,
        },
      ],
      $debug_images: [
        {
          type: 'macho',
          debug_id: '0b8e6a3c-1d2e-3f40-8a9b-0c1d2e3f4a5b',
          code_file:
            '/private/var/containers/Bundle/Application/X/OPAX.app/OPAX',
          image_addr: '0x0000000104a00000',
          image_size: 1048576,
          arch: 'arm64e',
          note: secrets.field,
        },
      ],
      $exception_steps: [{ $message: `Searched ${secrets.search}` }],
      question: secrets.question,
      email: secrets.email,
      ...extra,
    },
    $set: { email: secrets.email },
  };
}
function leaks(payload: unknown) {
  const json = JSON.stringify(payload);
  return Object.values(secrets).filter(
    (secret) =>
      json.includes(secret) || json.includes(encodeURIComponent(secret)),
  );
}

test('the SDK autocaptures exceptions and native crashes, never console lines, breadcrumbs or push', () => {
  const config = analyticsConfig({
    analytics: {
      host: 'https://opax.com.au/ingest',
      projectToken: 'phc_fixture000000000000000000000000',
      environment: 'production',
    },
  })!;
  const options = analyticsOptions(config, context);
  expect(options.errorTracking).toEqual({
    autocapture: {
      uncaughtExceptions: true,
      unhandledRejections: true,
      console: [],
      nativeCrashes: true,
      androidNdkCrashes: true,
    },
    exceptionSteps: { enabled: false },
  });
  expect(options).toMatchObject({
    capturePushNotificationSubscriptions: false,
    capturePushNotificationOpened: false,
    enableSessionReplay: false,
    personProfiles: 'never',
    disableGeoip: true,
  });
  expect(
    options.customAppProperties instanceof Function &&
      options.customAppProperties({ $device_type: 'Mobile' }),
  ).toMatchObject({ $app_namespace: 'au.com.opax.app' });
});

test.each([
  ['double quotes', `Cannot read property "${secrets.search}" of undefined`],
  ['single quotes', `Property '${secrets.question}' doesn't exist`],
  ['an apostrophe inside quotes', `Unknown street 'O'Brien ${secrets.field}'`],
  ['curly quotes', `No match for “${secrets.talk}”`],
  ['backticks', `Unexpected value \`${secrets.search}\``],
  [
    'an unclosed quote',
    `JSON Parse error: Unexpected token '${secrets.question}`,
  ],
  [
    'a URL query',
    `GET https://opax.com.au/api/search?q=${encodeURIComponent(secrets.search)} failed`,
  ],
  [
    'a URL fragment',
    `Load failed: opax://ask#${encodeURIComponent(secrets.question)}`,
  ],
  [
    'a relative query',
    `Bad request /api/ask?question=${encodeURIComponent(secrets.question)}`,
  ],
  ['an email', `Sign-in failed for ${secrets.email}`],
  ['a code', `Code ${secrets.code} was rejected`],
  ['German quotes', `Kein Treffer für „${secrets.search}“`],
  ['corner brackets', `一致なし「${secrets.talk}」`],
  ['fullwidth quotes', `No match for ＂${secrets.question}＂`],
  ['reversed single quotes', `No match for ‛${secrets.field}‛`],
  ['double primes', `No match for ″${secrets.search}″`],
  ['a quote straight after a letter', `Bad key x"${secrets.question}" here`],
  [
    'an OPAX URL path',
    `GET https://opax.com.au/api/search/${encodeURIComponent(secrets.search)} failed`,
  ],
  [
    'an OPAX host without a scheme',
    `Load opax.com.au/ask/${encodeURIComponent(secrets.talk)} failed`,
  ],
  [
    'a bare fragment',
    `Load /ask#${encodeURIComponent(secrets.question)} failed`,
  ],
  [
    'URL credentials',
    `fetch https://${encodeURIComponent(secrets.field)}:${secrets.code}@example.org/a failed`,
  ],
  [
    'a quote across lines',
    `Bad input "first line\n${secrets.question}\nlast line" end`,
  ],
  ['a single quote across lines', `Bad '\n${secrets.search}\n' end`],
  [
    'an unclosed quote across lines',
    `Bad "first line\n${secrets.talk}\nlast line`,
  ],
  [
    'an OPAX host with a trailing dot',
    `GET https://opax.com.au./ask/${encodeURIComponent(secrets.question)} failed`,
  ],
  [
    'an API path with no host',
    `GET /api/search/${encodeURIComponent(secrets.search)} failed`,
  ],
  [
    'an app route with no host',
    `Route /ask/${encodeURIComponent(secrets.question)} missing`,
  ],
  ['a left single quote after a letter', `No match for x‘${secrets.field}’`],
  ['a low single quote after a letter', `No match for x‚${secrets.talk}‘`],
])('a message with %s keeps no private text', (_name, message) => {
  const scrubbed = scrubEvent(exceptionEvent(message), context)!;
  expect(leaks(scrubbed)).toEqual([]);
  expect(scrubbed.properties!.$exception_list).toHaveLength(1);
});

test('free text is never rewritten and sent: a message is one of the fixed texts, or nothing', () => {
  // What the pattern rules used to send, with the private part cut out.
  // None of it is a fixed text, so none of it is sent.
  for (const message of [
    `Property '${secrets.search}' doesn't exist`,
    `Request to https://opax.com.au/api/search?q=${secrets.code}#top timed out`,
    'Fetch https://example.org/img/a.png?w=2#x failed',
    'Route /ask#top missing',
    `Route /ask/${secrets.code} missing`,
    'GET /api/search/x%20y failed',
    'at /src/analytics/exceptions.ts:12:3',
    'a\u0085b\ufeffc\u001fd',
    "Can't find variable: Fixture",
    `Reply from ${secrets.email}`,
    `Render failed: ${'x'.repeat(400)}`,
    `"${secrets.question}"`,
  ])
    expect(scrubExceptionMessage(message)).toBeUndefined();
  // A known framework message is its fixed text, without what it
  // interpolates.
  expect(
    scrubExceptionMessage(
      `Cannot read property '${secrets.search}' of undefined`,
    ),
  ).toBe('Cannot read properties of undefined');
  expect(scrubExceptionMessage('Network request failed')).toBe(
    'Network request failed',
  );
  expect(scrubExceptionMessage(42)).toBeUndefined();
  // Every text that can be sent is written in the list, and is short.
  for (const [, , fixed] of MESSAGE_RULES) {
    expect(Array.from(fixed).length).toBeLessThanOrEqual(
      EXCEPTION_MESSAGE_MAX_LENGTH,
    );
    expect(scrubExceptionMessage(fixed)).toBe(fixed);
  }
});

test('the exception payload is rebuilt from fixed lists', () => {
  const scrubbed = scrubEvent(
    exceptionEvent(`Property '${secrets.question}' doesn't exist`, {
      $exception_fingerprint: 'person-render',
    }),
    context,
  )!;
  expect(scrubbed.$set).toBeUndefined();
  expect(Object.keys(scrubbed.properties!).sort()).toEqual(
    [
      '$app_build',
      '$app_name',
      '$app_namespace',
      '$app_version',
      '$debug_images',
      '$device_type',
      '$exception_fingerprint',
      '$exception_level',
      '$exception_list',
      '$geoip_disable',
      '$is_identified',
      '$lib',
      '$lib_version',
      '$os_name',
      '$process_person_profile',
      '$session_id',
      'app',
      'app_build',
      'app_version',
      'environment',
      'message_omitted',
      'platform',
      'route_pattern',
    ].sort(),
  );
  expect(scrubbed.properties).toMatchObject({
    $process_person_profile: false,
    $is_identified: false,
    $geoip_disable: true,
    $exception_level: 'error',
    // The SDK's screen is not sent; the route is, from the fixed list.
    route_pattern: '/person/[slug]',
    // The message was free text: left out, and said to be.
    message_omitted: true,
    platform: 'ios',
    app_version: '1.1.4',
    app_build: '43',
  });
  expect(scrubbed.properties!.$exception_list).toEqual([
    {
      type: 'TypeError',
      mechanism: {
        type: 'onuncaughtexception',
        handled: false,
        synthetic: false,
        exception_id: 0,
      },
      stacktrace: {
        type: 'raw',
        frames: [
          {
            platform: 'web:javascript',
            function: 'renderAnswer',
            filename: 'main.jsbundle',
            lineno: 1,
            colno: 48213,
            in_app: true,
            chunk_id: '5f0c3a1e-7b0d-4f4e-9d0b-3f2a6c1d9e77',
          },
          nativeFrame,
        ],
      },
    },
  ]);
  expect(scrubbed.properties!.$debug_images).toEqual([
    {
      type: 'macho',
      debug_id: '0b8e6a3c-1d2e-3f40-8a9b-0c1d2e3f4a5b',
      code_file: '/private/var/containers/Bundle/Application/X/OPAX.app/OPAX',
      image_addr: '0x0000000104a00000',
      image_size: 1048576,
      arch: 'arm64e',
    },
  ]);
});

test('free-text exception types and empty reports are not sent', () => {
  const event = exceptionEvent('Network request failed');
  event.properties.$exception_list[0]!.type = secrets.question;
  const scrubbed = scrubEvent(event, context)!;
  expect(scrubbed.properties!.$exception_list).toMatchObject([
    { type: 'Error', value: 'Network request failed' },
  ]);
  expect(
    scrubEvent(
      {
        event: '$exception',
        properties: { $exception_message: secrets.question },
      },
      context,
    ),
  ).toBeNull();
});

test('the native plugin patch applies the same rules', () => {
  // Swift and Kotlin copies of these rules live in the reviewed patch; a
  // change to the message cap or rules here must be made there too.
  const patch = readFileSync(
    join(__dirname, '../patches/@posthog+react-native-plugin+2.13.0.patch'),
    'utf8',
  );
  // Swift and Kotlin each carry the same cap.
  expect(
    patch.split(`opaxMessageMaxLength = ${EXCEPTION_MESSAGE_MAX_LENGTH}\n`),
  ).toHaveLength(3);
  // Both drop every native event that is not a crash or error report.
  expect(patch).toContain(
    'guard event.event == "$exception" else { return nil }',
  );
  expect(patch).toContain('if (event.event != "\\$exception") return null');
});

const plugin = join(__dirname, '../node_modules/@posthog/react-native-plugin');
const patchText = readFileSync(
  join(__dirname, '../patches/@posthog+react-native-plugin+2.13.0.patch'),
  'utf8',
);
/** The patched file's text from the patch: added and context lines, as written. */
function patchedSection(file: string) {
  const start = patchText.indexOf(
    `+++ b/node_modules/@posthog/react-native-plugin/${file}\n`,
  );
  const end = patchText.indexOf('\n--- a/', start);
  return patchText
    .slice(start, end === -1 ? undefined : end)
    .split('\n')
    .filter((line) => /^[+ ]/.test(line))
    .map((line) => line.slice(1))
    .join('\n');
}
const swiftSource = patchedSection('ios/PosthogReactNativePlugin.swift');
const kotlinSource = patchedSection(
  'android/src/main/java/com/posthogreactnativeplugin/PosthogReactNativePluginModule.kt',
);

test('Swift and Kotlin use the JS message rules and the same field patterns', () => {
  // Raw string literals hold the pattern text as written: #"..."# in Swift,
  // """...""" in Kotlin and String.raw in exceptions.ts.
  const swiftPatterns = [...swiftSource.matchAll(/opaxRegex\(#"(.*?)"#/g)].map(
    (match) => match[1],
  );
  const kotlinPatterns = [
    ...kotlinSource.matchAll(/opaxRegex\(\s*"""(.*?)"""/g),
  ].map((match) => match[1]);
  const jsPatterns = MESSAGE_RULES.map(([pattern]) => pattern);
  expect(swiftPatterns.slice(0, jsPatterns.length)).toEqual(jsPatterns);
  expect(kotlinPatterns.slice(0, jsPatterns.length)).toEqual(jsPatterns);
  expect([...kotlinPatterns].sort()).toEqual([...swiftPatterns].sort());
  // The same case-insensitive rules and replacements, in order.
  const swiftRules = [
    ...swiftSource.matchAll(
      /^    \(opaxRegex\(#".*?"#(, \.caseInsensitive)?\), "(.*)"\),$/gm,
    ),
  ].map((match) => [Boolean(match[1]), match[2]]);
  const kotlinRules = [
    ...kotlinSource.matchAll(
      /^    opaxRegex\(""".*?"""(, ignoreCase = true)?\) to "(.*)",$/gm,
    ),
  ].map((match) => [Boolean(match[1]), match[2]!.replace('\\$', '$')]);
  const jsRules = MESSAGE_RULES.map(([, ignoreCase, replacement]) => [
    ignoreCase,
    replacement,
  ]);
  expect(swiftRules).toEqual(jsRules);
  expect(kotlinRules).toEqual(jsRules);
  // Android's java.util.regex runs on ICU, which rejects Java's (?U) flag:
  // every Kotlin rule would throw when the file's class loads.
  expect(kotlinSource).not.toMatch(/Regex\("\(\?U\)|"\(\?U\)\$pattern"/);
  // The same context lists as events.ts, without the screen name.
  for (const value of [
    '"posthog-react-native"',
    '"Mobile", "Tablet", "Desktop", "TV"',
    '"iOS", "iPadOS", "Android"',
  ]) {
    expect(swiftSource).toContain(value);
    expect(kotlinSource).toContain(value);
  }
  // Neither native copy sends a screen name: its shape is all they could
  // check, and a path with a record's key in it has that shape.
  for (const source of [swiftSource, kotlinSource]) {
    const block = source.slice(source.indexOf('OPAX privacy patch ('));
    expect(block).toContain('message_omitted');
    expect(block).not.toMatch(/"\\?\$screen_name"/);
    expect(block).not.toMatch(/\$current_url|\$pathname/);
  }
});

test('an exception’s type is sent only from the fixed set: a name is whatever the code set it to', () => {
  const types = (...given: unknown[]) =>
    (
      scrubEvent(
        {
          event: '$exception',
          properties: {
            $exception_list: given.map((type) => ({ type, value: 'x' })),
          },
        },
        context,
      )!.properties!.$exception_list as { type: string }[]
    ).map((exception) => exception.type);
  // Identifier-shaped, and data all the same: from the privacy review.
  const named = Object.assign(new Error('x'), { name: 'Grayndler' });
  expect(
    types(named.name, 'Anthony.Albanese', 'housing_affordability_3000'),
  ).toEqual(['Error', 'Error', 'Error']);
  // A listed name with anything added is not that name.
  expect(
    types(
      'typeerror',
      'TypeError ',
      'java.lang.IllegalStateException: Grayndler',
      'Fatal error: Grayndler',
      'EXC_BAD_ACCESS_3000',
      7,
      null,
      '',
    ),
  ).toEqual(Array(8).fill('Error'));
  // The classes and runtime names reports do carry.
  const kept = [
    'TypeError',
    'RangeError',
    'ApiError',
    'PersonIdentityError',
    'ChatSyncError',
    'AskFailure',
    'OpaxTestReport',
    'EXC_BAD_ACCESS',
    'SIGABRT',
    'NSInvalidArgumentException',
    'std::runtime_error',
    'java.lang.IllegalStateException',
    'com.facebook.react.common.JavascriptException',
    'Fatal error',
  ];
  expect(types(...kept.slice(0, 10))).toEqual(kept.slice(0, 10));
  expect(types(...kept.slice(10))).toEqual(kept.slice(10));
  expect(new Set(EXCEPTION_TYPES).size).toBe(EXCEPTION_TYPES.length);
  // Nothing on the list could be a reader's words: a class or signal name,
  // or one of Swift's three fatal kinds.
  for (const type of EXCEPTION_TYPES)
    expect(type).toMatch(
      /^(?:[A-Za-z_][A-Za-z0-9_]*(?:(?:\.|::)[A-Za-z_][A-Za-z0-9_]*)*|Assertion failed|Fatal error|Precondition failed)$/,
    );
});

test('Swift and Kotlin hold the same set of exception types', () => {
  /** The quoted names, one a line, between a list's opening and its close. */
  const listed = (source: string, open: string, close: string) => {
    const start = source.indexOf(open);
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf(close, start);
    return [
      ...source.slice(start + open.length, end).matchAll(/^\s+"(.*)",$/gm),
    ].map((match) => match[1]);
  };
  expect(
    listed(
      swiftSource,
      'private let opaxExceptionTypes: Set<String> = [',
      '\n]',
    ),
  ).toEqual(EXCEPTION_TYPES);
  expect(
    listed(
      kotlinSource,
      'private val opaxExceptionTypes: Set<String> =\n  setOf(',
      '\n  )',
    ),
  ).toEqual(EXCEPTION_TYPES);
  // Neither copy passes a type for its shape any more.
  expect(swiftSource).toContain(
    '"type": opaxExceptionTypes.contains(type) ? type : "Error"',
  );
  expect(kotlinSource).toContain(
    'clean["type"] = if (type in opaxExceptionTypes) type else "Error"',
  );
  for (const source of [swiftSource, kotlinSource])
    expect(source).not.toMatch(/opaxExceptionType\b|opaxSwiftFatalTypes/);
});

test('the native SDK fetches no feature flags, person properties or GeoIP', () => {
  // posthog-react-native passes `preloadFeatureFlags: true` to the native SDK
  // once native crash capture is on, and none of the app's flag settings, so
  // the patch fixes them after it reads the JS options.
  const swift = readFileSync(
    join(plugin, 'ios/PosthogReactNativePlugin.swift'),
    'utf8',
  );
  const read = swift.indexOf(
    'config.preloadFeatureFlags = sdkOptions["preloadFeatureFlags"]',
  );
  expect(read).toBeGreaterThan(-1);
  const fixed = swift.slice(read);
  expect(fixed.indexOf('config.preloadFeatureFlags = false')).toBeGreaterThan(
    0,
  );
  expect(fixed).toContain('config.setDefaultPersonProperties = false');
  expect(fixed).toContain('config.disableGeoIp = true');
  expect(swift.lastIndexOf('config.preloadFeatureFlags =')).toBe(
    read + fixed.indexOf('config.preloadFeatureFlags = false'),
  );
  expect(swift.indexOf('PostHogSDK.shared.setup(config)')).toBeGreaterThan(
    read + fixed.indexOf('config.disableGeoIp = true'),
  );
  const kotlin = readFileSync(
    join(
      plugin,
      'android/src/main/java/com/posthogreactnativeplugin/PosthogReactNativePluginModule.kt',
    ),
    'utf8',
  );
  const kotlinRead = kotlin.indexOf(
    'preloadFeatureFlags = thePreloadFeatureFlags',
  );
  expect(kotlinRead).toBeGreaterThan(-1);
  expect(kotlin.lastIndexOf('preloadFeatureFlags = ')).toBe(
    kotlin.indexOf('preloadFeatureFlags = false', kotlinRead),
  );
  expect(
    kotlin.indexOf('setDefaultPersonProperties = false', kotlinRead),
  ).toBeGreaterThan(kotlinRead);
  // Neither copy is the patch's alone: the patch carries them too.
  expect(swiftSource).toContain('config.disableGeoIp = true');
  expect(kotlinSource).toContain('setDefaultPersonProperties = false');
});

test('the plugin pins exactly the reviewed posthog-ios', () => {
  // `~> 3.92.7` would let a fresh pod install take a later 3.92.x than the
  // one this patch and the release verifier were reviewed against.
  const podspec = readFileSync(
    join(plugin, 'posthog-react-native-plugin.podspec'),
    'utf8',
  );
  expect(podspec).toContain("posthog_ios_version = '3.92.7'");
  expect(podspec).toContain(
    `s.dependency 'PostHog', "= #{posthog_ios_version}"`,
  );
  expect(podspec).toContain(
    "requirement: { kind: 'exactVersion', version: posthog_ios_version }",
  );
  expect(podspec).not.toMatch(/~>|upToNext/);
  expect(patchedSection('posthog-react-native-plugin.podspec')).toContain(
    `s.dependency 'PostHog', "= #{posthog_ios_version}"`,
  );
});

/**
 * Every value in a payload, without its property names: what could carry a
 * reader's words. A forbidden word is looked for here, so a property's own
 * name (`$process_person_profile`) is never mistaken for a leak.
 */
function leafValues(payload: unknown): string {
  if (payload === null || typeof payload !== 'object') return String(payload);
  return Object.values(payload).map(leafValues).join('\n');
}

/**
 * Every `$exception`, whatever caught the error: a message is sent only when
 * it is on the fixed list, and then as the fixed text. Rewriting free text by
 * pattern cannot make it safe, so nothing is rewritten.
 */
describe('a message is sent only from the fixed list', () => {
  const sentFor = (message: unknown, extra: Record<string, unknown> = {}) => {
    const scrubbed = scrubEvent(
      {
        event: '$exception',
        properties: {
          $exception_list: [{ type: 'Error', value: message }],
          ...extra,
        },
      },
      context,
    )!;
    const properties = scrubbed.properties as {
      $exception_list: { value?: string }[];
      message_omitted?: boolean;
    };
    return {
      message: properties.$exception_list[0]!.value,
      omitted: properties.message_omitted === true,
      // The values only: a property's name is not a leak.
      text: leafValues(scrubbed),
    };
  };

  // From the privacy review: each came through the pattern rules with the
  // reader's own words in it.
  test.each([
    [
      'Invalid URL: housing affordability in 3000',
      /housing|affordability|3000/,
    ],
    ['No electorate for Grayndler', /Grayndler|electorate/],
    [
      'Unknown member Anthony Albanese (postcode 2042, 800)',
      /Anthony|Albanese|2042|800|postcode/,
    ],
    ['person/tony-abbott is not a record route', /tony|abbott|record route/],
  ])('free text sends no message: %s', (message, words) => {
    const sent = sentFor(message);
    expect(sent).toMatchObject({ message: undefined, omitted: true });
    expect(sent.text).not.toMatch(words);
  });

  test('a 1,000-character message, an email address, a postcode and a long id send no message', () => {
    for (const message of [
      'a'.repeat(1000),
      'render failed '.repeat(72),
      'Could not load the profile for jane.citizen@example.com today',
      'No seat found for postcode 3040',
      'Record 1234567890 has no title',
      'Bill au-federal-r7520 failed to draw',
    ]) {
      const sent = sentFor(message);
      expect(sent).toMatchObject({ message: undefined, omitted: true });
      expect(sent.text).not.toMatch(
        /aaaa|render failed|jane|example\.com|3040|1234567890|r7520/,
      );
    }
  });

  test('a fixed message is sent as it is, and a framework message as its fixed opening', () => {
    for (const message of [
      'Network request failed',
      'Failed to fetch',
      'The request timed out',
      'Maximum call stack size exceeded',
      'Rendered more hooks than during the previous render.',
      'Rendered fewer hooks than expected.',
      'Missing OPAX build configuration',
      'OPAX test error report',
    ])
      expect(sentFor(message)).toMatchObject({ message, omitted: false });
    for (const [message, fixed] of [
      [
        'Maximum update depth exceeded. This can happen when a component repeatedly calls setState.',
        'Maximum update depth exceeded',
      ],
      [
        'Too many re-renders. React limits the number of renders to prevent an infinite loop.',
        'Too many re-renders',
      ],
      [
        'Objects are not valid as a React child (found: object with keys {postcode, Grayndler}).',
        'Objects are not valid as a React child',
      ],
      [
        "Cannot read properties of undefined (reading 'housingAffordability3000')",
        'Cannot read properties of undefined',
      ],
      [
        "Cannot read property 'tonyAbbott' of null",
        'Cannot read properties of null',
      ],
    ] as const) {
      const sent = sentFor(message);
      expect(sent).toMatchObject({ message: fixed, omitted: false });
      expect(sent.text).not.toMatch(
        /postcode|Grayndler|housing|3000|tony|Abbott|reading|setState|limits/,
      );
    }
  });

  test('a look-alike is not a known message; no message at all is not an omission', () => {
    for (const message of [
      'Maximum update depth exceededGrayndler',
      'Too many re-renders-housing',
      'grants: Too many re-renders',
      'Network request failed for Grayndler',
      'Network request failed\n',
      ' Network request failed',
      'network request failed',
      '   ',
    ])
      expect(sentFor(message)).toMatchObject({
        message: undefined,
        omitted: true,
      });
    for (const message of ['', undefined, 7, null])
      expect(sentFor(message)).toMatchObject({
        message: undefined,
        omitted: false,
      });
  });

  test('no report carries the SDK’s screen, a URL, a path or a parameter; its route is a fixed pattern or absent', () => {
    // An uncaught error or a rejection: the SDK's screen, which the app sets
    // to a route template, becomes the route only when it is on the list.
    expect(
      scrubEvent(
        exceptionEvent('Network request failed', {
          $current_url: 'opax://bill/r7520?tab=votes',
          $pathname: '/bill/r7520',
          params: { key: 'r7520' },
        }),
        context,
      )!.properties,
    ).toMatchObject({ route_pattern: '/person/[slug]' });
    for (const screen of [
      '/bill/r7520',
      '/person/tony-abbott',
      '/search/housing',
      '/electorate/grayndler?from=search',
    ]) {
      const scrubbed = scrubEvent(
        exceptionEvent('Network request failed', {
          $screen_name: screen,
          $current_url: `opax:/${screen}`,
          $pathname: screen,
          params: { key: 'r7520', slug: 'tony-abbott' },
        }),
        context,
      )!;
      for (const key of [
        '$screen_name',
        '$current_url',
        '$pathname',
        'params',
        'route_pattern',
      ])
        expect(scrubbed.properties).not.toHaveProperty(key);
      expect(JSON.stringify(scrubbed)).not.toMatch(
        /r7520|tony-abbott|housing|grayndler|from=search/,
      );
    }
  });
});
