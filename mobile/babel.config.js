module.exports = function (api) {
  const production = process.env.OPAX_VARIANT === 'production';
  api.cache.using(() => process.env.OPAX_VARIANT ?? 'development');
  return {
    presets: ['babel-preset-expo'],
    plugins: production ? [require('./plugins/removeDevelopmentOrigins')] : [],
  };
};
