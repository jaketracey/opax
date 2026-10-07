const { dirname, resolve, relative } = require('node:path');
const ts = require('typescript');
const { reviewedNativeModules } = require('./native-review-policy');
const {
  isModuleTooling,
  importsModuleTooling,
} = require('./module-tooling-policy');

const loaderNames = new Set([
  'requireNativeModule',
  'requireOptionalNativeModule',
  'requireNativeView',
  'requireNativeViewManager',
]);
const proxyNames = new Set([
  'nativeModuleProxy',
  'NativeModulesProxy',
  '__turboModuleProxy',
]);
const reviewedExpoSubpaths = new Set([
  'expo/fetch',
  'expo-router/unstable-native-tabs',
  // The router's own navigation contexts (header height): no I/O.
  'expo-router/react-navigation',
]);
const globals = new Set(['globalThis', 'window', 'global', 'self']);
const banned = new Set([
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'downloadFileAsync',
  'createDownloadResumable',
  'createUploadTask',
  'downloadAsync',
  'uploadAsync',
]);
const imageMethods = new Set([
  'prefetch',
  'prefetchWithMetadata',
  'getSize',
  'getSizeWithHeaders',
]);

/** @param {import('typescript').Node | undefined} node */
function unwrap(node) {
  while (
    node &&
    (ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isParenthesizedExpression(node))
  )
    node = node.expression;
  return node;
}
/** @param {import('typescript').Node | undefined} node
 * @returns {string | undefined} */
function staticString(node) {
  node = unwrap(node);
  if (!node) return;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticString(node.left),
      right = staticString(node.right);
    if (left !== undefined && right !== undefined) return left + right;
  }
}
/** @param {import('typescript').Node | undefined} node */
function identifier(node) {
  node = unwrap(node);
  return node && ts.isIdentifier(node) ? node.text : undefined;
}
/** @param {import('typescript').Node | undefined} node */
function member(node) {
  node = unwrap(node);
  if (node && ts.isPropertyAccessExpression(node))
    return {
      object: unwrap(node.expression),
      key: node.name.text,
      computed: false,
    };
  if (node && ts.isElementAccessExpression(node))
    return {
      object: unwrap(node.expression),
      key: staticString(node.argumentExpression),
      computed: true,
    };
}
/** @param {import('typescript').Node | undefined} node */
function bundledRequire(node) {
  node = unwrap(node);
  if (
    !node ||
    !ts.isCallExpression(node) ||
    identifier(node.expression) !== 'require' ||
    node.arguments.length !== 1
  )
    return false;
  const argument = unwrap(node.arguments[0]);
  // Metro's bundled assets need a literal local path, not an arbitrary module.
  return (
    !!argument &&
    ts.isStringLiteral(argument) &&
    /^(?:\.{1,2}\/|@\/)/.test(argument.text)
  );
}

/** Shared by qa-static and ESLint so neither gate has a weaker AST policy.
 * @param {string} path @param {string} content @param {string} [cwd]
 * @returns {{reason: string, start: number, end: number}[]} */
function scanBoundary(path, content, cwd = process.cwd()) {
  if (isModuleTooling(path, cwd)) return [];
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
  const client = resolve(cwd, path) === resolve(cwd, 'src/api/client.ts');
  const sourcePath = relative(cwd, resolve(cwd, path)).split('\\').join('/');
  const reviewedNames = reviewedNativeModules[sourcePath] ?? [];
  const nativeReviewed = (name) =>
    typeof name === 'string' && reviewedNames.includes(name);
  const helpers = new Set(),
    images = new Set(['Image']),
    assets = new Set(['Asset']);
  const fonts = new Set(['Font']),
    fontFunctions = new Set(),
    assetFunctions = new Set(),
    rnNamespaces = new Set(),
    assetNamespaces = new Set();
  const nativeObjects = new Set(['NativeModules']);
  const turboObjects = new Set(['TurboModuleRegistry']);
  const loaders = new Set(loaderNames);
  const proxies = new Set(proxyNames);
  const bundledFontMaps = new Set();
  const issues = [];
  const report = (node, reason) =>
    issues.push({ reason, start: node.getStart(tree), end: node.getEnd() });
  const forbiddenModule = (module) =>
    /^(?:axios|react-native-webview|expo-image)(?:\/|$)/.test(module) ||
    module.startsWith('react-native/') ||
    ((/^expo(?:-[^/]+)?\//.test(module) || /^@expo\/[^/]+\//.test(module)) &&
      !reviewedExpoSubpaths.has(module)) ||
    (!client && module === 'expo/fetch');
  for (const node of tree.statements) {
    if (
      !ts.isImportDeclaration(node) ||
      !ts.isStringLiteral(node.moduleSpecifier)
    )
      continue;
    const module = node.moduleSpecifier.text;
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      if (module === 'react-native') rnNamespaces.add(bindings.name.text);
      if (module === 'expo-font') fonts.add(bindings.name.text);
      if (module === 'expo-asset') assetNamespaces.add(bindings.name.text);
    }
    if (bindings && ts.isNamedImports(bindings))
      for (const binding of bindings.elements) {
        const imported = (binding.propertyName ?? binding.name).text;
        const local = binding.name.text;
        if (
          module === 'react-native' &&
          ['Image', 'ImageBackground'].includes(imported)
        )
          images.add(local);
        if (module === 'react-native' && imported === 'NativeModules')
          nativeObjects.add(local);
        if (module === 'react-native' && imported === 'TurboModuleRegistry')
          turboObjects.add(local);
        if (
          ['expo', 'expo-modules-core'].includes(module) &&
          loaderNames.has(imported)
        )
          loaders.add(local);
        if (proxyNames.has(imported)) proxies.add(local);
        if (module === 'expo-asset' && imported === 'Asset') assets.add(local);
        if (module === 'expo-asset' && imported === 'useAssets')
          assetFunctions.add(local);
        if (
          module === 'expo-font' &&
          ['loadAsync', 'useFonts'].includes(imported)
        )
          fontFunctions.add(local);
        if (
          resolve(dirname(resolve(cwd, path)), `${module}.ts`) ===
            resolve(cwd, 'src/api/image-policy.ts') &&
          imported === 'localImageURI'
        )
          helpers.add(local);
      }
    if (forbiddenModule(module)) report(node, 'Unreviewed transport import');
    if (importsModuleTooling(path, module, cwd))
      report(
        node,
        'Module Node tooling cannot be imported by app or module source',
      );
  }
  const policyURI = (value) => {
    value = unwrap(value);
    return (
      !!value &&
      ts.isCallExpression(value) &&
      helpers.has(identifier(value.expression))
    );
  };
  const fontMap = (value) => {
    value = unwrap(value);
    return (
      !!value &&
      ts.isObjectLiteralExpression(value) &&
      value.properties.every(
        (property) =>
          ts.isPropertyAssignment(property) &&
          bundledRequire(property.initializer),
      )
    );
  };
  const isImage = (object) => {
    const access = member(object);
    return (
      images.has(identifier(object)) ||
      (['Image', 'ImageBackground'].includes(access?.key) &&
        rnNamespaces.has(identifier(access.object)))
    );
  };
  const isAsset = (object) => {
    const access = member(object);
    return (
      assets.has(identifier(object)) ||
      (access?.key === 'Asset' &&
        assetNamespaces.has(identifier(access.object)))
    );
  };
  const directCall = (node) => {
    let outer = node;
    while (outer.parent && unwrap(outer.parent) === node) outer = outer.parent;
    return (
      outer.parent &&
      ts.isCallExpression(outer.parent) &&
      unwrap(outer.parent.expression) === node
    );
  };
  const objectParent = (node) => {
    let outer = node;
    while (outer.parent && unwrap(outer.parent) === node) outer = outer.parent;
    const access = member(outer.parent);
    return access && access.object === node ? outer.parent : undefined;
  };
  const importedName = (node) =>
    ts.isImportSpecifier(node.parent) ||
    ts.isImportClause(node.parent) ||
    ts.isNamespaceImport(node.parent);
  const propertyName = (node) =>
    ts.isPropertyAccessExpression(node.parent) && node.parent.name === node;
  const nativeObject = (object) => {
    const access = member(object);
    return (
      nativeObjects.has(identifier(object)) ||
      (access?.key === 'NativeModules' &&
        rnNamespaces.has(identifier(access.object)))
    );
  };
  const turboObject = (object) => {
    const access = member(object);
    return (
      turboObjects.has(identifier(object)) ||
      (access?.key === 'TurboModuleRegistry' &&
        rnNamespaces.has(identifier(access.object)))
    );
  };
  function inspect(node) {
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (importsModuleTooling(path, node.moduleSpecifier.text, cwd))
        report(
          node,
          'Module Node tooling cannot be imported by app or module source',
        );
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const module = staticString(node.moduleReference.expression);
      if (module && importsModuleTooling(path, module, cwd))
        report(
          node,
          'Module Node tooling cannot be imported by app or module source',
        );
    }
    if (ts.isStringLiteral(node) && forbiddenModule(node.text))
      report(node, 'Unreviewed transport module');
    if (ts.isIdentifier(node) || ts.isStringLiteral(node)) {
      if (banned.has(node.text) || (!client && node.text === 'fetch'))
        report(node, `Transport forbidden: ${node.text}`);
      if (proxies.has(node.text))
        report(node, 'Native transport proxies are forbidden');
      if (
        ts.isIdentifier(node) &&
        (nativeObjects.has(node.text) || turboObjects.has(node.text)) &&
        !importedName(node) &&
        !propertyName(node) &&
        !objectParent(node)
      )
        report(
          node,
          'Native access must use a statically named reviewed module',
        );
    }
    const access = member(node);
    if (
      access &&
      (ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node))
    ) {
      if (access.computed && globals.has(identifier(access.object)))
        report(node, 'Computed global access forbidden');
      if (banned.has(access.key) || (!client && access.key === 'fetch'))
        report(node, 'Unreviewed network transport');
      if (proxies.has(access.key))
        report(node, 'Native transport proxies are forbidden');
      const expoObject = member(access.object);
      if (
        access.key === 'modules' &&
        (identifier(access.object) === 'expo' ||
          (expoObject?.key === 'expo' &&
            globals.has(identifier(expoObject.object))))
      )
        report(node, 'expo.modules native proxy access is forbidden');
      if (nativeObject(access.object) && !nativeReviewed(access.key))
        report(
          node,
          'Native module name is not reviewed for this exact source file',
        );
      if (
        turboObject(access.object) &&
        (!['get', 'getEnforcing'].includes(access.key) || !directCall(node))
      )
        report(
          node,
          'TurboModuleRegistry must directly load a statically named reviewed module',
        );
      if (
        identifier(access.object) === 'Reflect' &&
        ['get', 'apply'].includes(access.key)
      )
        report(node, 'Reflective transport access forbidden');
      if (
        isImage(access.object) &&
        (imageMethods.has(access.key) || access.computed)
      )
        report(node, 'Image transport must use a policy-checked source prop');
      if (
        isAsset(access.object) &&
        (access.key === 'fromURI' || access.computed)
      )
        report(node, 'Remote Asset transport forbidden');
      if (
        fonts.has(identifier(access.object)) &&
        ((access.computed && !['loadAsync', 'useFonts'].includes(access.key)) ||
          (['loadAsync', 'useFonts'].includes(access.key) && !directCall(node)))
      )
        report(
          node,
          'Font loaders must be called directly with bundled require assets',
        );
      if (
        ['NativeModules', 'TurboModuleRegistry'].includes(access.key) &&
        !objectParent(node)
      )
        report(
          node,
          'Native access must use a statically named reviewed module',
        );
    }
    if (ts.isCallExpression(node)) {
      const name = identifier(node.expression);
      if (
        name === 'require' ||
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const module = staticString(node.arguments[0]);
        if (!module || forbiddenModule(module))
          report(node, 'Dynamic or unreviewed transport module');
        if (module && importsModuleTooling(path, module, cwd))
          report(
            node,
            'Module Node tooling cannot be imported by app or module source',
          );
      }
      const call = member(node.expression);
      if (
        loaders.has(name) ||
        loaderNames.has(call?.key) ||
        (turboObject(call?.object) &&
          ['get', 'getEnforcing'].includes(call?.key))
      ) {
        const moduleName = staticString(node.arguments[0]);
        if (
          !nativeReviewed(moduleName) ||
          node.arguments
            .slice(1)
            .some((argument) => staticString(argument) === undefined)
        )
          report(
            node,
            'Native loaders require static module names reviewed for this exact source file',
          );
      }
      if (
        assetFunctions.has(name) ||
        (isAsset(call?.object) && call?.key === 'loadAsync') ||
        (assetNamespaces.has(identifier(call?.object)) &&
          call?.key === 'useAssets')
      ) {
        const value = unwrap(node.arguments[0]);
        const bundled =
          bundledRequire(value) ||
          (value &&
            ts.isArrayLiteralExpression(value) &&
            value.elements.every(bundledRequire));
        if (node.arguments.length !== 1 || !bundled)
          report(node, 'Asset loaders must use bundled literal require assets');
      }
      if (
        fontFunctions.has(name) ||
        (fonts.has(identifier(call?.object)) &&
          ['loadAsync', 'useFonts'].includes(call?.key))
      ) {
        const allowed =
          node.arguments.length === 1
            ? fontMap(node.arguments[0])
            : node.arguments.length === 2 &&
              staticString(node.arguments[0]) !== undefined &&
              bundledRequire(node.arguments[1]);
        if (!allowed)
          report(node, 'Font sources must be bundled literal require assets');
        else if (node.arguments.length === 1)
          bundledFontMaps.add(unwrap(node.arguments[0]));
      }
    }
    if (
      ts.isPropertyAssignment(node) ||
      ts.isShorthandPropertyAssignment(node)
    ) {
      const key = ts.isComputedPropertyName(node.name)
        ? staticString(node.name.expression)
        : ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)
          ? node.name.text
          : undefined;
      if (
        key === 'uri' &&
        !bundledFontMaps.has(node.parent) &&
        (ts.isComputedPropertyName(node.name) ||
          !ts.isPropertyAssignment(node) ||
          !policyURI(node.initializer))
      )
        report(
          node,
          'Image URI must be a literal key calling imported localImageURI',
        );
    }
    // Any component can wrap a native image: check every image prop without
    // relying on the tag name or the wrapper's implementation.
    if (ts.isJsxAttribute(node)) {
      const prop = node.name.getText(tree);
      if (
        ![
          'source',
          'src',
          'srcSet',
          'defaultSource',
          'loadingIndicatorSource',
        ].includes(prop)
      ) {
        ts.forEachChild(node, inspect);
        return;
      }
      const value = unwrap(
        node.initializer && ts.isJsxExpression(node.initializer)
          ? node.initializer.expression
          : undefined,
      );
      const safeObject =
        value &&
        ts.isObjectLiteralExpression(value) &&
        value.properties.some(
          (property) =>
            ts.isPropertyAssignment(property) &&
            !ts.isComputedPropertyName(property.name) &&
            (ts.isIdentifier(property.name) ||
              ts.isStringLiteral(property.name)) &&
            property.name.text === 'uri' &&
            policyURI(property.initializer),
        ) &&
        value.properties.every(
          (property) =>
            ts.isPropertyAssignment(property) &&
            !ts.isComputedPropertyName(property.name),
        );
      const safe =
        prop === 'src' || prop === 'srcSet'
          ? policyURI(value) || bundledRequire(value)
          : safeObject ||
            (value && ts.isNumericLiteral(value)) ||
            bundledRequire(value);
      if (!safe)
        report(
          node,
          prop === 'source'
            ? '`source` is reserved for images; use `citation` for text labels. Image sources must use bundled require assets or the imported image policy helper'
            : 'Image props must use bundled require assets or the imported image policy helper; aliases, spreads and computed keys are forbidden',
        );
    }
    ts.forEachChild(node, inspect);
  }
  inspect(tree);
  return issues;
}
module.exports = { scanBoundary };
