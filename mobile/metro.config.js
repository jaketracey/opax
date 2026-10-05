const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
const inheritedResolver = config.resolver.resolveRequest;
const probeModule = path.join(__dirname, 'src/design/text-probe');
const talkModule = path.join(__dirname, 'src/features/talk/TalkScreen');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolved = moduleName.startsWith('.')
    ? path
        .resolve(path.dirname(context.originModulePath), moduleName)
        .replace(/\.[jt]sx?$/, '')
    : null;
  if (process.env.OPAX_VARIANT === 'production') {
    if (resolved === probeModule)
      return { type: 'sourceFile', filePath: `${probeModule}.production.ts` };
    if (resolved === talkModule)
      return { type: 'sourceFile', filePath: `${talkModule}.production.tsx` };
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
