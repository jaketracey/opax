import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { formatA11yIssue, scanA11yTree } from './a11y-static';
import { scanSource } from './source-boundary';
import { scanSecrets } from './secret-boundary';
import { boundaryFiles } from './boundary-files';
import { scanSwift } from './swift-boundary';
import { scanNative } from './native-boundary';
import { policy, productionVoiceEnabled } from '../plugins/voiceProduction';
import {
  assertNoCommunity,
  assertNoE2ELaunchFlags,
  assertNoFixtureOrigin,
  assertNoVoiceFixtures,
} from './release-bundle-policy';
const productionVoice = productionVoiceEnabled('production');
function config(variant: string, analyticsSwitch = '0') {
  return JSON.parse(
    execFileSync(
      './node_modules/.bin/expo',
      ['config', '--json', '--type', 'public'],
      {
        env: {
          ...process.env,
          OPAX_VARIANT: variant,
          OPAX_ANALYTICS: analyticsSwitch,
          EXPO_NO_TELEMETRY: '1',
        },
        encoding: 'utf8',
      },
    ),
  );
}
const release = config('production');
const e2e = config('e2e');
for (const variant of ['production', 'e2e', 'development']) {
  const introspected = JSON.parse(
    execFileSync(
      './node_modules/.bin/expo',
      ['config', '--json', '--type', 'introspect'],
      {
        env: { ...process.env, OPAX_VARIANT: variant, EXPO_NO_TELEMETRY: '1' },
        encoding: 'utf8',
      },
    ),
  );
  const native = introspected._internal.modResults.ios.infoPlist;
  assert.equal(
    native.NSMicrophoneUsageDescription,
    variant === 'production' && productionVoice
      ? policy.microphonePurpose
      : undefined,
  );
  if (variant === 'production' && productionVoice) {
    assert.equal(native.OPAXVoiceConsentDefault, false);
    assert.deepEqual(native.OPAXVoiceAllowedRoutes, policy.routes);
  }
  // The app is light-only. expo-splash-screen switches the whole app to
  // Automatic when a dark splash is configured, so guard the result.
  assert.equal(
    native.UIUserInterfaceStyle,
    'Light',
    'The app stays light-only',
  );
  assert.equal(native.UILaunchStoryboardName, 'SplashScreen');
  assert.equal(
    native.NSLocationWhenInUseUsageDescription,
    'OPAX uses your location once, on this iPhone, to find your electorate. It is not sent anywhere.',
  );
  assert.equal(
    native['NSLocationWhenInUseUsageDescription~ipad'],
    'OPAX uses your location once, on this iPad, to find your electorate. It is not sent anywhere.',
  );
  assert.equal(native.NSMotionUsageDescription, undefined);
  assert(
    !native.NSLocationAlwaysUsageDescription &&
      !native.NSLocationAlwaysAndWhenInUseUsageDescription,
  );
  assert(!native.UIBackgroundModes?.includes('location'));
  assert.deepEqual(
    Object.keys(native)
      .filter((k) => /^NS.*UsageDescription$/.test(k))
      .sort(),
    [
      'NSLocationWhenInUseUsageDescription',
      ...(variant === 'production' && productionVoice
        ? ['NSMicrophoneUsageDescription']
        : []),
    ].sort(),
  );

  assert.deepEqual(native.UIApplicationSceneManifest, {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
        },
      ],
    },
  });
  if (variant === 'production') {
    assert(
      !native.OPAXVoiceFixturePort,
      'Production omits native voice fixtures',
    );
    assert(
      !native.NSAppTransportSecurity,
      'CNG must remove release ATS exceptions',
    );
  } else if (variant === 'e2e') {
    assert.equal(
      native.OPAXVoiceFixturePort,
      Number(process.env.OPAX_FIXTURE_PORT ?? 8910),
    );
    assert.deepEqual(
      native.NSAppTransportSecurity,
      e2e.ios.infoPlist.NSAppTransportSecurity,
    );
  }
}
assert.equal(release.extra.apiOrigin, 'https://opax.com.au');
assert.equal(
  release.extra.router.sitemap,
  false,
  'Production debugging sitemap is disabled',
);
assert.equal(
  e2e.extra.apiOrigin,
  `http://127.0.0.1:${process.env.OPAX_FIXTURE_PORT ?? 8910}`,
);
assert(
  !/127\.0\.0\.1|localhost|fixture|NSAppTransportSecurity|NSAllowsLocalNetworking/.test(
    JSON.stringify(release),
  ),
);
assert(!JSON.stringify(e2e).includes('opax.com.au'));
// Analytics: iOS production sends through the opax.com.au proxy; e2e and
// development carry no analytics configuration, even with the old opt-in.
assert.deepEqual(release.extra.analytics, {
  host: 'https://opax.com.au/ingest',
  projectToken: 'phc_AsHnQM2UrGBubA5HU9sagkGbg8vqQLNXu3WjEhPRDejr',
  environment: 'production',
});
assert.equal(e2e.extra.analytics, undefined, 'E2E builds send no analytics');
for (const variant of ['development', 'e2e'])
  for (const optIn of ['0', '1'])
    assert.equal(
      config(variant, optIn).extra.analytics,
      undefined,
      `${variant} builds send no analytics, including OPAX_ANALYTICS=${optIn}`,
    );
assert.deepEqual(
  release.ios.privacyManifests.NSPrivacyCollectedDataTypes.filter(
    (entry: { NSPrivacyCollectedDataTypePurposes: string[] }) =>
      entry.NSPrivacyCollectedDataTypePurposes.includes(
        'NSPrivacyCollectedDataTypePurposeAnalytics',
      ),
  ).map(
    (entry: {
      NSPrivacyCollectedDataType: string;
      NSPrivacyCollectedDataTypeTracking: boolean;
    }) => [
      entry.NSPrivacyCollectedDataType,
      entry.NSPrivacyCollectedDataTypeTracking,
    ],
  ),
  [
    ['NSPrivacyCollectedDataTypeProductInteraction', false],
    ['NSPrivacyCollectedDataTypeDeviceID', false],
  ],
  'Analytics declares Product Interaction and Device ID, never tracking',
);
assert.deepEqual(
  release.ios.privacyManifests.NSPrivacyCollectedDataTypes.filter(
    (entry: { NSPrivacyCollectedDataType: string }) =>
      /CrashData|OtherDiagnosticData/.test(entry.NSPrivacyCollectedDataType),
  ).map(
    (entry: {
      NSPrivacyCollectedDataType: string;
      NSPrivacyCollectedDataTypeTracking: boolean;
    }) => [
      entry.NSPrivacyCollectedDataType,
      entry.NSPrivacyCollectedDataTypeTracking,
    ],
  ),
  [
    ['NSPrivacyCollectedDataTypeCrashData', false],
    ['NSPrivacyCollectedDataTypeOtherDiagnosticData', false],
  ],
  'Crash reports declare Crash Data and Other Diagnostic Data, never tracking',
);
for (const app of [release, e2e]) {
  assert.equal(app.name, 'OPAX');
  assert.equal(app.version, '1.1.4');
  // The API User-Agent and analytics report the store version.
  assert.equal(app.extra.appVersion, app.version);
  assert.equal(app.ios.bundleIdentifier, 'au.com.opax.app');
  assert.equal(app.ios.buildNumber, process.env.OPAX_BUILD_NUMBER ?? '1');
  assert.equal(
    app.ios.infoPlist.NSMicrophoneUsageDescription,
    app.extra.variant === 'production' && productionVoice
      ? policy.microphonePurpose
      : undefined,
  );
  assert.equal(app.ios.infoPlist.NSMotionUsageDescription, undefined);
  assert.equal(app.updates.enabled, false);
  // SDK 57's built-in deployment target; the scene plugin passes no deprecated
  // expo-build-properties target.
  assert.equal(app.ios.deploymentTarget, '18.4');
  assert(app.plugins.includes('./plugins/withSceneLifecycle.js'));
  assert(
    !JSON.stringify(app.plugins).includes('deploymentTarget'),
    'Use ios.deploymentTarget, not the deprecated build-properties option',
  );
}
assert.equal(
  e2e.ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads,
  false,
);
assert.equal(
  e2e.ios.infoPlist.NSAppTransportSecurity.NSExceptionDomains['127.0.0.1']
    .NSExceptionAllowsInsecureHTTPLoads,
  true,
);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
for (const version of Object.values({
  ...pkg.dependencies,
  ...pkg.devDependencies,
}))
  assert(
    /^[0-9]+\.[0-9]+\.[0-9]+$/.test(String(version)),
    'All direct dependencies must be pinned',
  );
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
// PostHog is the one reviewed analytics SDK (docs/ANALYTICS.md): the JS SDK,
// its two JS dependencies and the native crash plugin (scrubbed by its pinned
// privacy patch), never replay or another SDK.
assert.deepEqual(
  Object.keys(lock.packages)
    .filter((path) => /posthog/i.test(path))
    .sort(),
  [
    'node_modules/@posthog/core',
    'node_modules/@posthog/react-native-plugin',
    'node_modules/@posthog/types',
    'node_modules/posthog-react-native',
  ],
  'Only the reviewed PostHog JS SDK and native crash plugin',
);
for (const path of Object.keys(lock.packages))
  assert(
    !/node_modules\/(?:@sentry\/|@amplitude\/|@segment\/|@react-native-firebase\/|firebase(?:\/|$)|mixpanel|appcenter|react-native-appsflyer|react-native-adjust|expo-notifications|expo-tracking-transparency|expo-insights|@bugsnag\/|bugsnag|@datadog\/|datadog|react-native-fbsdk|@facebook\/)/i.test(
      path,
    ),
    `Forbidden SDK: ${path}`,
  );
function walk(root: string, skipGenerated = false): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory())
      return skipGenerated &&
        [
          'node_modules',
          'private',
          '.git',
          'coverage',
          '.expo',
          'ios',
          'android',
          'build',
        ].includes(name)
        ? []
        : walk(path, skipGenerated);
    return [path];
  });
}
const sourceRoot = process.argv.includes('--source-root')
  ? process.argv[process.argv.indexOf('--source-root') + 1]!
  : 'src';
const boundary = boundaryFiles(sourceRoot);
for (const path of boundary.javascript) {
  const content = readFileSync(path, 'utf8');
  assert(
    !/https?:\/\/(?:127\.0\.0\.1|localhost|opax\.com\.au)/.test(content),
    `Origins belong in build config: ${path}`,
  );
  assert.deepEqual(
    scanSource(path, content),
    [],
    `Transport boundary: ${path}`,
  );
}
for (const path of boundary.swift)
  assert.deepEqual(
    scanSwift(path, readFileSync(path, 'utf8')),
    [],
    `Swift transport boundary: ${path}`,
  );
for (const path of boundary.native)
  assert.deepEqual(
    scanNative(readFileSync(path, 'utf8')),
    [],
    `Objective-C/C transport boundary: ${path}`,
  );
// Accessibility rules on every screen and component (scripts/a11y-static.ts):
// roles, labels, images, Text roles, target sizes and label copy, on both
// platforms. Exceptions are inline a11y-ok markers with a reason.
const a11y = scanA11yTree(sourceRoot);
assert.deepEqual(
  a11y.issues.map(formatA11yIssue),
  [],
  'Accessibility rules (scripts/a11y-static.ts; excuse a deliberate case with an a11y-ok marker and its reason)',
);
// Scan all text-bearing tracked contributor files, including JS, JSON, shell,
// fixture manifests, documentation and dotfiles. Ignore only generated/local data.
const contributorFiles = walk('.', true).filter(
  (path) =>
    !/(?:^|\/)(?:node_modules|ios|android|build|private|coverage|\.expo|\.git)(?:\/|$)/.test(
      path,
    ) && !path.endsWith('.qa.local.env'),
);
assert.deepEqual(
  scanSecrets([...contributorFiles, ...boundary.tooling]),
  [],
  'Possible secret in contributor or module Node tooling files',
);
const appIndex = process.argv.indexOf('--app');
const productionIndex = process.argv.indexOf('--production-bundle');
if (productionIndex !== -1) {
  const directory = process.argv[productionIndex + 1]!;
  const bundles = walk(directory).filter((path) =>
    /\.(?:hbc|js|jsbundle)$/.test(path),
  );
  assert(bundles.length, 'Production JS bundle missing');
  for (const path of bundles) {
    const body = readFileSync(path);
    assertNoFixtureOrigin(body, process.env.OPAX_FIXTURE_PORT ?? '8910');
    assert(
      !body.includes(Buffer.from('OPAX_DESIGN_WORKBENCH')),
      'Production bundle contains the design workbench',
    );
    assertNoVoiceFixtures(body, productionVoice);
    assertNoE2ELaunchFlags(body);
    assertNoCommunity(body);
    execFileSync(
      'python3',
      ['scripts/verify-ios-release.py', '--bundle-only', path],
      { stdio: 'pipe' },
    );
    for (const testID of [
      'source-destination-url',
      'source-destination-scroll',
      'source-destination-ok',
      'money-test-focus',
      'money-test-year',
      'money-map-drawn-frames-',
    ])
      assert(
        !body.includes(Buffer.from(testID)),
        `Production bundle contains the e2e source destination preview (${testID})`,
      );
  }
  const bodies = bundles.map((path) => readFileSync(path));
  for (const marker of [
    'Route is outside the public catalog allow-list',
    'Search requires one explicit non-bill catalog kind',
    'Cross-origin API requests are forbidden',
    'Redirects are not allowed for catalog data',
  ])
    assert(
      bodies.some((body) => body.includes(Buffer.from(marker))),
      `Shipped allow-list guard missing: ${marker}`,
    );
  if (existsSync(join(directory, 'Info.plist')))
    execFileSync(
      'python3',
      ['scripts/verify-ios-release.py', '--privacy-only', directory],
      { stdio: 'inherit' },
    );
  console.log(
    'PASS production embedded JS: no fixture/loopback origin, workbench or Community; shipped route/origin/redirect guards present',
  );
}
if (appIndex !== -1) {
  const app = process.argv[appIndex + 1]!;
  const plist = JSON.parse(
    execFileSync(
      '/usr/bin/plutil',
      ['-convert', 'json', '-o', '-', join(app, 'Info.plist')],
      { encoding: 'utf8' },
    ),
  );
  assert.equal(plist.CFBundleIdentifier, 'au.com.opax.app');
  assert.equal(plist.CFBundleShortVersionString, '1.1.4');
  assert.equal(plist.CFBundleVersion, process.env.OPAX_BUILD_NUMBER ?? '1');
  assert.equal(plist.MinimumOSVersion, '18.4');
  assert(!plist.NSMicrophoneUsageDescription);
  assert.equal(
    plist.NSLocationWhenInUseUsageDescription,
    'OPAX uses your location once, on this iPhone, to find your electorate. It is not sent anywhere.',
  );
  assert.equal(plist.NSMotionUsageDescription, undefined);
  assert.deepEqual(
    Object.keys(plist)
      .filter((key) => /^NS.*UsageDescription$/.test(key))
      .sort(),
    ['NSLocationWhenInUseUsageDescription'].sort(),
  );
  assert(
    !plist.NSLocationAlwaysUsageDescription &&
      !plist.NSLocationAlwaysAndWhenInUseUsageDescription,
  );
  assert(!plist.UIBackgroundModes?.includes('location'));

  assert.equal(
    plist.OPAXVoiceFixturePort,
    Number(process.env.OPAX_FIXTURE_PORT ?? 8910),
  );
  assert.equal(plist.NSAppTransportSecurity.NSAllowsArbitraryLoads, false);
  const bundle = readFileSync(join(app, 'main.jsbundle'));
  assert(
    !bundle.includes(Buffer.from('https://opax.com.au')),
    'E2E bundle contains production origin',
  );
  const expoPlist = join(app, 'Expo.plist');
  const native = JSON.parse(
    execFileSync(
      '/usr/bin/plutil',
      ['-convert', 'json', '-o', '-', expoPlist],
      { encoding: 'utf8' },
    ),
  );
  assert.equal(native.EXUpdatesEnabled, false);
  const constantConfigs = walk(app).filter((path) =>
    path.endsWith('/app.config'),
  );
  assert(constantConfigs.length, 'Embedded Expo config missing');
  for (const path of constantConfigs) {
    const embedded = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(embedded.extra.variant, 'e2e');
    assert.equal(embedded.extra.apiOrigin, e2e.extra.apiOrigin);
    assert.equal(embedded.extra.fontAcknowledgements.length, 2);
    assert(
      embedded.extra.fontAcknowledgements.every((font: { notice: string }) =>
        font.notice.includes('SIL OPEN FONT LICENSE'),
      ),
    );
    assert(!readFileSync(path, 'utf8').includes('opax.com.au'));
  }
}
console.log(
  'PASS qa-static: variant origins/ATS, identity, iOS floor, dependency tree, secrets, transport boundary, accessibility rules',
);
console.log(
  `  accessibility: ${Object.entries(a11y.checked)
    .map(
      ([rule, count]) =>
        `${rule} ${count} checked${a11y.skipped[rule] ? `, ${a11y.skipped[rule]} not static` : ''}`,
    )
    .join('; ')}; ${a11y.exceptions.length} a11y-ok exceptions`,
);
