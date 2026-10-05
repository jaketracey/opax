const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
const inheritedResolver = config.resolver.resolveRequest;
// E2E-only modules with a production stub beside them: the drawn-line probe
// and the welcome tour's launch argument.
const productionStubs = [
  'src/design/text-probe',
  'src/onboarding/launch-flag',
].map((module) => path.join(__dirname, module));
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const target = moduleName.startsWith('.')
    ? path
        .resolve(path.dirname(context.originModulePath), moduleName)
        .replace(/\.[jt]sx?$/, '')
    : null;
  if (
    process.env.OPAX_VARIANT === 'production' &&
    target !== null &&
    productionStubs.includes(target)
  ) {
    return {
      type: 'sourceFile',
      filePath: `${target}.production.ts`,
    };
  }
  return typeof inheritedResolver === 'function'
    ? inheritedResolver(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};
const productionBlockList = require('./scripts/production-block-list.json').map(
  (source) => new RegExp(source),
);
config.cacheVersion = `opax-${process.env.OPAX_VARIANT ?? 'development'}`;
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...(process.env.OPAX_VARIANT === 'production' ? productionBlockList : []),
  ...(!['production', 'e2e'].includes(process.env.OPAX_VARIANT)
    ? productionBlockList.filter((rule) =>
        /voice-bridge-test|test-screens/.test(rule.source),
      )
    : []),
];
module.exports = config;
