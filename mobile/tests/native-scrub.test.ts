import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scrubEvent, type AnalyticsContext } from '../src/analytics/events';
import { scrubExceptionMessage } from '../src/analytics/exceptions';

// Native crash reports skip the JS `before_send`, so the plugin patch scrubs
// them again in Swift and Kotlin. This runs the Swift copy, cut from the
// patch by scripts/check-native-scrub.sh, on the invented inputs in
// tests/fixtures/exception-scrub-cases.json and expects what the JS rules
// keep. The Mac has `swift` but no Kotlin compiler, so Kotlin is not run here;
// tests/analytics-exceptions.test.ts checks it uses the same pattern texts.
// On a Mac a missing `swift` fails the test; only Linux (no Xcode) skips it.
type Case = { event: string; properties: Record<string, unknown> };
const casesPath = join(__dirname, 'fixtures/exception-scrub-cases.json');
const cases = JSON.parse(readFileSync(casesPath, 'utf8')) as {
  messages: unknown[];
  events: Case[];
};
const context: AnalyticsContext = {
  platform: 'ios',
  appVersion: '1.1.4',
  appBuild: '58',
  environment: 'production',
};
// What both copies keep from an `$exception` event. Native also tags the
// event with fixed values JS takes from its own context (platform, app,
// app_version, app_build, environment), so those are not compared.
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

const swiftTest = process.platform === 'linux' ? test.skip : test;

swiftTest(
  'the Swift scrub in the plugin patch keeps what the JS rules keep',
  () => {
    const swift = spawnSync('swift', ['--version'], { encoding: 'utf8' });
    expect([swift.status, swift.error?.message ?? swift.stderr]).toEqual([
      0,
      expect.anything(),
    ]);
    const result = spawnSync(
      'bash',
      [join(__dirname, '../scripts/check-native-scrub.sh'), casesPath],
      { encoding: 'utf8', timeout: 240_000, maxBuffer: 16 * 1024 * 1024 },
    );
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
          platform: 'ios',
          $process_person_profile: false,
          $is_identified: false,
          $geoip_disable: true,
        });
    });
  },
  240_000,
);
