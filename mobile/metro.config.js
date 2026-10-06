const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
const inheritedResolver = config.resolver.resolveRequest;
// Modules with a production stub beside them: the e2e drawn-line probe, the
// welcome tour's launch argument and the electorate outline probe, and the
// Account sheet, whose sign-in stays out of production until voice ships.
const productionStubs = [
  'src/design/text-probe',
  'src/onboarding/launch-flag',
  'src/features/electorate-map/outline-probe',
  'src/features/account/entry',
].map((module) => path.join(__dirname, module));
// Production keeps the Talk placeholder until the voice switch ships.
const talkModule = path.join(__dirname, 'src/features/talk/TalkScreen');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const target = moduleName.startsWith('.')
    ? path
        .resolve(path.dirname(context.originModulePath), moduleName)
        .replace(/\.[jt]sx?$/, '')
    : null;
  if (process.env.OPAX_VARIANT === 'production' && target !== null) {
    if (productionStubs.includes(target))
      return { type: 'sourceFile', filePath: `${target}.production.ts` };
    if (target === talkModule)
      return { type: 'sourceFile', filePath: `${talkModule}.production.tsx` };
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
config.cacheVersion = `opax-${process.env.OPAX_VARIANT ?? 'development'}`;
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...(process.env.OPAX_VARIANT === 'production'
    ? [...productionBlockList, ...accountSignIn]
    : []),
  ...(!['production', 'e2e'].includes(process.env.OPAX_VARIANT)
    ? productionBlockList.filter((rule) =>
        /voice-bridge-test|test-screens/.test(rule.source),
      )
    : []),
];
module.exports = config;
