const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const productionBlockList = require('./scripts/production-block-list.json').map(
  (source) => new RegExp(source),
);
config.cacheVersion = `opax-${process.env.OPAX_VARIANT ?? 'development'}`;
// The design workbench is a development and e2e tool. Release bundles never
// contain it: blocked files are invisible to expo-router's route context.
if (process.env.OPAX_VARIANT === 'production') {
  const existing = config.resolver.blockList;
  config.resolver.blockList = [
    ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
    ...productionBlockList,
  ];
}
module.exports = config;
