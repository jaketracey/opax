const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.cacheVersion = `opax-${process.env.OPAX_VARIANT ?? 'development'}`;
module.exports = config;
