// The remaining rules use individual file contents, without a TS program.
const config = require('../eslint.config');
module.exports = config.map((entry) => {
  if (!entry.rules?.['opax/hermes-builtins']) return entry;
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
    rules: { ...entry.rules, 'opax/hermes-builtins': 'off' },
  };
});
