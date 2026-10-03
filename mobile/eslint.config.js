const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
module.exports = defineConfig([
  expo,
  {
    ignores: [
      'ios/**',
      'android/**',
      'build/**',
      'private/**',
      'coverage/**',
      '.expo/**',
    ],
  },
  {
    files: ['src/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    plugins: {
      opax: { rules: { transport: require('./scripts/transport-rule') } },
    },
    rules: { 'opax/transport': 'error' },
  },
]);
