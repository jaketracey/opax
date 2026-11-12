// These rules depend on other files. Keep their canonical severities/options;
// add new dependency-sensitive rules here when enabling them in the config.
module.exports = new Set([
  'opax/hermes-builtins', // Uses the whole TypeScript program.
  'import/namespace', // Reads imported namespaces, including re-exports.
  'import/named', // Checks names against dependency exports, when enabled.
  'import/default', // Checks for a dependency's default export, when enabled.
  'import/no-unresolved', // Resolves paths against the filesystem.
  'import/export', // Reads export-star targets to check exported names.
  'import/no-named-as-default', // Reads a dependency's named/default exports.
  'import/no-named-as-default-member', // Reads members of imported namespaces.
  'import/no-duplicates', // Compares resolved module paths, not just specifiers.
]);
