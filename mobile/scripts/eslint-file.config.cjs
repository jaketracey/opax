// Cache only rules that use individual file contents, without a TS program.
const config = require('../eslint.config');
const uncachedRules = require('./eslint-uncached-rules.cjs');
module.exports = config.map((entry) => {
  if (!entry.rules) return entry;
  const rules = Object.fromEntries(
    Object.entries(entry.rules).map(([name, setting]) => [
      name,
      uncachedRules.has(name) ? 'off' : setting,
    ]),
  );
  if (!entry.rules['opax/hermes-builtins']) return { ...entry, rules };
  return {
    ...entry,
    languageOptions: {
      ...entry.languageOptions,
      parserOptions: {
        ...entry.languageOptions?.parserOptions,
        project: false,
        projectService: false,
      },
    },
    rules,
  };
});
