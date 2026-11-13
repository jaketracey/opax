const { getDefaultConfig } = require('expo/metro-config');
const fs = require('node:fs');
const path = require('node:path');
const {
  unstableBeforeAssetSerializationDebugIdPlugin,
} = require('posthog-react-native/metro');
const { productionVoiceEnabled } = require('./plugins/voiceProduction');
const variant = process.env.OPAX_VARIANT ?? 'development';
const androidBuild = process.env.OPAX_TARGET_PLATFORM === 'android';
const voiceEnabled = productionVoiceEnabled(variant);
// Community is not in production (the 1.0 App Store build). An e2e build with
// OPAX_HIDE_COMMUNITY=1 leaves it out the same way, so the simulator can show
// the production Today and Account against the local fixture.
const hideCommunity = process.env.OPAX_HIDE_COMMUNITY ?? '0';
if (!['0', '1'].includes(hideCommunity))
  throw new Error('OPAX_HIDE_COMMUNITY must be 0 or 1');
const communityHidden = variant === 'production' || hideCommunity === '1';
// Crash report symbols (docs/ANALYTICS.md). Production bundles carry
// PostHog's chunk ID, which JS stack frames report and the uploaded source map
// is matched by. React Native's composed Hermes map drops the ID, so a release
// build that sets OPAX_SYMBOLS_DIR also records it there for
// scripts/upload-crash-symbols.sh.
const recordChunkId = (input) => {
  const directory = process.env.OPAX_SYMBOLS_DIR;
  if (directory && input.debugId) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, `${input.graph.transformOptions.platform}.chunk-id`),
      `${input.debugId}\n`,
    );
  }
  return unstableBeforeAssetSerializationDebugIdPlugin(input);
};
const config = getDefaultConfig(__dirname, {
  unstable_beforeAssetSerializationPlugins:
    variant === 'production' ? [recordChunkId] : [],
});
const inheritedResolver = config.resolver.resolveRequest;
// Modules with a production stub beside them: the e2e drawn-line probe, the
// welcome tour's launch argument and the electorate outline probe, and the
// Account and Talk entries use a single release switch below.
const productionStubs = [
  path.join(__dirname, 'src/features/follows/launch-fixture'),
  'src/design/text-probe',
  'src/features/today/launch-fixture',
  'src/features/people/party-timing',
  'src/onboarding/launch-flag',
  'src/features/electorate-map/outline-probe',
  'src/features/money/money-probe',
  'src/navigation/dev-roots',
  // The in-app timing probe (PF5): release bundles record no timings.
  'src/perf/probe',
].map((module) => path.join(__dirname, module));
const voiceEntries = [
  ...['account', 'talk'].map((feature) =>
    path.join(__dirname, `src/features/${feature}/entry`),
  ),
  // Ask reads the account; the voice-off release has none (store.production.ts).
  path.join(__dirname, 'src/features/account/store'),
];
const communityEntry = path.join(__dirname, 'src/features/community/entry');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const target = moduleName.startsWith('.')
    ? path
        .resolve(path.dirname(context.originModulePath), moduleName)
        .replace(/\.[jt]sx?$/, '')
    : null;
  if (communityHidden && target === communityEntry)
    return { type: 'sourceFile', filePath: `${target}.production.ts` };
  if (process.env.OPAX_VARIANT === 'production' && target !== null) {
    if (productionStubs.includes(target))
      return { type: 'sourceFile', filePath: `${target}.production.ts` };
    if (!voiceEnabled && voiceEntries.includes(target))
      return { type: 'sourceFile', filePath: `${target}.production.ts` };
  }
  return typeof inheritedResolver === 'function'
    ? inheritedResolver(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};
const productionBlockList = require('./scripts/production-block-list.json').map(
  (source) => new RegExp(source),
);
// With the voice switch off, account sign-in and deletion stay out of
// production: of this folder, release bundles see only the production entry
// and store, and the rows the entry draws on Android.
const accountSignIn = [
  /[/\\]src[/\\]app[/\\]account[/\\](?:sign-in|delete)\.tsx$/,
  /[/\\]src[/\\]features[/\\]account[/\\](?!(?:(?:entry|store)\.production\.ts|AccountRows\.tsx|AccountLinks\.tsx|parts\.tsx)$).*/,
];
config.cacheVersion = `opax-${variant}-voice-${voiceEnabled ? 'on' : 'off'}${communityHidden ? '-community-off' : ''}${androidBuild ? '-android' : ''}`;
const existing = config.resolver.blockList;
// Android bundles Talk, sign-in and deletion as iOS does; the app offers
// them only when its OpaxVoice module is linked (src/voice/linked.ts).
config.resolver.blockList = [
  ...(androidBuild && !['production', 'e2e'].includes(variant)
    ? [
        // Development excludes test-screens below; exclude this importing
        // route too. E2e keeps its existing GL fixture screen.
        /[/\\]src[/\\]app[/\\]money-map-spike\.tsx$/,
      ]
    : []),
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...(process.env.OPAX_VARIANT === 'production'
    ? [...productionBlockList, ...(!voiceEnabled ? accountSignIn : [])]
    : []),
  ...(!['production', 'e2e'].includes(process.env.OPAX_VARIANT)
    ? productionBlockList.filter((rule) =>
        /voice-bridge-test|test-screens/.test(rule.source),
      )
    : []),
  ...(communityHidden && process.env.OPAX_VARIANT !== 'production'
    ? productionBlockList.filter((rule) => /community/.test(rule.source))
    : []),
];
module.exports = config;
