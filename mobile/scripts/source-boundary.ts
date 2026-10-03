import { dirname, resolve } from 'node:path';
import ts from 'typescript';
export const sourceExtensions = /\.(?:[cm]?[jt]s|[jt]sx)$/;
export const secretPattern =
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|sk-(?:proj-)?[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})|(?:api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_\/-]{24,}["']/i;
export function scanSource(path: string, content: string): string[] {
  const tree = ts.createSourceFile(
    path,
    content,
    ts.ScriptTarget.Latest,
    true,
    /[jt]sx$/.test(path)
      ? ts.ScriptKind.TSX
      : /\.[cm]?js$/.test(path)
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS,
  );
  const errors = new Set<string>();
  const client = resolve(path) === resolve('src/api/client.ts');
  const helpers = new Set<string>();
  const images = new Set(['Image']);
  for (const node of tree.statements) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const module = node.moduleSpecifier.text;
      const imageBindings = node.importClause?.namedBindings;
      if (
        module === 'react-native' &&
        imageBindings &&
        ts.isNamedImports(imageBindings)
      )
        for (const binding of imageBindings.elements)
          if ((binding.propertyName ?? binding.name).text === 'Image')
            images.add(binding.name.text);
      if (
        resolve(dirname(path), `${module}.ts`) ===
        resolve('src/api/image-policy.ts')
      ) {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings))
          for (const element of bindings.elements)
            if (
              (element.propertyName ?? element.name).text === 'remoteImageURI'
            )
              helpers.add(element.name.text);
      }
      if (
        /^(?:axios|react-native-webview|expo-image)(?:\/|$)/.test(module) ||
        (!client && module === 'expo/fetch')
      )
        errors.add('Unreviewed transport import');
    }
  }
  const banned = new Set([
    'XMLHttpRequest',
    'WebSocket',
    'EventSource',
    'downloadFileAsync',
    'createDownloadResumable',
  ]);
  function inspect(node: ts.Node) {
    if (
      ts.isStringLiteral(node) &&
      /^(?:react-native-webview|expo-image|axios)(?:\/|$)/.test(node.text)
    )
      errors.add('Unreviewed transport module');
    if (
      (ts.isIdentifier(node) || ts.isStringLiteral(node)) &&
      (banned.has(node.text) || (!client && node.text === 'fetch'))
    )
      errors.add(`Transport forbidden: ${node.text}`);
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'globalThis'
    )
      errors.add('Computed globalThis access forbidden');
    if (
      ts.isPropertyAssignment(node) ||
      ts.isShorthandPropertyAssignment(node)
    ) {
      if (node.name.getText(tree).replace(/['"]/g, '') === 'uri') {
        const value = ts.isPropertyAssignment(node)
          ? node.initializer
          : undefined;
        if (
          !value ||
          !ts.isCallExpression(value) ||
          !ts.isIdentifier(value.expression) ||
          !helpers.has(value.expression.text)
        )
          errors.add('Image URI must call imported remoteImageURI');
      }
    }
    if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'source') {
      const element = node.parent.parent;
      if (
        (ts.isJsxOpeningElement(element) ||
          ts.isJsxSelfClosingElement(element)) &&
        (images.has(element.tagName.getText(tree)) ||
          element.tagName.getText(tree).endsWith('Image'))
      ) {
        const value =
          node.initializer && ts.isJsxExpression(node.initializer)
            ? node.initializer.expression
            : undefined;
        if (
          !value ||
          !(
            ts.isObjectLiteralExpression(value) ||
            ts.isNumericLiteral(value) ||
            (ts.isCallExpression(value) &&
              value.expression.getText(tree) === 'require')
          ) ||
          (ts.isObjectLiteralExpression(value) &&
            value.properties.some(ts.isSpreadAssignment))
        )
          errors.add(
            'Image source must be a local asset or policy-checked URI object',
          );
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(tree);
  return [...errors];
}
