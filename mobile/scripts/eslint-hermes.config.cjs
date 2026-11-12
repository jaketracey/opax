// Keep the canonical parsers, plugins, ignores and inline directive support,
// but run only rules that read other files. Never cache this pass's results.
const config = require('../eslint.config');
const uncachedRules = require('./eslint-uncached-rules.cjs');
module.exports = [
  ...config.map((entry) => ({
    ...entry,
    ...(entry.rules && {
      rules: Object.fromEntries(
        Object.entries(entry.rules).map(([name, setting]) => [
          name,
          uncachedRules.has(name) ? setting : 'off',
        ]),
      ),
    }),
  })),
  // Directives for rules checked in the file pass are not unused warnings here.
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
];
