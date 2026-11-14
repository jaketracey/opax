// Static accessibility rules for the app's TSX (qa-static runs them on src).
// VoiceOver and TalkBack are never turned on by agents, so labels, roles and
// target sizes are checked here, on both platforms, from the source alone.
// A case the source cannot settle (a forwarded spread, a computed style, a
// component from another file) is skipped and counted, never guessed.
//
// Intentional exceptions carry an inline marker on the element's line, inside
// its opening tag, or in the comment lines directly above it:
//   {/* a11y-ok: decorative, the row's label already names the person */}
//   // a11y-ok(raw-font-size): the native header title is not a Text
// A marker must excuse a finding and give a reason; a stale one is a finding.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import ts from 'typescript';
import { size } from '../src/design/tokens.generated';

export const a11yRules = {
  'pressable-role':
    'A pressable has an accessibilityRole (RowLink sets one on its child)',
  'pressable-label':
    'A pressable has an accessibilityLabel or text children the screen reader reads',
  'image-label':
    'An image has an accessibilityLabel or is hidden from the screen reader',
  'raw-font-size':
    'No raw fontSize in a style outside src/design: use the design Text variants',
  'target-size':
    'A pressable with a fixed size meets minimumTarget (44 pt iOS, 48 dp Android)',
  'label-em-dash': 'No em dash in an accessibility label or hint',
  'stale-marker': 'An a11y-ok marker excuses a finding and gives a reason',
} as const;
export type A11yRule = keyof typeof a11yRules;
export type A11yIssue = {
  rule: A11yRule;
  path: string;
  line: number;
  message: string;
};
export type A11yException = {
  path: string;
  line: number;
  rules: A11yRule[];
  reason: string;
};
export type A11yReport = {
  issues: A11yIssue[];
  exceptions: A11yException[];
  /** Elements each rule examined. */
  checked: Record<string, number>;
  /** Elements a rule could not settle statically (spreads, computed styles). */
  skipped: Record<string, number>;
};
export type A11yOptions = {
  /** Files under src/design may set fontSize: they implement the Text roles. */
  inDesign?: boolean;
};

type Platform = 'ios' | 'android';
const targets: Record<Platform, number> = {
  ios: size.target,
  android: size.targetAndroid,
};
const EM_DASH = '\u2014';
const LABEL_PROPS = ['accessibilityLabel', 'aria-label', 'alt'];
const LABEL_LIKE_PROPS = [
  ...LABEL_PROPS,
  'accessibilityLabelledBy',
  'aria-labelledby',
];
const COPY_PROPS = [
  'accessibilityLabel',
  'accessibilityHint',
  'aria-label',
  'alt',
  'accessibilityLargeContentTitle',
  'accessibilityActions',
  'accessibilityValue',
];
const ROLE_PROPS = ['accessibilityRole', 'role'];
const NATIVE_PRESSABLES = new Set([
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'TouchableNativeFeedback',
]);
const NATIVE_CONTAINERS = new Set([
  'View',
  'ScrollView',
  'SafeAreaView',
  'KeyboardAvoidingView',
]);

/**
 * Every exported src/design component that renders a pressable, read 13 Nov
 * 2026 (the test pins this list to the source, so a new wrapper must be read
 * and added). `inside`: the wrapper sets the role itself and builds the label
 * from props its type requires, so every call site is covered. `call-site`:
 * the label can come out empty, so call sites need one of `props` (or, where
 * `children` is true, text children); `when` lists the props that make the
 * wrapper pressable at all.
 */
export const designPressables: Record<
  string,
  | { label: 'inside'; note: string }
  | {
      label: 'call-site';
      note: string;
      props: string[];
      children: boolean;
      when?: string[];
    }
> = {
  AndroidButton: {
    label: 'inside',
    note: 'accessibilityLabel ?? label (required)',
  },
  AndroidField: { label: 'inside', note: 'clear action: "Clear <label>"' },
  BillRow: {
    label: 'inside',
    note: 'accessibilityLabel ?? title, status, date',
  },
  Button: { label: 'inside', note: 'accessibilityLabel ?? label (required)' },
  Card: {
    label: 'call-site',
    note: 'role link or button; label only from accessibilityLabel or text',
    props: ['accessibilityLabel'],
    children: true,
    when: ['onPress', 'href', 'menu'],
  },
  ChoiceChip: {
    label: 'inside',
    note: 'accessibilityLabel ?? label (required)',
  },
  ContextMenu: { label: 'inside', note: 'adds actions to the child pressable' },
  Disclosure: {
    label: 'call-site',
    note: 'accessibilityLabel ?? [label, value, detail].join, all optional',
    props: ['accessibilityLabel', 'label', 'value', 'detail'],
    children: false,
  },
  DivisionRow: { label: 'inside', note: 'title, meta, outcome and counts' },
  FilterChip: {
    label: 'inside',
    note: '"Remove the <filter> filter, <value>"',
  },
  Gloss: {
    label: 'inside',
    note: '"<Word>. <line>" from its required entry, with a hint',
  },
  IconButton: { label: 'inside', note: 'accessibilityLabel (required)' },
  LinkRow: {
    label: 'inside',
    note: 'accessibilityLabel ?? title, value, detail',
  },
  MachinePill: { label: 'inside', note: '"Machine-written"' },
  PageFoot: { label: 'inside', note: 'the correction link, from copy' },
  PartyLabel: { label: 'inside', note: 'the spoken party name' },
  PersonRow: { label: 'inside', note: 'name, party, place and detail' },
  Pressable: {
    label: 'inside',
    note: 'the shared surface: checked where used',
  },
  RecordRow: { label: 'inside', note: 'record title, speaker and date' },
  RowLink: {
    label: 'inside',
    note: 'sets accessible and role link on its child',
  },
  SectionHeader: {
    label: 'inside',
    note: 'action.accessibilityLabel (required)',
  },
  SegmentedControl: { label: 'inside', note: 'segment.label (required)' },
  SourceAffordance: { label: 'inside', note: 'accessibilityLabel (required)' },
  StatTile: { label: 'inside', note: '"<value>, <label>"' },
  Stepper: { label: 'inside', note: '"Decrease/Increase <label>"' },
  SuggestionRow: { label: 'inside', note: 'name and secondary line' },
  SwitchRow: { label: 'inside', note: 'label (required), with detail' },
  Tag: { label: 'inside', note: '"<kind>: <label>"' },
  Tile: { label: 'inside', note: '"<title>, <line>"' },
  ValueRow: { label: 'inside', note: '"<label>, <value>"' },
};

/** What a JSX tag is, as far as these rules care. */
type Kind =
  | 'native-pressable'
  | 'design-pressable'
  | 'image'
  | 'text'
  | 'icon'
  | 'silent'
  | 'container'
  | 'row-link'
  | 'card'
  | 'call-site'
  | 'unknown';
type Props = {
  values: Map<string, ts.Expression | true>;
  /** A spread whose keys the source does not show. */
  opaque: boolean;
};
type Marker = {
  line: number;
  last: number;
  rules: A11yRule[] | null;
  reason: string;
  used: boolean;
};
type Tally = { checked: Map<string, number>; skipped: Map<string, number> };

const bump = (map: Map<string, number>, key: string) =>
  map.set(key, (map.get(key) ?? 0) + 1);

/**
 * Every comment in the file, from the parser's own trivia (so `//` inside JSX
 * text or a string is never a comment), with the lines it covers.
 */
function commentsOf(
  source: ts.SourceFile,
): { pos: number; end: number; first: number; last: number }[] {
  const text = source.getFullText();
  const seen = new Map<number, { pos: number; end: number }>();
  const visit = (node: ts.Node) => {
    for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ??
      [])
      seen.set(range.pos, range);
    for (const range of ts.getTrailingCommentRanges(text, node.getEnd()) ?? [])
      seen.set(range.pos, range);
    if (!ts.isJsxText(node)) node.getChildren(source).forEach(visit);
  };
  visit(source);
  const lineOf = (pos: number) =>
    source.getLineAndCharacterOfPosition(pos).line + 1;
  return [...seen.values()]
    .sort((a, b) => a.pos - b.pos)
    .map((range) => ({
      ...range,
      first: lineOf(range.pos),
      last: lineOf(range.end - 1),
    }));
}

/**
 * `a11y-ok:` or `a11y-ok(rule, rule):` opening a comment, then the reason.
 * A reason may run on over the `//` lines straight after the marker.
 */
function markersOf(
  source: ts.SourceFile,
  comments: ReturnType<typeof commentsOf>,
): Marker[] {
  const text = source.getFullText();
  const bodyOf = (comment: (typeof comments)[number]) =>
    text
      .slice(comment.pos, comment.end)
      .replace(/^\/\/|^\/\*+|\*+\/$/g, '')
      .split('\n')
      .map((line) => line.replace(/^\s*\*?\s?/, '').trim())
      .join(' ')
      .trim();
  const pattern = /^a11y-ok(?:\(([a-z, -]+)\))?:\s*(.*)$/;
  const markers: Marker[] = [];
  comments.forEach((comment, index) => {
    const match = pattern.exec(bodyOf(comment));
    if (!match) return;
    const words = [match[2]!.trim()];
    let last = comment.last;
    const line = text.slice(comment.pos, comment.pos + 2) === '//';
    for (let after = index + 1; line && after < comments.length; after++) {
      const next = comments[after]!;
      const body = bodyOf(next);
      if (
        text.slice(next.pos, next.pos + 2) !== '//' ||
        next.first !== last + 1 ||
        pattern.test(body)
      )
        break;
      words.push(body);
      last = next.last;
    }
    markers.push({
      line: comment.first,
      last,
      rules: match[1]
        ? (match[1].split(',').map((rule) => rule.trim()) as A11yRule[])
        : null,
      reason: words.join(' ').trim(),
      used: false,
    });
  });
  return markers;
}

function isComponentBoundary(node: ts.Node): boolean {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))
    return true;
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    // A render callback (.map, a children function, a style function) is part
    // of the tree around it; a component's own function is not.
    const parent = node.parent;
    return !(
      ts.isCallExpression(parent) ||
      ts.isJsxExpression(parent) ||
      ts.isJsxAttribute(parent.parent ?? parent)
    );
  }
  return ts.isSourceFile(node);
}

/** Literal value of an expression, or NOT for anything computed. */
const NOT = Symbol('not literal');
type Literal = string | number | boolean | null | undefined | typeof NOT;
function literal(expression: ts.Expression | true | undefined): Literal {
  if (expression === true) return true;
  if (!expression) return undefined;
  if (ts.isParenthesizedExpression(expression))
    return literal(expression.expression);
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  )
    return expression.text;
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expression.operand)
  )
    return -Number(expression.operand.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(expression) && expression.text === 'undefined')
    return undefined;
  return NOT;
}

/**
 * `Platform.OS === 'ios'` and friends, resolved for one platform; anything
 * else is NOT. Lets per-platform styles and hit slops resolve statically.
 */
function platformTest(
  expression: ts.Expression,
  platform: Platform,
): boolean | typeof NOT {
  if (ts.isParenthesizedExpression(expression))
    return platformTest(expression.expression, platform);
  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.ExclamationToken
  ) {
    const inner = platformTest(expression.operand, platform);
    return inner === NOT ? NOT : !inner;
  }
  if (!ts.isBinaryExpression(expression)) return NOT;
  const operator = expression.operatorToken.kind;
  if (
    operator === ts.SyntaxKind.AmpersandAmpersandToken ||
    operator === ts.SyntaxKind.BarBarToken
  ) {
    const left = platformTest(expression.left, platform);
    const right = platformTest(expression.right, platform);
    if (left === NOT || right === NOT) return NOT;
    return operator === ts.SyntaxKind.AmpersandAmpersandToken
      ? left && right
      : left || right;
  }
  const equal =
    operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    operator === ts.SyntaxKind.EqualsEqualsToken;
  const unequal =
    operator === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    operator === ts.SyntaxKind.ExclamationEqualsToken;
  if (!equal && !unequal) return NOT;
  const sides = [expression.left, expression.right];
  const os = sides.find(
    (side) =>
      ts.isPropertyAccessExpression(side) &&
      side.name.text === 'OS' &&
      ts.isIdentifier(side.expression) &&
      side.expression.text === 'Platform',
  );
  const value = sides.map(literal).find((v) => typeof v === 'string');
  if (!os || typeof value !== 'string') return NOT;
  return equal ? value === platform : value !== platform;
}

class FileScan {
  readonly source: ts.SourceFile;
  readonly lines: string[];
  readonly imports = new Map<string, { module: string; name: string }>();
  readonly markers: Marker[];
  /** Lines holding nothing but comments, and the braces of a JSX comment. */
  readonly commentLines = new Set<number>();
  readonly issues: A11yIssue[] = [];
  readonly exceptions: A11yException[] = [];
  constructor(
    readonly path: string,
    content: string,
    readonly inDesign: boolean,
    readonly tally: Tally,
  ) {
    this.source = ts.createSourceFile(
      path,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    this.lines = content.split('\n');
    const comments = commentsOf(this.source);
    this.markers = markersOf(this.source, comments);
    const code = this.lines.map((line) => line.split(''));
    const touched = new Set<number>();
    for (const comment of comments) {
      const from = this.source.getLineAndCharacterOfPosition(comment.pos);
      const to = this.source.getLineAndCharacterOfPosition(comment.end);
      for (let line = from.line; line <= to.line; line++) {
        const chars = code[line] ?? [];
        const a = line === from.line ? from.character : 0;
        const b = line === to.line ? to.character : chars.length;
        for (let i = a; i < b; i++) chars[i] = ' ';
        touched.add(line + 1);
      }
    }
    code.forEach((chars, index) => {
      if (touched.has(index + 1) && /^[{}\s]*$/.test(chars.join('')))
        this.commentLines.add(index + 1);
    });
    for (const statement of this.source.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      )
        continue;
      const module = this.resolveModule(statement.moduleSpecifier.text);
      const clause = statement.importClause;
      if (clause?.name)
        this.imports.set(clause.name.text, { module, name: 'default' });
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings))
        for (const element of bindings.elements)
          this.imports.set(element.name.text, {
            module,
            name: (element.propertyName ?? element.name).text,
          });
      if (bindings && ts.isNamespaceImport(bindings))
        this.imports.set(bindings.name.text, { module, name: '*' });
    }
  }

  /** Relative imports become repo paths so `design/` is recognisable. */
  resolveModule(specifier: string): string {
    if (!specifier.startsWith('.')) return specifier;
    return posix.normalize(
      posix.join(posix.dirname(this.path.split(sep).join('/')), specifier),
    );
  }

  lineOf(node: ts.Node): number {
    return (
      this.source.getLineAndCharacterOfPosition(node.getStart(this.source))
        .line + 1
    );
  }

  /**
   * A marker on the node's own lines (through the end of an opening tag) or
   * in the run of comment lines directly above it.
   */
  markerFor(node: ts.Node, rule: A11yRule): Marker | undefined {
    const start = this.lineOf(node);
    const head = ts.isJsxElement(node) ? node.openingElement : node;
    const end =
      this.source.getLineAndCharacterOfPosition(head.getEnd()).line + 1;
    let above = start;
    while (this.commentLines.has(above - 1)) above--;
    return this.markers.find(
      (marker) =>
        marker.reason &&
        (!marker.rules || marker.rules.includes(rule)) &&
        ((marker.line >= start && marker.line <= end) ||
          (marker.last >= above && marker.last < start)),
    );
  }

  report(node: ts.Node, rule: A11yRule, message: string) {
    const marker = this.markerFor(node, rule);
    const line = this.lineOf(node);
    if (marker) {
      marker.used = true;
      const known = this.exceptions.find(
        (exception) => exception.line === marker.line,
      );
      if (known) {
        if (!known.rules.includes(rule)) known.rules.push(rule);
      } else
        this.exceptions.push({
          path: this.path,
          line: marker.line,
          rules: [rule],
          reason: marker.reason,
        });
      return;
    }
    this.issues.push({ rule, path: this.path, line, message });
  }

  // ---- What a tag is ------------------------------------------------------

  kindOf(tag: ts.JsxTagNameExpression, at: ts.Node, depth = 0): Kind {
    if (ts.isPropertyAccessExpression(tag)) {
      if (tag.getText(this.source) === 'React.Fragment') return 'container';
      const base = ts.isIdentifier(tag.expression)
        ? this.imports.get(tag.expression.text)
        : undefined;
      const animated =
        base &&
        ((base.module === 'react-native' && base.name === 'Animated') ||
          base.module === 'react-native-reanimated');
      if (!animated) return 'unknown';
      const name = tag.name.text;
      if (name === 'Image') return 'image';
      if (name === 'Text') return 'text';
      if (NATIVE_CONTAINERS.has(name)) return 'container';
      return 'unknown';
    }
    if (!ts.isIdentifier(tag)) return 'unknown';
    const name = tag.text;
    if (name === 'Fragment') return 'container';
    const binding = this.imports.get(name);
    if (!binding)
      return depth > 2 ? 'unknown' : this.localKind(name, at, depth);
    const { module, name: imported } = binding;
    if (module === 'react-native') {
      if (NATIVE_PRESSABLES.has(imported)) return 'native-pressable';
      if (imported === 'Image' || imported === 'ImageBackground')
        return 'image';
      if (imported === 'Text') return 'text';
      if (NATIVE_CONTAINERS.has(imported)) return 'container';
      if (imported === 'ActivityIndicator') return 'silent';
      return 'unknown';
    }
    if (module === 'expo-image' && imported === 'Image') return 'image';
    if (module === 'expo-symbols') return 'icon';
    if (
      module === 'react-native-svg' ||
      module === '@shopify/react-native-skia'
    )
      return 'silent';
    if (/(?:^|\/)design\/[\w-]+$/.test(module)) {
      if (imported === 'Pressable') return 'design-pressable';
      if (imported === 'Text' || imported === 'Heading') return 'text';
      if (imported === 'Icon') return 'icon';
      if (imported === 'RowLink') return 'row-link';
      if (imported === 'Card') return 'card';
      const wrapper = designPressables[imported];
      if (wrapper?.label === 'call-site') return 'call-site';
    }
    return 'unknown';
  }

  /** `const Container = linked ? Pressable : View` takes the pressable side. */
  localKind(name: string, at: ts.Node, depth: number): Kind {
    const initializer = this.declaration(name, at);
    if (!initializer) return 'unknown';
    const sides: ts.Expression[] = [];
    const collect = (expression: ts.Expression) => {
      if (ts.isParenthesizedExpression(expression))
        collect(expression.expression);
      else if (ts.isConditionalExpression(expression)) {
        collect(expression.whenTrue);
        collect(expression.whenFalse);
      } else sides.push(expression);
    };
    collect(initializer);
    const kinds = sides.map((side) =>
      ts.isIdentifier(side) || ts.isPropertyAccessExpression(side)
        ? this.kindOf(side as ts.JsxTagNameExpression, at, depth + 1)
        : 'unknown',
    );
    return (
      kinds.find((kind) => kind === 'native-pressable') ??
      kinds.find((kind) => kind === 'design-pressable') ??
      (kinds.every((kind) => kind === kinds[0]) ? kinds[0]! : 'unknown')
    );
  }

  /** The initializer of a const in scope at `at` (same file, outward). */
  declaration(name: string, at: ts.Node): ts.Expression | undefined {
    for (let scope: ts.Node | undefined = at; scope; scope = scope.parent) {
      const statements = ts.isSourceFile(scope)
        ? scope.statements
        : ts.isBlock(scope)
          ? scope.statements
          : undefined;
      if (!statements) continue;
      for (const statement of statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations)
          if (
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === name &&
            declaration.initializer
          )
            return declaration.initializer;
      }
    }
    return undefined;
  }

  // ---- Props --------------------------------------------------------------

  propsOf(element: ts.JsxOpeningLikeElement): Props {
    const values = new Map<string, ts.Expression | true>();
    let opaque = false;
    for (const attribute of element.attributes.properties) {
      if (ts.isJsxAttribute(attribute)) {
        const name = ts.isIdentifier(attribute.name)
          ? attribute.name.text
          : attribute.name.getText(this.source);
        const initializer = attribute.initializer;
        values.set(
          name,
          !initializer
            ? true
            : ts.isJsxExpression(initializer)
              ? (initializer.expression ?? true)
              : (initializer as ts.Expression),
        );
      } else {
        const spread = this.spreadOf(attribute.expression, element);
        if (!spread) opaque = true;
        else for (const [key, value] of spread) values.set(key, value);
      }
    }
    return { values, opaque };
  }

  spreadOf(
    expression: ts.Expression,
    at: ts.Node,
    depth = 0,
  ): Map<string, ts.Expression | true> | undefined {
    if (depth > 3) return undefined;
    if (ts.isParenthesizedExpression(expression))
      return this.spreadOf(expression.expression, at, depth + 1);
    if (ts.isIdentifier(expression)) {
      const initializer = this.declaration(expression.text, at);
      return initializer && this.spreadOf(initializer, at, depth + 1);
    }
    if (ts.isConditionalExpression(expression)) {
      const one = this.spreadOf(expression.whenTrue, at, depth + 1);
      const other = this.spreadOf(expression.whenFalse, at, depth + 1);
      return one && other ? new Map([...other, ...one]) : undefined;
    }
    if (
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    )
      return this.spreadOf(expression.right, at, depth + 1);
    if (!ts.isObjectLiteralExpression(expression)) return undefined;
    const values = new Map<string, ts.Expression | true>();
    for (const property of expression.properties) {
      if (ts.isPropertyAssignment(property)) {
        const key = property.name
          .getText(this.source)
          .replace(/^['"]|['"]$/g, '');
        values.set(key, property.initializer);
      } else if (ts.isShorthandPropertyAssignment(property))
        values.set(property.name.text, property.name);
      else if (ts.isSpreadAssignment(property)) {
        const inner = this.spreadOf(property.expression, at, depth + 1);
        if (!inner) return undefined;
        for (const [key, value] of inner) values.set(key, value);
      } else if (ts.isMethodDeclaration(property))
        values.set(property.name.getText(this.source), true);
    }
    return values;
  }

  /** Set and not a literal undefined, null or empty string. */
  has(props: Props, names: readonly string[]): boolean {
    return names.some((name) => {
      if (!props.values.has(name)) return false;
      const value = literal(props.values.get(name));
      return value !== undefined && value !== null && value !== '';
    });
  }

  /** Off the reader: `accessible={false}` or one of the hiding props. */
  hidden(props: Props): 'hidden' | 'not-accessible' | null {
    const value = (name: string) =>
      props.values.has(name) ? literal(props.values.get(name)) : NOT;
    if (
      value('accessibilityElementsHidden') === true ||
      value('aria-hidden') === true ||
      value('importantForAccessibility') === 'no-hide-descendants'
    )
      return 'hidden';
    if (
      value('accessible') === false ||
      value('importantForAccessibility') === 'no'
    )
      return 'not-accessible';
    return null;
  }

  // ---- Readable text ------------------------------------------------------

  /** Does this JSX say something a screen reader reads? */
  speech(node: ts.Node, depth = 0): 'text' | 'none' | 'unknown' {
    if (depth > 12) return 'unknown';
    const combine = (results: ('text' | 'none' | 'unknown')[]) =>
      results.includes('text')
        ? 'text'
        : results.includes('unknown')
          ? 'unknown'
          : 'none';
    if (ts.isJsxText(node)) return node.text.trim() ? 'text' : 'none';
    if (ts.isJsxExpression(node))
      return node.expression ? this.speech(node.expression, depth + 1) : 'none';
    if (ts.isJsxFragment(node))
      return combine(
        node.children.map((child) => this.speech(child, depth + 1)),
      );
    if (ts.isParenthesizedExpression(node))
      return this.speech(node.expression, depth + 1);
    if (ts.isConditionalExpression(node))
      return combine([
        this.speech(node.whenTrue, depth + 1),
        this.speech(node.whenFalse, depth + 1),
      ]);
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken)
        return this.speech(node.right, depth + 1);
      if (
        operator === ts.SyntaxKind.BarBarToken ||
        operator === ts.SyntaxKind.QuestionQuestionToken
      )
        return combine([
          this.speech(node.left, depth + 1),
          this.speech(node.right, depth + 1),
        ]);
      return 'unknown';
    }
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node)
    )
      return 'text';
    const value = literal(node as ts.Expression);
    if (value === null || value === undefined || value === false) return 'none';
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      if (ts.isBlock(node.body)) {
        const returns: ts.Expression[] = [];
        const visit = (child: ts.Node) => {
          if (ts.isReturnStatement(child) && child.expression)
            returns.push(child.expression);
          else if (!ts.isFunctionLike(child)) ts.forEachChild(child, visit);
        };
        ts.forEachChild(node.body, visit);
        return returns.length
          ? combine(returns.map((r) => this.speech(r, depth + 1)))
          : 'unknown';
      }
      return this.speech(node.body, depth + 1);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ['map', 'flatMap'].includes(node.expression.name.text)
    ) {
      const callback = node.arguments[0];
      return callback ? this.speech(callback, depth + 1) : 'unknown';
    }
    if (ts.isIdentifier(node)) {
      const initializer = this.declaration(node.text, node);
      return initializer && /^\s*[(<]/.test(initializer.getText(this.source))
        ? this.speech(initializer, depth + 1)
        : 'unknown';
    }
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const children = ts.isJsxElement(node) ? node.children : [];
      const props = this.propsOf(opening);
      if (this.hidden(props) === 'hidden') return 'none';
      if (this.has(props, LABEL_LIKE_PROPS)) return 'text';
      const kind = this.kindOf(opening.tagName, node);
      const inner = () =>
        combine([
          ...children.map((child) => this.speech(child, depth + 1)),
          ...(props.values.has('children')
            ? [this.speech(props.values.get('children') as ts.Node, depth + 1)]
            : []),
        ]);
      switch (kind) {
        case 'text':
          return inner() === 'none' ? 'none' : 'text';
        case 'image':
        case 'icon':
        case 'silent':
          return props.opaque ? 'unknown' : 'none';
        case 'container':
        case 'native-pressable':
        case 'design-pressable':
        case 'row-link':
        case 'card':
        case 'call-site':
          return props.opaque ? combine([inner(), 'unknown']) : inner();
        default:
          return 'unknown';
      }
    }
    return 'unknown';
  }

  // ---- Ancestors ----------------------------------------------------------

  /**
   * The JSX elements around a node in its component, following a JSX const
   * (`const body = (...)`) to where it is used.
   */
  ancestors(
    node: ts.Node,
    seen = new Set<ts.Node>(),
  ): ts.JsxOpeningLikeElement[][] {
    const chain: ts.JsxOpeningLikeElement[] = [];
    for (let up = node.parent; up; up = up.parent) {
      if (ts.isJsxElement(up)) chain.push(up.openingElement);
      if (
        ts.isVariableDeclaration(up) &&
        ts.isIdentifier(up.name) &&
        !seen.has(up)
      ) {
        seen.add(up);
        const name = up.name.text;
        const scope = up.parent?.parent?.parent;
        const uses: ts.Node[] = [];
        const visit = (child: ts.Node) => {
          if (
            ts.isJsxExpression(child) &&
            child.expression &&
            ts.isIdentifier(child.expression) &&
            child.expression.text === name
          )
            uses.push(child);
          ts.forEachChild(child, visit);
        };
        if (scope) visit(scope);
        if (!uses.length) return [chain];
        return uses.flatMap((use) =>
          this.ancestors(use, seen).map((outer) => [...chain, ...outer]),
        );
      }
      if (isComponentBoundary(up)) break;
    }
    return [chain];
  }

  // ---- Rules --------------------------------------------------------------

  run() {
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))
        this.element(node);
      if (
        (ts.isPropertyAssignment(node) ||
          ts.isShorthandPropertyAssignment(node)) &&
        node.name.getText(this.source).replace(/^['"]|['"]$/g, '') ===
          'fontSize'
      )
        this.fontSize(node);
      if (
        ts.isPropertyAssignment(node) &&
        ['accessibilityLabel', 'accessibilityHint'].includes(
          node.name.getText(this.source),
        ) &&
        !ts.isJsxSpreadAttribute(node.parent.parent)
      )
        this.copy(node.initializer, node);
      if (
        ts.isJsxAttribute(node) &&
        COPY_PROPS.includes(node.name.getText(this.source)) &&
        node.initializer &&
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression
      )
        this.copy(node.initializer.expression, node);
      else if (
        ts.isJsxAttribute(node) &&
        COPY_PROPS.includes(node.name.getText(this.source)) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      )
        this.copy(node.initializer, node);
      ts.forEachChild(node, visit);
    };
    visit(this.source);
    for (const marker of this.markers)
      if (!marker.used)
        this.issues.push({
          rule: 'stale-marker',
          path: this.path,
          line: marker.line,
          message: marker.reason
            ? 'This a11y-ok marker excuses no finding: remove it'
            : 'An a11y-ok marker needs a reason after the colon',
        });
  }

  element(node: ts.JsxElement | ts.JsxSelfClosingElement) {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const props = this.propsOf(opening);
    const kind = this.kindOf(opening.tagName, node);
    if (kind === 'native-pressable' || kind === 'design-pressable')
      this.pressable(node, opening, props, kind);
    else if (kind === 'card' || kind === 'call-site')
      this.callSite(node, opening, props);
    else if (kind === 'image') this.image(node, props);
  }

  pressable(
    node: ts.JsxElement | ts.JsxSelfClosingElement,
    opening: ts.JsxOpeningLikeElement,
    props: Props,
    kind: 'native-pressable' | 'design-pressable',
  ) {
    const name = opening.tagName.getText(this.source);
    this.target(node, props, kind);
    const chains = this.ancestors(node);
    // Under an ancestor hidden from the reader (a launch overlay), the
    // ancestor already made the decision.
    if (
      chains.every((chain) =>
        chain.some((outer) => this.hidden(this.propsOf(outer)) === 'hidden'),
      )
    ) {
      bump(this.tally.checked, 'pressable-role');
      return;
    }
    const off = this.hidden(props);
    if (off) {
      // Off the reader on purpose (a scrim, a container whose children are
      // the focus targets): that is a decision, so it carries a marker.
      bump(this.tally.checked, 'pressable-role');
      this.report(
        node,
        'pressable-role',
        `${name} is ${off === 'hidden' ? 'hidden from' : 'not focusable by'} the screen reader: mark why with a11y-ok, or give it a role and label`,
      );
      return;
    }
    if (props.opaque) {
      bump(this.tally.skipped, 'pressable-role');
      bump(this.tally.skipped, 'pressable-label');
      return;
    }
    bump(this.tally.checked, 'pressable-role');
    bump(this.tally.checked, 'pressable-label');
    const parent = chains[0]?.[0];
    const inRowLink =
      parent !== undefined &&
      this.kindOf(parent.tagName, parent) === 'row-link';
    if (!this.has(props, ROLE_PROPS) && !inRowLink)
      this.report(
        node,
        'pressable-role',
        `${name} has no accessibilityRole: say what it does (button, link, tab...)`,
      );
    if (this.has(props, LABEL_LIKE_PROPS)) return;
    const said = this.speech(node);
    if (said === 'unknown') {
      bump(this.tally.skipped, 'pressable-label');
      return;
    }
    if (said === 'none')
      this.report(
        node,
        'pressable-label',
        `${name} has no accessibilityLabel and no text a screen reader reads`,
      );
  }

  /** A design wrapper whose label comes from its call site. */
  callSite(
    node: ts.JsxElement | ts.JsxSelfClosingElement,
    opening: ts.JsxOpeningLikeElement,
    props: Props,
  ) {
    const name = ts.isIdentifier(opening.tagName)
      ? this.imports.get(opening.tagName.text)?.name
      : undefined;
    const wrapper = name ? designPressables[name] : undefined;
    if (wrapper?.label !== 'call-site') return;
    if (wrapper.when && !wrapper.when.some((prop) => props.values.has(prop)))
      return;
    if (props.opaque) {
      bump(this.tally.skipped, 'pressable-label');
      return;
    }
    bump(this.tally.checked, 'pressable-label');
    if (this.has(props, wrapper.props)) return;
    const said = wrapper.children ? this.speech(node) : 'none';
    if (said === 'unknown') bump(this.tally.skipped, 'pressable-label');
    else if (said === 'none')
      this.report(
        node,
        'pressable-label',
        `${opening.tagName.getText(this.source)} is pressable with no ${wrapper.props.join(', ')}${wrapper.children ? ' and no text a screen reader reads' : ''}`,
      );
  }

  image(node: ts.JsxElement | ts.JsxSelfClosingElement, props: Props) {
    if (this.has(props, LABEL_PROPS) || this.hidden(props)) {
      bump(this.tally.checked, 'image-label');
      return;
    }
    if (props.opaque) {
      bump(this.tally.skipped, 'image-label');
      return;
    }
    bump(this.tally.checked, 'image-label');
    // Inside a hidden branch or a focus target that speaks for it, the image
    // is not a separate element. Every place a JSX const is used must be.
    const covered = this.ancestors(node).every((chain) =>
      chain.some((ancestor) => {
        const outer = this.propsOf(ancestor);
        if (this.hidden(outer) === 'hidden') return true;
        const kind = this.kindOf(ancestor.tagName, ancestor);
        if (
          kind === 'native-pressable' ||
          kind === 'design-pressable' ||
          kind === 'card'
        )
          return this.hidden(outer) !== 'not-accessible';
        const accessible = outer.values.get('accessible');
        return accessible !== undefined && literal(accessible) !== false;
      }),
    );
    if (!covered)
      this.report(
        node,
        'image-label',
        'Image has no accessibilityLabel and is not hidden: label it, or hide it if it is decorative',
      );
  }

  fontSize(node: ts.PropertyAssignment | ts.ShorthandPropertyAssignment) {
    if (this.inDesign) return;
    bump(this.tally.checked, 'raw-font-size');
    this.report(
      node,
      'raw-font-size',
      'Raw fontSize outside src/design: use a design Text variant so Dynamic Type and font scale apply',
    );
  }

  copy(expression: ts.Expression, at: ts.Node) {
    bump(this.tally.checked, 'label-em-dash');
    let found = false;
    const visit = (node: ts.Node) => {
      if (
        (ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node)) &&
        node.text.includes(EM_DASH)
      )
        found = true;
      else if (ts.isIdentifier(node)) {
        const initializer = this.declaration(node.text, node);
        if (
          initializer &&
          (ts.isStringLiteral(initializer) ||
            ts.isNoSubstitutionTemplateLiteral(initializer)) &&
          initializer.text.includes(EM_DASH)
        )
          found = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(expression);
    if (found)
      this.report(
        at,
        'label-em-dash',
        'Accessibility label or hint contains an em dash: use a comma, colon or full stop',
      );
  }

  // ---- Target size --------------------------------------------------------

  target(
    node: ts.JsxElement | ts.JsxSelfClosingElement,
    props: Props,
    kind: 'native-pressable' | 'design-pressable',
  ) {
    const platforms: Platform[] = /\.ios\.tsx$/.test(this.path)
      ? ['ios']
      : /\.android\.tsx$/.test(this.path)
        ? ['android']
        : ['ios', 'android'];
    const short: string[] = [];
    let readable = false;
    for (const platform of platforms) {
      const style = props.values.has('style')
        ? this.style(props.values.get('style'), node, platform)
        : new Map<string, number | typeof NOT>();
      if (!style) continue;
      // design/pressable lifts every non-absolute Android target to 48 dp.
      if (
        platform === 'android' &&
        kind === 'design-pressable' &&
        style.get('position') !== ABSOLUTE
      )
        continue;
      const slop = this.hitSlop(props.values.get('hitSlop'), platform);
      if (!slop) continue;
      const free = ['flex', 'flexGrow', 'flexBasis', 'alignSelf'].some((key) =>
        style.has(key),
      );
      if (free) continue;
      const dimension = (
        exact: string,
        floor: string,
        before: string,
        after: string,
      ): number | null => {
        const values = [style.get(exact), style.get(floor)];
        if (values.some((value) => value === NOT)) return null;
        if (
          style.get('position') === ABSOLUTE &&
          style.has(before) &&
          style.has(after)
        )
          return null;
        const known = values.filter((v): v is number => typeof v === 'number');
        return known.length ? Math.max(...known) : null;
      };
      const width = dimension('width', 'minWidth', 'left', 'right');
      const height = dimension('height', 'minHeight', 'top', 'bottom');
      const minimum = targets[platform];
      if (width !== null || height !== null) readable = true;
      const reach = [
        width !== null && width + slop.left + slop.right < minimum
          ? `${width + slop.left + slop.right} wide`
          : null,
        height !== null && height + slop.top + slop.bottom < minimum
          ? `${height + slop.top + slop.bottom} tall`
          : null,
      ].filter(Boolean);
      if (reach.length)
        short.push(`${reach.join(' and ')} on ${platform} (needs ${minimum})`);
    }
    bump(readable ? this.tally.checked : this.tally.skipped, 'target-size');
    if (short.length)
      this.report(
        node,
        'target-size',
        `Pressable target is ${short.join('; ')}: grow it, or add hitSlop`,
      );
  }

  hitSlop(
    value: ts.Expression | true | undefined,
    platform: Platform,
  ): { top: number; bottom: number; left: number; right: number } | null {
    const none = { top: 0, bottom: 0, left: 0, right: 0 };
    if (value === undefined || value === true) return none;
    const resolved = this.pick(value, platform);
    if (!resolved) return null;
    const flat = literal(resolved);
    if (typeof flat === 'number')
      return { top: flat, bottom: flat, left: flat, right: flat };
    if (flat === null || flat === undefined) return none;
    const map = this.spreadOf(resolved, resolved);
    if (!map) return null;
    const out = { ...none };
    for (const [key, raw] of map) {
      const picked = raw === true ? null : this.pick(raw, platform);
      const side = picked ? literal(picked) : NOT;
      if (typeof side !== 'number') return null;
      if (key === 'vertical') out.top = out.bottom = side;
      else if (key === 'horizontal') out.left = out.right = side;
      else if (key in out) out[key as keyof typeof out] = side;
    }
    return out;
  }

  /**
   * Design size tokens a style may use: `minimumTarget` (44 iOS, 48 Android),
   * `size.*` and `controlHeight.*` (tokens.ts). Anything else is NOT.
   */
  token(expression: ts.Expression, platform: Platform): number | typeof NOT {
    const fromDesign = (name: string) =>
      /(?:^|\/)design\/[\w-]+$/.test(this.imports.get(name)?.module ?? '');
    if (ts.isIdentifier(expression))
      return expression.text === 'minimumTarget' && fromDesign('minimumTarget')
        ? targets[platform]
        : NOT;
    if (
      !ts.isPropertyAccessExpression(expression) ||
      !ts.isIdentifier(expression.expression) ||
      !fromDesign(expression.expression.text)
    )
      return NOT;
    const group = this.imports.get(expression.expression.text)?.name;
    const key = expression.name.text;
    if (group === 'size' && typeof size[key as keyof typeof size] === 'number')
      return size[key as keyof typeof size];
    if (group === 'controlHeight')
      return key === 'compact'
        ? targets[platform]
        : key === 'default'
          ? size.control
          : key === 'large'
            ? size.controlLarge
            : NOT;
    return NOT;
  }

  /** Resolve `Platform.OS` conditionals and `Platform.select` for one platform. */
  pick(expression: ts.Expression, platform: Platform): ts.Expression | null {
    if (ts.isParenthesizedExpression(expression))
      return this.pick(expression.expression, platform);
    if (ts.isConditionalExpression(expression)) {
      const test = platformTest(expression.condition, platform);
      if (test === NOT) return null;
      return this.pick(
        test ? expression.whenTrue : expression.whenFalse,
        platform,
      );
    }
    if (
      ts.isCallExpression(expression) &&
      expression.expression.getText(this.source) === 'Platform.select'
    ) {
      const options = expression.arguments[0];
      if (!options || !ts.isObjectLiteralExpression(options)) return null;
      const branch =
        options.properties.find(
          (p) => p.name?.getText(this.source) === platform,
        ) ??
        options.properties.find(
          (p) => p.name?.getText(this.source) === 'native',
        ) ??
        options.properties.find(
          (p) => p.name?.getText(this.source) === 'default',
        );
      return branch && ts.isPropertyAssignment(branch)
        ? this.pick(branch.initializer, platform)
        : null;
    }
    return expression;
  }

  /**
   * Flatten a style to its size keys. Numbers are kept, anything computed is
   * NOT, and a style the source cannot show at all returns null.
   */
  style(
    value: ts.Expression | true | undefined,
    at: ts.Node,
    platform: Platform,
    depth = 0,
  ): Map<string, number | typeof NOT | typeof ABSOLUTE> | null {
    if (value === undefined) return new Map();
    if (value === true || depth > 6) return null;
    const expression = this.pick(value, platform);
    if (!expression) return null;
    if (ts.isParenthesizedExpression(expression))
      return this.style(expression.expression, at, platform, depth + 1);
    const flat = literal(expression);
    if (flat === null || flat === undefined || flat === false) return new Map();
    if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
      if (!ts.isBlock(expression.body))
        return this.style(expression.body, at, platform, depth + 1);
      const last = expression.body.statements.at(-1);
      return last && ts.isReturnStatement(last) && last.expression
        ? this.style(last.expression, at, platform, depth + 1)
        : null;
    }
    if (ts.isArrayLiteralExpression(expression)) {
      const merged = new Map<string, number | typeof NOT | typeof ABSOLUTE>();
      for (const entry of expression.elements) {
        const optional =
          ts.isConditionalExpression(entry) ||
          (ts.isBinaryExpression(entry) &&
            [
              ts.SyntaxKind.AmpersandAmpersandToken,
              ts.SyntaxKind.BarBarToken,
              ts.SyntaxKind.QuestionQuestionToken,
            ].includes(entry.operatorToken.kind));
        if (
          optional &&
          platformTest(
            ts.isConditionalExpression(entry)
              ? entry.condition
              : (entry as ts.BinaryExpression).left,
            platform,
          ) === NOT
        ) {
          // Either side may apply: their size keys are not known.
          const sides = ts.isConditionalExpression(entry)
            ? [entry.whenTrue, entry.whenFalse]
            : (entry as ts.BinaryExpression).operatorToken.kind ===
                ts.SyntaxKind.AmpersandAmpersandToken
              ? [(entry as ts.BinaryExpression).right]
              : [
                  (entry as ts.BinaryExpression).left,
                  (entry as ts.BinaryExpression).right,
                ];
          for (const side of sides) {
            const part = this.style(side, at, platform, depth + 1);
            if (!part) return null;
            for (const key of part.keys()) merged.set(key, NOT);
          }
          continue;
        }
        const part = this.style(entry, at, platform, depth + 1);
        if (!part) return null;
        for (const [key, v] of part) merged.set(key, v);
      }
      return merged;
    }
    if (ts.isBinaryExpression(expression)) {
      // A platform test resolved: `Platform.OS === 'ios' && styles.x`.
      const test = platformTest(expression.left, platform);
      if (
        test !== NOT &&
        expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      )
        return test
          ? this.style(expression.right, at, platform, depth + 1)
          : new Map();
      return null;
    }
    if (
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression)
    ) {
      const sheet = this.declaration(expression.expression.text, at);
      const entries =
        sheet &&
        ts.isCallExpression(sheet) &&
        sheet.expression.getText(this.source) === 'StyleSheet.create' &&
        sheet.arguments[0] &&
        ts.isObjectLiteralExpression(sheet.arguments[0])
          ? sheet.arguments[0]
          : undefined;
      const entry = entries?.properties.find(
        (p) => p.name?.getText(this.source) === expression.name.text,
      );
      return entry && ts.isPropertyAssignment(entry)
        ? this.style(entry.initializer, at, platform, depth + 1)
        : null;
    }
    if (ts.isIdentifier(expression)) {
      const initializer = this.declaration(expression.text, at);
      return initializer
        ? this.style(initializer, at, platform, depth + 1)
        : null;
    }
    if (ts.isObjectLiteralExpression(expression)) {
      const out = new Map<string, number | typeof NOT | typeof ABSOLUTE>();
      for (const property of expression.properties) {
        if (ts.isSpreadAssignment(property)) {
          const inner = this.style(
            property.expression,
            at,
            platform,
            depth + 1,
          );
          if (!inner) return null;
          for (const [key, v] of inner) out.set(key, v);
          continue;
        }
        if (!ts.isPropertyAssignment(property)) continue;
        const key = property.name.getText(this.source);
        if (!SIZE_KEYS.has(key)) continue;
        const resolved = this.pick(property.initializer, platform);
        const raw = resolved ? literal(resolved) : NOT;
        const v =
          raw === NOT && resolved ? this.token(resolved, platform) : raw;
        if (key === 'position') out.set(key, v === 'absolute' ? ABSOLUTE : NOT);
        else if (key === 'alignSelf') {
          if (v === 'stretch') out.set(key, NOT);
        } else if (
          (key === 'flex' || key === 'flexGrow') &&
          (v === 0 || v === null || v === undefined)
        )
          continue;
        else out.set(key, typeof v === 'number' ? v : NOT);
      }
      return out;
    }
    return null;
  }
}

const ABSOLUTE = Symbol('absolute');
const SIZE_KEYS = new Set([
  'width',
  'height',
  'minWidth',
  'minHeight',
  'flex',
  'flexGrow',
  'flexBasis',
  'alignSelf',
  'position',
  'top',
  'bottom',
  'left',
  'right',
]);

function emptyReport(): A11yReport {
  return { issues: [], exceptions: [], checked: {}, skipped: {} };
}

export function scanA11y(
  path: string,
  content: string,
  options: A11yOptions = {},
): A11yReport {
  const tally: Tally = { checked: new Map(), skipped: new Map() };
  const scan = new FileScan(
    path,
    content,
    options.inDesign ?? /(?:^|\/)src\/design\//.test(path.split(sep).join('/')),
    tally,
  );
  scan.run();
  return {
    issues: scan.issues,
    exceptions: scan.exceptions,
    checked: Object.fromEntries(tally.checked),
    skipped: Object.fromEntries(tally.skipped),
  };
}

function tsxFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

/** Every .tsx under a source root; `design/` there is the design system. */
export function scanA11yTree(root: string): A11yReport {
  const total = emptyReport();
  for (const path of tsxFiles(root).sort()) {
    const inDesign = relative(root, path).split(sep)[0] === 'design';
    const report = scanA11y(path, readFileSync(path, 'utf8'), { inDesign });
    total.issues.push(...report.issues);
    total.exceptions.push(...report.exceptions);
    for (const key of ['checked', 'skipped'] as const)
      for (const [rule, count] of Object.entries(report[key]))
        total[key][rule] = (total[key][rule] ?? 0) + count;
  }
  return total;
}

export function formatA11yIssue(issue: A11yIssue): string {
  return `${issue.path}:${issue.line} [${issue.rule}] ${issue.message}`;
}

/**
 * Exported components under `<root>/design` that render a pressable
 * themselves: the list `designPressables` must classify.
 */
export function designPressableExports(root: string): string[] {
  const names = new Set<string>();
  const tally: Tally = { checked: new Map(), skipped: new Map() };
  for (const path of tsxFiles(join(root, 'design'))) {
    const scan = new FileScan(path, readFileSync(path, 'utf8'), true, tally);
    for (const statement of scan.source.statements) {
      const exported = ts
        .getModifiers(statement as ts.HasModifiers)
        ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (!exported) continue;
      const declared: [string, ts.Node][] = ts.isFunctionDeclaration(statement)
        ? statement.name
          ? [[statement.name.text, statement]]
          : []
        : ts.isVariableStatement(statement)
          ? statement.declarationList.declarations.flatMap((d) =>
              ts.isIdentifier(d.name) && d.initializer
                ? [[d.name.text, d.initializer] as [string, ts.Node]]
                : [],
            )
          : [];
      for (const [name, body] of declared) {
        if (!/^[A-Z]/.test(name)) continue;
        let renders = false;
        const visit = (node: ts.Node) => {
          if (
            ts.isJsxOpeningElement(node) ||
            ts.isJsxSelfClosingElement(node)
          ) {
            const kind = scan.kindOf(node.tagName, node);
            if (kind === 'native-pressable' || kind === 'design-pressable')
              renders = true;
          }
          if (!renders) ts.forEachChild(node, visit);
        };
        visit(body);
        if (renders) names.add(name);
      }
    }
  }
  return [...names].sort();
}
