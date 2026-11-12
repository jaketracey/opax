// Run only the whole-program rule, with the canonical config's parser/options,
// plugin and global ignores. This pass must never use an ESLint result cache.
const config = require('../eslint.config');
const rule = 'opax/hermes-builtins';
module.exports = [
  ...config.filter((entry) =>
    Object.keys(entry).every((key) => ['name', 'ignores'].includes(key)),
  ),
  ...config
    .filter((entry) => entry.rules?.[rule])
    .map((entry) => ({
      ...entry,
      plugins: {
        opax: config.find((block) => block.plugins?.opax).plugins.opax,
      },
      rules: { [rule]: entry.rules[rule] },
    })),
];
