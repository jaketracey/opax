// Evaluate the local podspecs without installing or resolving any pods.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { productionVoiceEnabled } from '../plugins/voiceProduction';
const states = [
  ['production', '0'],
  ['production', '1'],
  ['e2e', '0'],
  ['development', '1'],
];
for (const [variant, switchValue] of states) {
  for (const name of ['OpaxVoiceCore', 'OpaxVoice']) {
    const spec = JSON.parse(
      execFileSync(
        'pod',
        ['ipc', 'spec', `modules/opax-voice/ios/${name}.podspec`],
        {
          env: {
            ...process.env,
            OPAX_VARIANT: variant,
            OPAX_PRODUCTION_VOICE: switchValue,
          },
          encoding: 'utf8',
        },
      ),
    );
    const conditions =
      spec.pod_target_xcconfig.SWIFT_ACTIVE_COMPILATION_CONDITIONS ?? '';
    assert.equal(
      conditions.includes('OPAX_VOICE_E2E'),
      variant === 'e2e',
      `${name}: synthetic/loopback condition is e2e-only`,
    );
    assert.equal(
      conditions.includes('OPAX_VOICE_PRODUCTION'),
      productionVoiceEnabled(variant, switchValue),
      `${name}: production compile gate follows the switch`,
    );
    assert(
      !conditions.includes('DEBUG'),
      'E2E uses the Release app configuration',
    );
    assert.equal(
      spec.source_files,
      name === 'OpaxVoiceCore'
        ? 'OpaxVoiceCore/Sources/OpaxVoiceCore/*.swift'
        : 'Bridge/*.swift',
    );
    assert.equal(spec.static_framework, true);
    if (name === 'OpaxVoiceCore') {
      assert.equal(
        spec.pod_target_xcconfig.SWIFT_STRICT_CONCURRENCY,
        'complete',
      );
      assert.equal(
        spec.pod_target_xcconfig.SWIFT_DEFAULT_ACTOR_ISOLATION,
        'nonisolated',
      );
    } else {
      assert.equal(
        spec.pod_target_xcconfig.SWIFT_STRICT_CONCURRENCY,
        undefined,
      );
      assert.equal(
        spec.pod_target_xcconfig.SWIFT_DEFAULT_ACTOR_ISOLATION,
        undefined,
      );
    }
    if (name === 'OpaxVoice') {
      assert(spec.dependencies.ExpoModulesCore);
      assert.deepEqual(spec.dependencies.OpaxVoiceCore, ['0.1.0']);
    }
  }
}
console.log(
  'PASS voice pod policy: separate core/Expo targets; synthetic/loopback compile condition absent in production',
);

// Resolve exactly as use_expo_modules! does, without prebuilding or installing.
for (const [variant, switchValue] of states) {
  const enabled = productionVoiceEnabled(variant, switchValue);
  const args = ['resolve', '--platform', 'apple', '--json'];
  if (variant === 'production' && !enabled)
    args.push('--exclude', 'opax-voice');
  const resolved = JSON.parse(
    execFileSync('./node_modules/.bin/expo-modules-autolinking', args, {
      encoding: 'utf8',
    }),
  );
  const voice = resolved.modules.filter(
    (module: { packageName: string }) => module.packageName === 'opax-voice',
  );
  assert.equal(
    voice.length,
    variant === 'production' && !enabled ? 0 : 1,
    `${variant}: voice autolinking exclusion`,
  );
  if (voice.length)
    assert.deepEqual(
      voice[0].pods.map((pod: { podName: string }) => pod.podName).sort(),
      ['OpaxVoice', 'OpaxVoiceCore'],
    );
}
if (process.env.OPAX_VARIANT === 'production') {
  const enabled = productionVoiceEnabled('production');
  assert(
    /OpaxVoice(?:Core)?/.test(readFileSync('ios/Podfile.lock', 'utf8')) ===
      enabled,
    'Production Podfile.lock follows the switch',
  );
  assert(
    readFileSync('ios/Podfile', 'utf8').includes(
      "use_expo_modules! :exclude => ['opax-voice']",
    ) === !enabled,
    'Production Podfile exclusion follows the switch',
  );
}
console.log(
  'PASS voice autolinking: production off excludes both pods; on links both; development/e2e retain both',
);
