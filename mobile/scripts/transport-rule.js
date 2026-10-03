const path = require('node:path');
// ESLint's parser handles every JS/TS extension. Remote image URI expressions
// must call the imported policy helper directly, so mutable URI aliases fail.
module.exports = {
  meta: { type: 'problem', schema: [], messages: { boundary: '{{reason}}' } },
  create(context) {
    const helpers = new Set();
    const images = new Set(['Image']);
    const client =
      path.resolve(context.filename) ===
      path.resolve(context.cwd, 'src/api/client.ts');
    const banned = new Set([
      'XMLHttpRequest',
      'WebSocket',
      'EventSource',
      'downloadFileAsync',
      'createDownloadResumable',
    ]);
    const report = (node, reason) =>
      context.report({ node, messageId: 'boundary', data: { reason } });
    return {
      ImportDeclaration(node) {
        if (node.source.value === 'react-native')
          for (const binding of node.specifiers)
            if (binding.imported?.name === 'Image')
              images.add(binding.local.name);
        if (
          path.resolve(
            path.dirname(context.filename),
            `${node.source.value}.ts`,
          ) === path.resolve(context.cwd, 'src/api/image-policy.ts')
        )
          for (const binding of node.specifiers)
            if (binding.imported?.name === 'remoteImageURI')
              helpers.add(binding.local.name);
        if (
          /^(?:axios|react-native-webview|expo-image)(?:\/|$)/.test(
            node.source.value,
          ) ||
          (!client && node.source.value === 'expo/fetch')
        )
          report(node, 'Transport imports must be reviewed in the API client.');
      },
      Literal(node) {
        if (
          typeof node.value === 'string' &&
          (/^(?:react-native-webview|expo-image|axios)(?:\/|$)/.test(
            node.value,
          ) ||
            banned.has(node.value))
        )
          report(node, 'Unreviewed network transport is forbidden.');
      },
      Identifier(node) {
        if (banned.has(node.name) || (!client && node.name === 'fetch'))
          report(
            node,
            'Network transport belongs exclusively to the API client.',
          );
      },
      MemberExpression(node) {
        if (
          node.computed &&
          node.object.type === 'Identifier' &&
          node.object.name === 'globalThis'
        )
          report(node, 'Computed globalThis access can bypass network policy.');
        if (
          node.computed &&
          node.property.type === 'Literal' &&
          banned.has(node.property.value)
        )
          report(
            node,
            'Network transport belongs exclusively to the API client.',
          );
      },
      Property(node) {
        const key = node.key.name ?? node.key.value;
        if (
          key === 'uri' &&
          (node.value.type !== 'CallExpression' ||
            node.value.callee.type !== 'Identifier' ||
            !helpers.has(node.value.callee.name))
        )
          report(
            node,
            'Image URIs must call the imported remoteImageURI policy helper.',
          );
      },
      JSXAttribute(node) {
        if (node.name.name !== 'source') return;
        const name = node.parent.name;
        const tag = name.name ?? name.property?.name ?? '';
        const image = images.has(tag) || tag.endsWith('Image');
        if (!image) return;
        const value = node.value?.expression;
        if (
          !value ||
          (value.type !== 'ObjectExpression' &&
            !(
              value.type === 'CallExpression' && value.callee.name === 'require'
            ) &&
            !(value.type === 'Literal' && typeof value.value === 'number'))
        )
          report(
            node,
            'Image sources must be a local asset or an object with a policy-checked URI.',
          );
        else if (
          value.type === 'ObjectExpression' &&
          value.properties.some((p) => p.type === 'SpreadElement')
        )
          report(node, 'Image source spreads bypass URI policy.');
      },
    };
  },
};
