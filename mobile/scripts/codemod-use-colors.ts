#!/usr/bin/env -S npx tsx
/**
 * Dark mode codemod (19 Nov 2026): moves a file off the static `colors`
 * object and onto `useColors()` and `makeStyles` (src/design/use-colors.ts).
 *
 * `colors` from design/tokens resolves by itself on iOS, but on Android it is
 * the light hex set, read once. So that a screen follows the system on
 * Android, each file that reads a role needs two mechanical changes, and this
 * script makes both:
 *
 *   1. A module-level `const styles = StyleSheet.create({ ... })` that holds a
 *      role becomes `const useStyles = makeStyles((colors) =>
 *      StyleSheet.create({ ... }))`, and every component or hook that reads
 *      `styles` gets `const styles = useStyles();` as its first line.
 *   2. Every component or hook that reads `colors` gets
 *      `const colors = useColors();` as its first line, which shadows the
 *      import. Dependency lists of the React hooks around a read gain the
 *      name. The `colors` import goes when nothing reads it any more.
 *
 * Usage, from mobile/:
 *
 *     npx tsx scripts/codemod-use-colors.ts src/features/today        # rewrite
 *     npx tsx scripts/codemod-use-colors.ts --check src/features/today # list only
 *
 * Arguments are files or directories (tests, `.e2e.` files and generated
 * files are skipped). It is idempotent. The result is formatted with the
 * repo's Prettier config.
 *
 * What it will not do, and prints as `file:line: NEEDS A HUMAN` instead:
 *   - a role read at module level outside a style sheet (a lookup table, a
 *     constant, a default prop object);
 *   - a role or `styles` read in a plain helper function, which cannot call a
 *     hook: pass `colors` (or the style) in as an argument, or turn the
 *     helper into a hook;
 *   - a role read in a parameter default (`{ ground = colors.paper }`);
 *   - a class component;
 *   - an exported style sheet, which other files read.
 * After it runs, `npm run lint` shows anything still static as
 * `opax/static-colors`.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import ts from 'typescript';

const TOKENS = /(?:^|\/)design\/tokens$|^\.\/tokens$/;
const HOOK_MODULE = resolve(__dirname, '../src/design/use-colors');
const DEP_HOOKS =
  /^(?:useMemo|useCallback|useEffect|useLayoutEffect|useInsertionEffect|useImperativeHandle|useFocusEffect)$/;

interface Edit {
  start: number;
  end: number;
  text: string;
}
export interface Result {
  output: string;
  notes: { line: number; message: string }[];
  changed: boolean;
}

type FunctionLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration
  | ts.ConstructorDeclaration;
const isFunctionLike = (node: ts.Node): node is FunctionLike =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node) ||
  ts.isConstructorDeclaration(node);

/** The outermost function round a node, or undefined at module level. */
function outermostFunction(node: ts.Node): FunctionLike | undefined {
  let found: FunctionLike | undefined;
  for (let at = node.parent; at && !ts.isSourceFile(at); at = at.parent)
    if (isFunctionLike(at)) found = at;
  return found;
}

/**
 * A function's name as React sees it: its own, or the constant it is
 * assigned to, through `memo(...)` and `forwardRef(...)` wrappers.
 */
function reactName(fn: FunctionLike): string | undefined {
  if (ts.isFunctionDeclaration(fn)) return fn.name?.text;
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return undefined;
  let at: ts.Node = fn;
  for (;;) {
    const parent = at.parent;
    if (
      ts.isParenthesizedExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isSatisfiesExpression(parent)
    )
      at = parent;
    else if (ts.isCallExpression(parent) && parent.arguments[0] === at)
      at = parent;
    else break;
  }
  if (ts.isVariableDeclaration(at.parent) && at.parent.initializer === at)
    return ts.isIdentifier(at.parent.name) ? at.parent.name.text : undefined;
  if (ts.isExportAssignment(at.parent) && ts.isFunctionExpression(fn))
    return fn.name?.text;
  return ts.isFunctionExpression(fn) ? fn.name?.text : undefined;
}
const isComponentOrHook = (name: string | undefined) =>
  !!name && (/^[A-Z]/.test(name) || /^use[A-Z0-9]/.test(name));

function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    node = node.expression;
  return node;
}
const isStyleSheetCreate = (node: ts.Expression) => {
  const call = unwrap(node);
  return (
    ts.isCallExpression(call) &&
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === 'StyleSheet' &&
    call.expression.name.text === 'create'
  );
};
const hookNameFor = (sheet: string) =>
  `use${sheet.charAt(0).toUpperCase()}${sheet.slice(1)}`;

export function transform(file: string, source: string): Result {
  const host = ts.createCompilerHost({}, true);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) =>
    resolve(name) === resolve(file)
      ? ts.createSourceFile(
          name,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        )
      : read(name, ...rest);
  const program = ts.createProgram({
    rootNames: [file],
    options: {
      noResolve: true,
      noLib: true,
      allowJs: false,
      jsx: ts.JsxEmit.Preserve,
      target: ts.ScriptTarget.Latest,
    },
    host,
  });
  const sf = program.getSourceFile(file)!;
  const checker = program.getTypeChecker();
  const notes: Result['notes'] = [];
  const edits: Edit[] = [];
  const lineOf = (node: ts.Node) =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const note = (node: ts.Node, message: string) =>
    notes.push({ line: lineOf(node), message });

  // The `colors` import from design/tokens.
  let tokensImport: ts.ImportDeclaration | undefined;
  let colorsSpecifier: ts.ImportSpecifier | undefined;
  let hookImport: ts.ImportDeclaration | undefined;
  const hookSpecifier = (() => {
    const path = relative(dirname(resolve(file)), HOOK_MODULE);
    return path.startsWith('.') ? path : `./${path}`;
  })();
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const from = (statement.moduleSpecifier as ts.StringLiteral).text;
    const named = statement.importClause?.namedBindings;
    if (from === hookSpecifier || /(?:^|\/)design\/use-colors$/.test(from))
      hookImport = statement;
    if (!TOKENS.test(from) || !named || !ts.isNamedImports(named)) continue;
    if (statement.importClause?.isTypeOnly) continue;
    for (const element of named.elements)
      if (
        !element.isTypeOnly &&
        (element.propertyName ?? element.name).text === 'colors'
      ) {
        tokensImport = statement;
        colorsSpecifier = element;
      }
  }
  // use-colors.ts is the hook itself: its dynamic set is meant to be static.
  if (!tokensImport || !colorsSpecifier || /[\\/]use-colors\.ts$/.test(file))
    return { output: source, notes, changed: false };
  const colorsName = colorsSpecifier.name.text;
  const colorsSymbol = checker.getSymbolAtLocation(colorsSpecifier.name);

  const symbolOf = (id: ts.Identifier) =>
    ts.isShorthandPropertyAssignment(id.parent)
      ? checker.getShorthandAssignmentValueSymbol(id.parent)
      : checker.getSymbolAtLocation(id);
  const identifiers: ts.Identifier[] = [];
  const walk = (node: ts.Node) => {
    if (ts.isIdentifier(node)) identifiers.push(node);
    ts.forEachChild(node, walk);
  };
  sf.statements.forEach((statement) => {
    if (!ts.isImportDeclaration(statement)) walk(statement);
  });
  const colourReads = identifiers.filter(
    (id) => colorsSymbol && symbolOf(id) === colorsSymbol,
  );

  // Module-level style sheets that hold a role.
  interface Sheet {
    name: string;
    hook: string;
    declaration: ts.VariableDeclaration;
    symbol: ts.Symbol | undefined;
  }
  const declared = new Set(
    identifiers
      .filter(
        (id) =>
          (ts.isVariableDeclaration(id.parent) ||
            ts.isFunctionDeclaration(id.parent)) &&
          id.parent.name === id,
      )
      .map((id) => id.text),
  );
  const sheets: Sheet[] = [];
  const inside = (node: ts.Node, outer: ts.Node) =>
    node.getStart(sf) >= outer.getStart(sf) && node.end <= outer.end;
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const { initializer, name } = declaration;
      if (!initializer || !ts.isIdentifier(name)) continue;
      if (!isStyleSheetCreate(initializer)) continue;
      if (!colourReads.some((read) => inside(read, initializer))) continue;
      if (
        statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        note(
          declaration,
          `NEEDS A HUMAN: exported style sheet \`${name.text}\` holds a role; other files read it. Export a hook made with makeStyles and update the readers.`,
        );
        continue;
      }
      const hook = hookNameFor(name.text);
      if (declared.has(hook)) {
        note(
          declaration,
          `NEEDS A HUMAN: \`${hook}\` already exists, so \`${name.text}\` was left alone.`,
        );
        continue;
      }
      sheets.push({
        name: name.text,
        hook,
        declaration,
        symbol: checker.getSymbolAtLocation(name),
      });
    }
  }
  const sheetAt = (node: ts.Node) =>
    sheets.find((sheet) => inside(node, sheet.declaration.initializer!));

  // Where each read happens.
  const needs = new Map<FunctionLike, Set<string>>();
  const want = (fn: FunctionLike, line: string) =>
    needs.set(fn, (needs.get(fn) ?? new Set()).add(line));
  const deps: { array: ts.ArrayLiteralExpression; name: string }[] = [];
  let staticReads = 0;
  const place = (id: ts.Identifier, local: string, line: string) => {
    const fn = outermostFunction(id);
    if (!fn) {
      staticReads += local === colorsName ? 1 : 0;
      note(
        id,
        `NEEDS A HUMAN: \`${local}\` is read at module level, outside a style sheet. Move the read into a component or hook, or behind makeStyles.`,
      );
      return;
    }
    const inClass = (() => {
      for (let at: ts.Node = fn; at && !ts.isSourceFile(at); at = at.parent)
        if (ts.isClassLike(at)) return true;
      return false;
    })();
    if (inClass) {
      staticReads += local === colorsName ? 1 : 0;
      note(
        id,
        `NEEDS A HUMAN: \`${local}\` is read in a class, which cannot call a hook. Pass it in as a prop.`,
      );
      return;
    }
    const name = reactName(fn);
    if (!isComponentOrHook(name)) {
      staticReads += local === colorsName ? 1 : 0;
      note(
        id,
        `NEEDS A HUMAN: \`${local}\` is read in ${name ? `\`${name}\`` : 'a function'}, which is not a component or hook. Pass \`${local}\` in as an argument, or make it a hook.`,
      );
      return;
    }
    if (fn.parameters.some((parameter) => inside(id, parameter))) {
      staticReads += local === colorsName ? 1 : 0;
      note(
        id,
        `NEEDS A HUMAN: \`${local}\` is read in a parameter default of \`${name}\`. Default it inside the body instead.`,
      );
      return;
    }
    want(fn, line);
    // Dependency lists of the React hooks between the read and the function.
    for (let at: ts.Node = id; at !== fn; at = at.parent) {
      const call = at.parent;
      if (
        !ts.isCallExpression(call) ||
        call.arguments[0] !== at ||
        !isFunctionLike(at)
      )
        continue;
      const callee = ts.isPropertyAccessExpression(call.expression)
        ? call.expression.name.text
        : ts.isIdentifier(call.expression)
          ? call.expression.text
          : '';
      if (!DEP_HOOKS.test(callee)) continue;
      const array = call.arguments[call.arguments.length - 1];
      if (
        call.arguments.length > 1 &&
        array &&
        ts.isArrayLiteralExpression(array)
      )
        deps.push({ array, name: local });
    }
  };
  for (const read of colourReads) {
    if (sheetAt(read)) continue;
    place(read, colorsName, `const ${colorsName} = useColors();`);
  }
  for (const sheet of sheets)
    for (const id of identifiers) {
      if (id === sheet.declaration.name || symbolOf(id) !== sheet.symbol)
        continue;
      const other = sheetAt(id);
      if (other) {
        note(
          id,
          `NEEDS A HUMAN: style sheet \`${other.name}\` reads \`${sheet.name}\`, which is now a hook's result. Inline the style or merge the sheets.`,
        );
        continue;
      }
      place(id, sheet.name, `const ${sheet.name} = ${sheet.hook}();`);
    }

  // Edits.
  for (const sheet of sheets) {
    const { name, initializer } = sheet.declaration;
    edits.push({ start: name.getStart(sf), end: name.end, text: sheet.hook });
    edits.push({
      start: initializer!.getStart(sf),
      end: initializer!.getStart(sf),
      text: `makeStyles((${colorsName}) => `,
    });
    edits.push({ start: initializer!.end, end: initializer!.end, text: ')' });
  }
  const order = (line: string) => (line.includes('useColors()') ? 0 : 1);
  for (const [fn, lines] of needs) {
    const text = [...lines].sort((a, b) => order(a) - order(b)).join('\n');
    const body = fn.body!;
    if (ts.isBlock(body))
      edits.push({
        start: body.getStart(sf) + 1,
        end: body.getStart(sf) + 1,
        text: `\n${text}\n`,
      });
    else {
      edits.push({
        start: body.getStart(sf),
        end: body.getStart(sf),
        text: `{\n${text}\nreturn `,
      });
      edits.push({ start: body.end, end: body.end, text: ';\n}' });
    }
  }
  const added = new Map<ts.ArrayLiteralExpression, Set<string>>();
  for (const { array, name } of deps) {
    if (array.elements.some((e) => ts.isIdentifier(e) && e.text === name))
      continue;
    const names = added.get(array) ?? new Set();
    if (names.has(name)) continue;
    added.set(array, names.add(name));
  }
  for (const [array, names] of added) {
    const last = array.elements[array.elements.length - 1];
    const list = [...names].join(', ');
    edits.push(
      last
        ? { start: last.end, end: last.end, text: `, ${list}` }
        : {
            start: array.getStart(sf) + 1,
            end: array.getStart(sf) + 1,
            text: list,
          },
    );
  }

  if (!edits.length) return { output: source, notes, changed: false };

  // Imports: add the hooks, and drop `colors` when nothing static is left.
  const wanted = new Set<string>();
  if (sheets.length) wanted.add('makeStyles');
  if ([...needs.values()].some((lines) => [...lines].some((l) => !order(l))))
    wanted.add('useColors');
  if (hookImport) {
    const named = hookImport.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) {
      const have = new Set(
        named.elements.map((e) => (e.propertyName ?? e.name).text),
      );
      const missing = [...wanted].filter((name) => !have.has(name));
      if (missing.length)
        edits.push({
          start: named.elements[named.elements.length - 1]!.end,
          end: named.elements[named.elements.length - 1]!.end,
          text: `, ${missing.join(', ')}`,
        });
    }
  } else if (wanted.size)
    edits.push({
      start: tokensImport.end,
      end: tokensImport.end,
      text: `\nimport { ${[...wanted].sort().join(', ')} } from '${hookSpecifier}';`,
    });
  if (!staticReads) {
    const named = tokensImport.importClause!.namedBindings as ts.NamedImports;
    const rest = named.elements.filter((e) => e !== colorsSpecifier);
    if (rest.length || tokensImport.importClause!.name)
      edits.push({
        start: named.getStart(sf),
        end: named.end,
        text: rest.length
          ? `{ ${rest.map((e) => e.getText(sf)).join(', ')} }`
          : '{}',
      });
    else
      edits.push({
        start: tokensImport.getFullStart(),
        end: tokensImport.end,
        text: '',
      });
  }

  let output = source;
  for (const edit of [...edits].sort(
    (a, b) => b.start - a.start || b.end - a.end,
  ))
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  return { output, notes, changed: output !== source };
}

function sources(target: string): string[] {
  const stat = statSync(target);
  if (stat.isFile()) return [target];
  return readdirSync(target).flatMap((entry) => {
    const path = join(target, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry) &&
      !/\.(?:test|e2e|generated|d)\.tsx?$/.test(entry)
      ? [path]
      : [];
  });
}

async function main(argv: string[]) {
  const check = argv.includes('--check');
  const targets = argv.filter((arg) => !arg.startsWith('--'));
  if (!targets.length) {
    console.error(
      'usage: npx tsx scripts/codemod-use-colors.ts [--check] <file or directory>...',
    );
    process.exit(64);
  }
  let changed = 0;
  let noted = 0;
  for (const file of targets.flatMap(sources).sort()) {
    const source = readFileSync(file, 'utf8');
    const result = transform(file, source);
    for (const { line, message } of result.notes) {
      noted += 1;
      console.log(`${file}:${line}: ${message}`);
    }
    if (!result.changed) continue;
    changed += 1;
    console.log(`${check ? 'would rewrite' : 'rewrote'} ${file}`);
    if (check) continue;
    const config = await resolveConfig(file);
    writeFileSync(
      file,
      await format(result.output, { ...config, filepath: file }),
    );
  }
  console.log(
    `${changed} file${changed === 1 ? '' : 's'} ${check ? 'to rewrite' : 'rewritten'}, ${noted} place${noted === 1 ? '' : 's'} for a human`,
  );
}
if (require.main === module) void main(process.argv.slice(2));
