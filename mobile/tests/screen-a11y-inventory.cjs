// Resolve route imports without loading the app or its native modules. A new
// route automatically joins the rendered-screen audit, including named exports.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function screenInventory(root) {
  const screens = new Map();
  const visited = new Set();
  const parse = (file) =>
    ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
  const nativeTitles = new Map();
  const stack = parse(path.join(root, 'src/navigation/stack/screen.tsx'));
  function titles(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(stack) === 'rootTitles' &&
      node.initializer
    ) {
      for (const property of node.initializer.properties)
        nativeTitles.set(property.name.text, property.initializer.text);
    }
    ts.forEachChild(node, titles);
  }
  titles(stack);
  const toolTitles = {};
  const toolsSource = parse(
    path.join(root, 'src/navigation/stack/explore.tsx'),
  );
  const readTools = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(toolsSource) === 'names' &&
      node.initializer
    )
      for (const p of node.initializer.properties)
        toolTitles[p.name.text] = p.initializer.text;
    ts.forEachChild(node, readTools);
  };
  readTools(toolsSource);
  for (const name of fs.readdirSync(path.join(root, 'src/navigation/stack'))) {
    if (!name.endsWith('.tsx')) continue;
    const source = parse(path.join(root, 'src/navigation/stack', name));
    const read = (node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === 'screen' &&
        ts.isStringLiteral(node.arguments[0] ?? {}) &&
        ts.isStringLiteral(node.arguments[1] ?? {}) &&
        node.arguments[1].text &&
        !nativeTitles.has(node.arguments[0].text)
      )
        nativeTitles.set(node.arguments[0].text, node.arguments[1].text);
      ts.forEachChild(node, read);
    };
    read(source);
  }
  const resolve = (file, specifier) => {
    if (!specifier.startsWith('.')) return;
    const base = path.resolve(path.dirname(file), specifier);
    return [
      base + '.tsx',
      base + '.ts',
      path.join(base, 'index.tsx'),
      path.join(base, 'index.ts'),
    ].find((p) => fs.existsSync(p));
  };
  function follow(file, nativeTitle, requested = 'default') {
    const tool = {
      Quiz: 'quiz',
      TimeMachine: 'tm',
      Tide: 'tide',
      Matrix: 'matrix',
      WordsDollars: 'wd',
    }[path.basename(file, '.tsx')];
    if (file.includes('/features/explore/') && tool)
      nativeTitle ??= toolTitles[tool];
    const key = file + ':' + requested;
    if (visited.has(key)) {
      if (nativeTitle && screens.has(file))
        screens.get(file).nativeTitle ??= nativeTitle;
      return;
    }
    visited.add(key);
    const source = parse(file);
    const exports = [];
    let reusesScreen = false;
    let hasUI = false;
    const readUI = (node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(source) !== 'Redirect'
      )
        hasUI = true;
      ts.forEachChild(node, readUI);
    };
    readUI(source);
    for (const statement of source.statements) {
      if (
        ts.isFunctionDeclaration(statement) &&
        statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        const isDefault = statement.modifiers.some(
          (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
        );
        if (statement.name || isDefault)
          exports.push({
            exported: isDefault ? 'default' : statement.name.text,
            name: statement.name?.text ?? 'default',
          });
      }
      if (
        ts.isVariableStatement(statement) &&
        statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        for (const declaration of statement.declarationList.declarations) {
          if (
            ts.isIdentifier(declaration.name) &&
            /^[A-Z]/.test(declaration.name.text)
          )
            exports.push({
              exported: declaration.name.text,
              name: declaration.name.text,
            });
        }
      }
      if (
        ts.isExportAssignment(statement) &&
        ts.isIdentifier(statement.expression)
      )
        exports.push({ exported: 'default', name: statement.expression.text });
      if (
        ts.isExportAssignment(statement) &&
        !ts.isIdentifier(statement.expression)
      )
        exports.push({ exported: 'default', name: 'default' });
      if (
        ts.isExportDeclaration(statement) &&
        !statement.moduleSpecifier &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause)
      )
        for (const entry of statement.exportClause.elements)
          exports.push({
            exported: entry.name.text,
            name: entry.propertyName?.text ?? entry.name.text,
          });
      if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
        const next = resolve(file, statement.moduleSpecifier.text);
        const clause = statement.exportClause;
        if (next && clause && ts.isNamedExports(clause)) {
          for (const entry of clause.elements)
            if (entry.name.text === requested)
              follow(
                next,
                nativeTitle,
                entry.propertyName?.text ?? entry.name.text,
              );
        }
      }
      // Routes also wrap imported screens (Search, electorate chooser, tools).
      if (
        file.includes(path.sep + 'app' + path.sep) &&
        ts.isImportDeclaration(statement)
      ) {
        const next = resolve(file, statement.moduleSpecifier.text);
        const clause = statement.importClause;
        const named = clause?.namedBindings;
        if (
          next &&
          (next.includes('/features/') ||
            next.endsWith('/navigation/SourceDestination.tsx'))
        ) {
          if (clause?.name) {
            reusesScreen = true;
            follow(next, nativeTitle);
          }
          if (named && ts.isNamedImports(named))
            for (const entry of named.elements)
              if (
                /(Screen|Page|Chooser|StateList|YearSheet|SourceDestination)$/.test(
                  entry.name.text,
                )
              ) {
                reusesScreen = true;
                follow(
                  next,
                  nativeTitle,
                  entry.propertyName?.text ?? entry.name.text,
                );
              }
        }
      }
    }
    const selected = exports.filter(
      (entry) =>
        entry.exported === requested ||
        /^[A-Z].*(?:Screen|Page)$/.test(entry.name),
    );
    if (selected.length) {
      const previous = screens.get(file);
      screens.set(file, {
        exports: [
          ...new Map(
            [...(previous?.exports ?? []), ...selected].map((entry) => [
              entry.exported,
              entry,
            ]),
          ).values(),
        ],
        nativeTitle: nativeTitle ?? previous?.nativeTitle,
        implementation: !file.includes('/src/app/') || (hasUI && !reusesScreen),
      });
    }
  }
  function routes(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) routes(file);
      else if (entry.name.endsWith('.tsx') && entry.name !== '_layout.tsx') {
        const route = path
          .relative(path.join(root, 'src/app'), file)
          .replace(/\([^/]+\)\//g, '')
          .replace(/\.tsx$/, '');
        const key = [...nativeTitles.keys()]
          .sort((a, b) => b.length - a.length)
          .find(
            (key) =>
              route === key || (key !== 'index' && route.endsWith('/' + key)),
          );
        const rootTitle = {
          'account/index': 'Account',
          'talk/index': 'Talk to OPAX',
          'talk/sources': 'Sources',
          'welcome/index': 'Welcome',
        }[route];
        follow(file, rootTitle ?? nativeTitles.get(key));
      }
    }
  }
  routes(path.join(root, 'src/app'));
  return [...screens].map(([file, details]) => ({ file, ...details }));
}
module.exports = { screenInventory };
