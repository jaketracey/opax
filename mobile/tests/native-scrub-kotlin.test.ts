import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scrubEvent, type AnalyticsContext } from '../src/analytics/events';
import { scrubExceptionMessage } from '../src/analytics/exceptions';

// Native crash reports skip the JS `before_send`, so the plugin patch scrubs
// them again in Kotlin on Android. This runs the Kotlin copy, cut from the
// patch by scripts/check-native-scrub-kotlin.sh and compiled with the Kotlin
// compiler Gradle has cached, on the invented inputs in
// tests/fixtures/exception-scrub-cases.json, and expects what the JS rules
// keep, as tests/native-scrub.test.ts does for Swift. It runs where that
// compiler and Java 17 or later are found (the Android desktop, with
// JAVA_HOME set) and is skipped elsewhere; OPAX_REQUIRE_KOTLIN_SCRUB=1 makes a
// missing compiler fail instead. It runs on the JVM's java.util.regex, not
// Android's ICU regex, so it does not replace the on-device logcat check in
// docs/android-crash-plugin-checks.md.
type Case = { event: string; properties: Record<string, unknown> };
const mobile = join(__dirname, '..');
const script = join(mobile, 'scripts/check-native-scrub-kotlin.sh');
const casesPath = join(__dirname, 'fixtures/exception-scrub-cases.json');
const cases = JSON.parse(readFileSync(casesPath, 'utf8')) as {
  messages: unknown[];
  events: Case[];
};
const context: AnalyticsContext = {
  platform: 'android',
  appVersion: '1.1.4',
  appBuild: '2026111590',
  environment: 'production',
};
// What both copies keep from an `$exception` event (as tests/native-scrub.test.ts).
// Native also tags the event with fixed values JS takes from its own context
// (platform, app, app_version, app_build, environment), so those are not compared.
const sharedKeys = [
  '$exception_list',
  '$exception_level',
  '$exception_source',
  '$exception_fingerprint',
  '$debug_images',
  '$lib',
  '$lib_version',
  '$session_id',
  '$device_type',
  '$os_name',
  '$app_name',
  '$app_namespace',
  '$app_version',
  '$app_build',
  '$screen_name',
];
function shared(properties: Record<string, unknown> | undefined) {
  if (!properties) return null;
  return Object.fromEntries(
    sharedKeys
      .filter((key) => key in properties)
      .map((key) => [key, properties[key]]),
  );
}

const probe = spawnSync('bash', [script, '--probe'], { encoding: 'utf8' });
const runs =
  probe.status === 0 || process.env.OPAX_REQUIRE_KOTLIN_SCRUB === '1';
// A skip says why, in the test's name and on stderr (which --silent keeps).
const skipped = runs
  ? ''
  : ` (skipped: ${probe.stderr.trim() || `probe exit ${probe.status}`}; OPAX_REQUIRE_KOTLIN_SCRUB=1 fails instead)`;
if (skipped) process.stderr.write(`native-scrub-kotlin.test.ts${skipped}\n`);
const kotlinTest = runs ? test : test.skip;

kotlinTest(
  `the Kotlin scrub in the plugin patch keeps what the JS rules keep${skipped}`,
  () => {
    const result = spawnSync('bash', [script, casesPath], {
      encoding: 'utf8',
      timeout: 300_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    expect([result.status, result.stderr]).toEqual([0, expect.anything()]);
    const native = JSON.parse(result.stdout) as {
      rulesCompiled: boolean;
      messages: (string | null)[];
      events: (Record<string, unknown> | null)[];
    };
    expect(native.rulesCompiled).toBe(true);
    expect(native.messages).toEqual(
      cases.messages.map((message) => scrubExceptionMessage(message) ?? null),
    );
    expect(native.events).toHaveLength(cases.events.length);
    cases.events.forEach((input, index) => {
      const kept = native.events[index];
      if (input.event !== '$exception') {
        // Native lets nothing but crash and error reports through.
        expect(kept).toBeNull();
        return;
      }
      const js = scrubEvent(structuredClone(input), context);
      expect([index, shared(kept ?? undefined)]).toEqual([
        index,
        shared(js?.properties),
      ]);
      if (kept)
        expect(kept).toMatchObject({
          platform: 'android',
          $process_person_profile: false,
          $is_identified: false,
          $geoip_disable: true,
        });
    });
  },
  300_000,
);

// The field lists themselves, everywhere (no compiler needed): each Kotlin
// map names the same keys, in the same order, as its JS counterpart.
const patch = readFileSync(
  join(mobile, 'patches/@posthog+react-native-plugin+2.13.0.patch'),
  'utf8',
);
function kotlinKeys(name: string) {
  const start = patch.indexOf(`+private val ${name}: Map<String, OpaxField> =`);
  expect(start).toBeGreaterThan(-1);
  const block = patch.slice(start, patch.indexOf('\n+  )\n', start));
  return [...block.matchAll(/^\+\s+"((?:\\\$)?\w+)" to\b/gm)].map(
    ([, key = '']) => key.replace('\\$', '$'),
  );
}
function jsKeys(file: string, name: string) {
  const source = readFileSync(join(mobile, 'src/analytics', file), 'utf8');
  const start = source.indexOf(`const ${name}: Record<string, Rule> = {`);
  expect(start).toBeGreaterThan(-1);
  const block = source.slice(start, source.indexOf('\n};', start));
  return [...block.matchAll(/^ {2}(\$?\w+):/gm)].map(([, key = '']) => key);
}

test('the Kotlin field lists match exceptions.ts and sdkProperties', () => {
  const lists: [kotlin: string, js: string][] = [
    ['opaxFrameFields', 'frameFields'],
    ['opaxMechanismFields', 'mechanismFields'],
    ['opaxImageFields', 'imageFields'],
  ];
  for (const [kotlin, js] of lists) {
    const keys = jsKeys('exceptions.ts', js);
    expect(keys.length).toBeGreaterThan(4);
    expect([kotlin, kotlinKeys(kotlin)]).toEqual([kotlin, keys]);
  }
  // Native events also keep the app's own app_version and app_build when the
  // JS copy of a fatal error carried them; JS sets those from its context.
  const sdk = jsKeys('events.ts', 'sdkProperties');
  expect(sdk).toContain('$screen_name');
  expect(kotlinKeys('opaxContextFields')).toEqual([
    ...sdk,
    'app_version',
    'app_build',
  ]);
});
