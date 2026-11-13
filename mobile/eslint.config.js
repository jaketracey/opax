/* global __dirname */
const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');

// Hermes evidence and the matching runtime guard: tests/hermes-runtime.js.
// Types distinguish Array.with/toReversed (present) from TypedArray's missing
// versions, and Array.map/filter/etc. from the missing iterator helpers.
const hermesBuiltins = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { missing: 'Hermes lacks {{api}}. Use {{alternative}}.' },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    const checker = services.program?.getTypeChecker();
    const typeOf = (node) =>
      checker && services.esTreeNodeToTSNodeMap.has(node)
        ? checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node))
        : undefined;
    const declarations = (node, name) => {
      const type = typeOf(node);
      return (
        (type && checker.getPropertyOfType(type, name)?.declarations) || []
      );
    };
    const owners = (node, name) =>
      declarations(node, name)
        .filter((d) =>
          /[/\\]typescript[/\\]lib[/\\]lib\..*\.d\.ts$/.test(
            d.getSourceFile().fileName,
          ),
        )
        .map((d) => d.parent.name?.text ?? '');
    const report = (node, api, alternative) =>
      context.report({
        node,
        messageId: 'missing',
        data: { api, alternative },
      });
    const missing = {
      toSorted:
        '[...xs].sort(compare) (typed arrays: xs.slice().sort(compare))',
      groupBy: 'a loop accumulating into an object or Map',
      fromAsync: 'an async loop accumulating into an array',
      rawJSON: 'JSON.stringify with ordinary JSON values',
      isRawJSON: 'ordinary JSON values and explicit type checks',
      f16round: 'Math.fround with supported 32-bit data',
      getFloat16: 'DataView.getFloat32 with supported 32-bit data',
      setFloat16: 'DataView.setFloat32 with supported 32-bit data',
      fromBase64: 'the existing base64 helpers or a plain decoding loop',
      fromHex: 'a plain decoding loop',
      toBase64: 'the existing base64 helpers or a plain encoding loop',
      toHex: 'a plain encoding loop',
      setFromBase64: 'a plain decoding loop into the existing buffer',
      setFromHex: 'a plain decoding loop into the existing buffer',
      resize: 'a new ArrayBuffer and copy its bytes',
      resizable: 'a fixed-size ArrayBuffer',
      maxByteLength: 'byteLength on a fixed-size ArrayBuffer',
      transfer: 'slice() and explicit buffer ownership',
      transferToFixedLength: 'slice() and explicit buffer ownership',
      detached: 'explicit buffer ownership',
      unicodeSets: 'RegExp unicode mode (u) with explicit character tests',
    };
    const helpers = new Set([
      'map',
      'filter',
      'take',
      'drop',
      'flatMap',
      'reduce',
      'toArray',
      'forEach',
      'some',
      'every',
      'find',
    ]);
    const checkProperty = (node, receiver, name) => {
      if (
        ['Iterator', 'Float16Array', 'SharedArrayBuffer', 'Atomics'].includes(
          name,
        ) &&
        ['globalThis', 'global', 'window'].includes(receiver.name)
      ) {
        report(
          node,
          name,
          name === 'Iterator'
            ? 'for...of loops and Array.from'
            : 'ordinary ArrayBuffer storage and supported numeric arrays',
        );
        return;
      }
      if (Object.hasOwn(missing, name))
        return report(node, name, missing[name]);
      if (
        name === 'escape' &&
        (owners(receiver, name).includes('RegExpConstructor') ||
          receiver.name === 'RegExp')
      )
        return report(
          node,
          'RegExp.escape',
          'a local regex metacharacter escaping helper',
        );
      if (
        ['with', 'toReversed'].includes(name) &&
        owners(receiver, name).some((owner) =>
          /^(?:U?int|Float|BigU?int)\d+(?:Clamped)?Array$/i.test(owner),
        )
      )
        return report(
          node,
          `TypedArray.${name}`,
          name === 'with'
            ? 'xs.slice() then assign the index'
            : 'xs.slice().reverse()',
        );
      if (
        helpers.has(name) &&
        declarations(receiver, name).some((d) =>
          /lib\.es(?:next|2025)\.iterator\.d\.ts$/.test(
            d.getSourceFile().fileName,
          ),
        )
      )
        report(
          node,
          `Iterator.${name}`,
          'a for...of loop or Array.from(iterator) followed by array methods',
        );
    };
    const propertyName = (node) =>
      !node.computed && node.property.type === 'Identifier'
        ? node.property.name
        : node.property.type === 'Literal'
          ? node.property.value
          : undefined;
    const constant = (node) => {
      if (!node) return undefined;
      if (node.type === 'Literal') return node.value;
      const type = typeOf(node);
      return type && typeof type.value === 'string' ? type.value : undefined;
    };
    const checkCall = (node) => {
      const callee = node.callee;
      const name =
        callee.type === 'Identifier'
          ? callee.name
          : callee.type === 'MemberExpression'
            ? propertyName(callee)
            : undefined;
      if (
        name === 'RegExp' &&
        typeof constant(node.arguments[1]) === 'string' &&
        constant(node.arguments[1]).includes('v')
      )
        report(
          node,
          'RegExp v flag',
          'the u flag and explicit character tests',
        );
      if (name === 'ArrayBuffer' && node.arguments.length > 1)
        report(
          node,
          'resizable ArrayBuffer options',
          'a fixed-size ArrayBuffer and copy its bytes when resizing',
        );
      if (
        callee.type === 'MemberExpression' &&
        propertyName(callee) === 'parse' &&
        (callee.object.name === 'JSON' ||
          owners(callee.object, 'parse').includes('JSON'))
      ) {
        const reviver = node.arguments[1];
        if (reviver?.params?.length > 2)
          report(
            node,
            'JSON.parse reviver context',
            'a two-argument reviver and explicit validation',
          );
      }
    };
    return {
      MemberExpression(node) {
        checkProperty(node, node.object, propertyName(node));
      },
      VariableDeclarator(node) {
        if (node.id.type !== 'ObjectPattern' || !node.init) return;
        for (const property of node.id.properties) {
          if (property.type === 'Property')
            checkProperty(
              property,
              node.init,
              property.key.name ?? property.key.value,
            );
        }
      },
      Identifier(node) {
        if (
          ![
            'Iterator',
            'Float16Array',
            'SharedArrayBuffer',
            'Atomics',
          ].includes(node.name)
        )
          return;
        if (
          ['TSTypeReference', 'TSTypeQuery', 'TSQualifiedName'].includes(
            node.parent.type,
          )
        )
          return;
        const variable =
          context.sourceCode.getScope(node).set.get(node.name) ??
          (() => {
            let scope = context.sourceCode.getScope(node);
            while (scope) {
              const found = scope.set.get(node.name);
              if (found) return found;
              scope = scope.upper;
            }
          })();
        if (variable?.defs.length) return;
        if (
          node.parent.type === 'MemberExpression' &&
          node.parent.property === node &&
          !node.parent.computed &&
          !['globalThis', 'global', 'window'].includes(node.parent.object.name)
        )
          return;
        report(
          node,
          node.name,
          node.name === 'Iterator'
            ? 'for...of loops and Array.from'
            : node.name === 'Float16Array'
              ? 'Float32Array with supported 32-bit data'
              : 'ordinary ArrayBuffer storage on the JS thread',
        );
      },
      Literal(node) {
        if (node.regex?.flags.includes('v'))
          report(
            node,
            'RegExp v flag',
            'the u flag and explicit character tests',
          );
      },
      CallExpression: checkCall,
      NewExpression: checkCall,
    };
  },
};
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
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['src/app.ts'] },
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      'opax/hermes-builtins': 'error',
      // Release builds do not freeze cached catalogs (api/client.ts), so an
      // in-place sort of a decoded value would silently reorder the shared
      // cache. A property receiver is the likely decoded value; copy first.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name=/^(sort|reverse|splice|fill|copyWithin)$/][callee.object.type='MemberExpression']",
          message:
            'Copy before an in-place array change on a property ([...x.list].sort()): it may be a shared cached catalog value.',
        },
      ],
    },
  },
  {
    files: [
      'src/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
      'modules/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
    ],
    plugins: {
      opax: {
        rules: {
          'hermes-builtins': hermesBuiltins,
          transport: require('./scripts/transport-rule'),
          ...require('./scripts/deprecated-design-rule').rules,
        },
      },
    },
    rules: {
      'opax/transport': 'error',
      ...Object.fromEntries(
        Object.keys(require('./scripts/deprecated-design-rule').rules).map(
          (name) => [`opax/${name}`, 'error'],
        ),
      ),
    },
  },
]);
