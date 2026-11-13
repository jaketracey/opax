import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyticsConfig, analyticsOptions } from '../src/analytics';
import { scrubEvent, type AnalyticsContext } from '../src/analytics/events';
import {
  EXCEPTION_MESSAGE_MAX_LENGTH,
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
          code_file: '/private/var/containers/Bundle/Application/X/OPAX.app/OPAX',
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
  ['an unclosed quote', `JSON Parse error: Unexpected token '${secrets.question}`],
  ['a URL query', `GET https://opax.com.au/api/search?q=${encodeURIComponent(secrets.search)} failed`],
  ['a URL fragment', `Load failed: opax://ask#${encodeURIComponent(secrets.question)}`],
  ['a relative query', `Bad request /api/ask?question=${encodeURIComponent(secrets.question)}`],
  ['an email', `Sign-in failed for ${secrets.email}`],
  ['a code', `Code ${secrets.code} was rejected`],
  ['German quotes', `Kein Treffer für „${secrets.search}“`],
  ['corner brackets', `一致なし「${secrets.talk}」`],
  ['fullwidth quotes', `No match for ＂${secrets.question}＂`],
  ['reversed single quotes', `No match for ‛${secrets.field}‛`],
  ['double primes', `No match for ″${secrets.search}″`],
  ['a quote straight after a letter', `Bad key x"${secrets.question}" here`],
  ['an OPAX URL path', `GET https://opax.com.au/api/search/${encodeURIComponent(secrets.search)} failed`],
  ['an OPAX host without a scheme', `Load opax.com.au/ask/${encodeURIComponent(secrets.talk)} failed`],
  ['a bare fragment', `Load /ask#${encodeURIComponent(secrets.question)} failed`],
  ['URL credentials', `fetch https://${encodeURIComponent(secrets.field)}:${secrets.code}@example.org/a failed`],
  ['a quote across lines', `Bad input "first line\n${secrets.question}\nlast line" end`],
  ['a single quote across lines', `Bad '\n${secrets.search}\n' end`],
  ['an unclosed quote across lines', `Bad "first line\n${secrets.talk}\nlast line`],
  ['an OPAX host with a trailing dot', `GET https://opax.com.au./ask/${encodeURIComponent(secrets.question)} failed`],
  ['an API path with no host', `GET /api/search/${encodeURIComponent(secrets.search)} failed`],
  ['an app route with no host', `Route /ask/${encodeURIComponent(secrets.question)} missing`],
  ['a left single quote after a letter', `No match for x‘${secrets.field}’`],
  ['a low single quote after a letter', `No match for x‚${secrets.talk}‘`],
])('a message with %s keeps no private text', (_name, message) => {
  const scrubbed = scrubEvent(exceptionEvent(message), context)!;
  expect(leaks(scrubbed)).toEqual([]);
  expect(scrubbed.properties!.$exception_list).toHaveLength(1);
});

test('messages keep their shape and are cut to a short length', () => {
  expect(
    scrubExceptionMessage(`Cannot read property '${secrets.search}' of undefined`),
  ).toBe('Cannot read property [redacted] of undefined');
  // An OPAX URL keeps its host; any other URL or path keeps its path.
  expect(
    scrubExceptionMessage(
      `Request to https://opax.com.au/api/search?q=${secrets.code}#top timed out`,
    ),
  ).toBe('Request to https://opax.com.au timed out');
  expect(
    scrubExceptionMessage('Fetch https://example.org/img/a.png?w=2#x failed'),
  ).toBe('Fetch https://example.org/img/a.png failed');
  expect(scrubExceptionMessage('Route /ask#top missing')).toBe(
    'Route /ask missing',
  );
  // A path with no host keeps its first segment ("/api/<endpoint>" for the
  // API); file paths under a filesystem root stay whole.
  expect(scrubExceptionMessage(`Route /ask/${secrets.code} missing`)).toBe(
    'Route /ask missing',
  );
  expect(scrubExceptionMessage('GET /api/search/x%20y failed')).toBe(
    'GET /api/search failed',
  );
  expect(scrubExceptionMessage('at /src/analytics/exceptions.ts:12:3')).toBe(
    'at /src/analytics/exceptions.ts:12:3',
  );
  // Spaces JavaScript and ICU disagree on become plain spaces.
  expect(scrubExceptionMessage('a\u0085b\ufeffc\u001fd')).toBe('a b c d');
  expect(scrubExceptionMessage("Can't find variable: Fixture")).toBe(
    "Can't find variable: Fixture",
  );
  expect(scrubExceptionMessage(`Reply from ${secrets.email}`)).toBe(
    'Reply from [email]',
  );
  const long = `Render failed: ${'x'.repeat(400)}`;
  expect(Array.from(scrubExceptionMessage(long)!)).toHaveLength(
    EXCEPTION_MESSAGE_MAX_LENGTH,
  );
  expect(scrubExceptionMessage(`"${secrets.question}"`)).toBe('[redacted]');
  expect(scrubExceptionMessage(42)).toBeUndefined();
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
      '$screen_name',
      '$session_id',
      'app',
      'app_build',
      'app_version',
      'environment',
      'platform',
    ].sort(),
  );
  expect(scrubbed.properties).toMatchObject({
    $process_person_profile: false,
    $is_identified: false,
    $geoip_disable: true,
    $exception_level: 'error',
    $screen_name: '/person/[slug]',
    platform: 'ios',
    app_version: '1.1.4',
    app_build: '43',
  });
  expect(scrubbed.properties!.$exception_list).toEqual([
    {
      type: 'TypeError',
      value: "Property [redacted] doesn't exist",
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
      { event: '$exception', properties: { $exception_message: secrets.question } },
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
  expect(patch).toContain('guard event.event == "$exception" else { return nil }');
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
  // The same context lists as events.ts, including the screen rule.
  for (const value of [
    '"posthog-react-native"',
    '"Mobile", "Tablet", "Desktop", "TV"',
    '"iOS", "iPadOS", "Android"',
  ]) {
    expect(swiftSource).toContain(value);
    expect(kotlinSource).toContain(value);
  }
  expect(swiftSource).toContain('"$screen_name": .screen');
  expect(kotlinSource).toContain('"\\$screen_name" to OpaxField.Screen');
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
