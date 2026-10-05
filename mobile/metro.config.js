const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
const inheritedResolver = config.resolver.resolveRequest;
// Modules with a production twin: release bundles resolve `<module>.production`.
const productionTwins = new Map([
  [path.join(__dirname, 'src/design/text-probe'), '.production.ts'],
  [path.join(__dirname, 'src/features/account/entry'), '.production.tsx'],
]);
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (process.env.OPAX_VARIANT === 'production' && moduleName.startsWith('.')) {
    const target = path
      .resolve(path.dirname(context.originModulePath), moduleName)
      .replace(/\.[jt]sx?$/, '');
    if (productionTwins.has(target))
      return {
        type: 'sourceFile',
        filePath: target + productionTwins.get(target),
      };
  }
  return typeof inheritedResolver === 'function'
    ? inheritedResolver(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};
const productionBlockList = require('./scripts/production-block-list.json').map(
  (source) => new RegExp(source),
);
// Account sign-in and deletion stay out of production until voice ships there:
// only entry.production.tsx (the placeholder) is visible to release bundles.
const accountSignIn = [
  /[/\\]src[/\\]app[/\\]account[/\\](?:sign-in|delete)\.tsx$/,
  /[/\\]src[/\\]features[/\\]account[/\\](?!entry\.production\.tsx$).*/,
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
