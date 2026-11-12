// Keep the canonical parsers, plugins, ignores and inline directive support,
// but run only the whole-program rule. Never cache this pass's results.
const config = require('../eslint.config');
const rule = 'opax/hermes-builtins';
module.exports = [
  ...config.map((entry) => ({
    ...entry,
    ...(entry.rules && {
      rules: Object.fromEntries(
        Object.entries(entry.rules).map(([name, setting]) => [
          name,
          name === rule ? setting : 'off',
        ]),
      ),
    }),
  })),
  // Directives for rules checked in the file pass are not unused warnings here.
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
];
