const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
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
const config = getDefaultConfig(__dirname);
const inheritedResolver = config.resolver.resolveRequest;
// Modules with a production stub beside them: the e2e drawn-line probe, the
// welcome tour's launch argument and the electorate outline probe, and the
// Account and Talk entries use a single release switch below.
const productionStubs = [
  'src/design/text-probe',
  'src/features/people/party-timing',
  'src/onboarding/launch-flag',
  'src/features/electorate-map/outline-probe',
  'src/features/money/money-probe',
].map((module) => path.join(__dirname, module));
const voiceEntries = ['account', 'talk'].map((feature) =>
  path.join(__dirname, `src/features/${feature}/entry`),
);
const communityEntry = path.join(__dirname, 'src/features/community/entry');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const target = moduleName.startsWith('.')
    ? path
        .resolve(path.dirname(context.originModulePath), moduleName)
        .replace(/\.[jt]sx?$/, '')
    : null;
  if (platform === 'android' && target === voiceEntries[0])
    return { type: 'sourceFile', filePath: `${target}.android.tsx` };
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
// Account sign-in and deletion stay out of production until voice ships there:
// only entry.production.ts (the placeholder) is visible to release bundles.
const accountSignIn = [
  /[/\\]src[/\\]app[/\\]account[/\\](?:sign-in|delete)\.tsx$/,
  /[/\\]src[/\\]features[/\\]account[/\\](?!entry\.production\.ts$).*/,
];
config.cacheVersion = `opax-${variant}-voice-${voiceEnabled ? 'on' : 'off'}${communityHidden ? '-community-off' : ''}${androidBuild ? '-android' : ''}`;
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(androidBuild
    ? [
        /[/\\]src[/\\]app[/\\](?:talk|voice-bridge-test)\.tsx$/,
        /[/\\]src[/\\]app[/\\]account[/\\](?:sign-in|delete)\.tsx$/,
        // Development excludes test-screens below; exclude this importing
        // route too. E2e keeps its existing GL fixture screen.
        ...(!['production', 'e2e'].includes(variant)
          ? [/[/\\]src[/\\]app[/\\]money-map-spike\.tsx$/]
          : []),
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
