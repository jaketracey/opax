// opax/static-colors: a role read from the static `colors` object.
//
// `colors` from design/tokens resolves by itself on iOS (DynamicColorIOS),
// but on Android it is the light hex set, read once at import. A component
// that reads it, or a module-level style sheet that holds it, stays light on
// Android in dark mode, without any error. Components take their roles from
// `useColors()` and sheets go behind `makeStyles` (src/design/use-colors.ts);
// scripts/codemod-use-colors.ts makes both changes. After that the local
// `colors` shadows the import, so any read of the import that is left is a
// static one, and this rule reports it.
//
// eslint.config.js sets it to `error` for the shared files the foundation
// lane converted and `warn` for the screen lanes' files until they land.
const TOKENS = /(?:^|\/)design\/tokens$|^\.\/tokens$/;
// Static sets with the same fault: the light hex on Android.
const STATIC = new Set(['colors', 'chromeColours']);
// The token module defines the set, and the hook hands it out on iOS.
const EXEMPT = /[/\\]src[/\\]design[/\\](?:tokens|use-colors)\.ts$/;

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      static:
        'Static colour role: `{{name}}` from design/tokens is the light set on Android. Take roles from useColors(), or move the style sheet behind makeStyles (npx tsx scripts/codemod-use-colors.ts <file>).',
    },
  },
  create(context) {
    if (EXEMPT.test(context.filename)) return {};
    return {
      ImportDeclaration(node) {
        if (!TOKENS.test(node.source.value) || node.importKind === 'type')
          return;
        for (const variable of context.sourceCode.getDeclaredVariables(node)) {
          const specifier = variable.defs[0] && variable.defs[0].node;
          if (
            !specifier ||
            specifier.type !== 'ImportSpecifier' ||
            specifier.importKind === 'type' ||
            !STATIC.has(specifier.imported.name)
          )
            continue;
          for (const reference of variable.references) {
            // `typeof colors` in a type is not a read.
            if (reference.isTypeReference && !reference.isValueReference)
              continue;
            const parent = reference.identifier.parent;
            if (parent && parent.type === 'TSTypeQuery') continue;
            context.report({
              node: reference.identifier,
              messageId: 'static',
              data: { name: specifier.imported.name },
            });
          }
        }
      },
    };
  },
};
