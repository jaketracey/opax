import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { scanSource, sourceExtensions, secretPattern } from './source-boundary';
function config(variant: string) {
  return JSON.parse(
    execFileSync(
      './node_modules/.bin/expo',
      ['config', '--json', '--type', 'public'],
      {
        env: { ...process.env, OPAX_VARIANT: variant, EXPO_NO_TELEMETRY: '1' },
        encoding: 'utf8',
      },
    ),
  );
}
const release = config('production');
const e2e = config('e2e');
for (const variant of ['production', 'e2e']) {
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
  assert(!native.NSMicrophoneUsageDescription);
  if (variant === 'production')
    assert(
      !native.NSAppTransportSecurity,
      'CNG must remove release ATS exceptions',
    );
  else
    assert.deepEqual(
      native.NSAppTransportSecurity,
      e2e.ios.infoPlist.NSAppTransportSecurity,
    );
}
assert.equal(release.extra.apiOrigin, 'https://opax.com.au');
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
for (const app of [release, e2e]) {
  assert.equal(app.name, 'OPAX');
  assert.equal(app.version, '0.1.0');
  assert.equal(app.ios.bundleIdentifier, 'au.com.opax.app');
  assert.equal(app.ios.buildNumber, '1');
  assert(!app.ios.infoPlist.NSMicrophoneUsageDescription);
  assert.equal(app.updates.enabled, false);
  assert(
    app.plugins.some(
      (plugin: unknown) =>
        Array.isArray(plugin) &&
        plugin[0] === 'expo-build-properties' &&
        plugin[1].ios.deploymentTarget === '18.4',
    ),
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
for (const path of Object.keys(lock.packages))
  assert(
    !/node_modules\/(?:@sentry\/|@amplitude\/|@segment\/|@react-native-firebase\/|firebase(?:\/|$)|posthog|mixpanel|appcenter|react-native-appsflyer|react-native-adjust|expo-notifications|expo-tracking-transparency|expo-insights|@bugsnag\/|bugsnag|@datadog\/|datadog|react-native-fbsdk|@facebook\/)/i.test(
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
for (const path of walk(sourceRoot).filter((path) =>
  sourceExtensions.test(path),
)) {
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
// Scan all text-bearing tracked contributor files, including JS, JSON, shell,
// fixture manifests, documentation and dotfiles. Ignore only generated/local data.
for (const path of walk('.', true).filter(
  (path) =>
    !/(?:^|\/)(?:node_modules|ios|android|build|private|coverage|\.expo|\.git)(?:\/|$)/.test(
      path,
    ) && !path.endsWith('.qa.local.env'),
)) {
  const body = readFileSync(path);
  if (!body.includes(0))
    assert(!secretPattern.test(body.toString()), `Possible secret: ${path}`);
}
const appIndex = process.argv.indexOf('--app');
const productionIndex = process.argv.indexOf('--production-bundle');
if (productionIndex !== -1) {
  const bundles = walk(process.argv[productionIndex + 1]!).filter((path) =>
    /\.(?:hbc|js)$/.test(path),
  );
  assert(bundles.length, 'Production JS bundle missing');
  for (const path of bundles) {
    const body = readFileSync(path);
    for (const prefix of [
      'http://127.0.0.1',
      'http://localhost',
      'https://127.0.0.1',
      'https://localhost',
    ])
      assert(
        !body.includes(Buffer.from(prefix)),
        `Production bundle has a loopback origin: ${path}`,
      );
    assert(
      !body.includes(Buffer.from(':8910')),
      'Production bundle contains the fixture port',
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
  console.log(
    'PASS production embedded JS: no fixture/loopback origin; shipped route/origin/redirect guards present',
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
  assert.equal(plist.CFBundleShortVersionString, '0.1.0');
  assert.equal(plist.CFBundleVersion, '1');
  assert.equal(plist.MinimumOSVersion, '18.4');
  assert(!plist.NSMicrophoneUsageDescription);
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
  'PASS qa-static: variant origins/ATS, identity, iOS floor, dependency tree, secrets, transport boundary',
);
