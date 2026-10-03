const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.cacheVersion = `opax-${process.env.OPAX_VARIANT ?? 'development'}`;
// The design workbench is a development and e2e tool. Release bundles never
// contain it: blocked files are invisible to expo-router's route context.
if (process.env.OPAX_VARIANT === 'production') {
  const existing = config.resolver.blockList;
  config.resolver.blockList = [
    ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
    /[/\\]src[/\\]app[/\\]workbench\.tsx$/,
    /[/\\]src[/\\]workbench[/\\].*/,
  ];
}
module.exports = config;
