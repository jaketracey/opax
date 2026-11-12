import { HeaderHeightContext } from 'expo-router/react-navigation';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { act } from 'react';
import { Platform, ScrollView, Text as NativeText } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import TestRenderer from 'react-test-renderer';
import ts from 'typescript';
import { scrollToTop } from '../src/design/scroll-to-top';
import { useHeaderBottom } from '../src/design/useHeaderBottom';
import { Screen } from '../src/design/layout';

test.each(['ios', 'android'] as const)(
  '%s: reset follows live header height, fallback inset and animation choice',
  (os) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    let renderer!: TestRenderer.ReactTestRenderer;
    let effectiveY = 0;
    const scroll = {
      scrollTo: jest.fn(({ y }: { y: number; animated: boolean }) => {
        const props = renderer.root.findByType(ScrollView).props;
        // RCTScrollViewComponentView.scrollTo clamps against contentInset,
        // NOT adjustedContentInset, unless overflow scrolling is enabled.
        effectiveY =
          os === 'ios' && !props.scrollToOverflowEnabled
            ? Math.max(-(props.contentInset?.top ?? 0), y) + 0
            : y;
      }),
    };
    let reset!: (animated?: boolean) => void;
    function Content({ overflow }: { overflow: boolean }) {
      const bottom = useHeaderBottom();
      reset = (animated = false) => scrollToTop(scroll, bottom, animated);
      return (
        <Screen scrollToOverflowEnabled={overflow}>
          <NativeText>First row</NativeText>
        </Screen>
      );
    }
    const screen = (header: number, overflow = true) => (
      <SafeAreaInsetsContext.Provider
        value={{ top: 59, bottom: 34, left: 0, right: 0 }}
      >
        <HeaderHeightContext.Provider value={header}>
          <Content overflow={overflow} />
        </HeaderHeightContext.Provider>
      </SafeAreaInsetsContext.Provider>
    );
    try {
      act(() => {
        renderer = TestRenderer.create(screen(156, false));
      });
      reset();
      expect(effectiveY).toBe(0); // A plain Screen reproduces the native clamp.
      act(() => renderer.update(screen(156)));
      reset();
      expect(effectiveY).toBe(os === 'ios' ? -156 : 0);
      expect(scroll.scrollTo).toHaveBeenLastCalledWith({
        y: os === 'ios' ? -156 : 0,
        animated: false,
      });
      act(() => renderer.update(screen(96)));
      reset(true);
      expect(effectiveY).toBe(os === 'ios' ? -96 : 0);
      expect(scroll.scrollTo).toHaveBeenLastCalledWith({
        y: os === 'ios' ? -96 : 0,
        animated: true,
      });
      act(() => renderer.update(screen(0)));
      reset();
      expect(effectiveY).toBe(os === 'ios' ? -103 : 0);
      expect(scroll.scrollTo).toHaveBeenLastCalledWith({
        y: os === 'ios' ? -103 : 0,
        animated: false,
      });
      expect(() => scrollToTop(null, 156)).not.toThrow();
    } finally {
      act(() => renderer?.unmount());
      Object.defineProperty(Platform, 'OS', descriptor);
    }
  },
);

function rawTopCalls(file: string, source: string): number[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const lines: number[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : ts.isElementAccessExpression(callee) &&
            ts.isStringLiteral(callee.argumentExpression)
          ? callee.argumentExpression.text
          : undefined;
      const options = node.arguments[0];
      if (
        (name === 'scrollTo' || name === 'scrollToOffset') &&
        options &&
        ts.isObjectLiteralExpression(options) &&
        options.properties.some(
          (property) =>
            ts.isPropertyAssignment(property) &&
            property.name.getText(ast).replace(/['"]/g, '') ===
              (name === 'scrollTo' ? 'y' : 'offset') &&
            isZero(property.initializer),
        )
      )
        lines.push(
          ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
        );
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return lines;
}

function isZero(node: ts.Expression): boolean {
  return (
    (ts.isNumericLiteral(node) && Number(node.text) === 0) ||
    (ts.isPrefixUnaryExpression(node) &&
      (node.operator === ts.SyntaxKind.MinusToken ||
        node.operator === ts.SyntaxKind.PlusToken) &&
      isZero(node.operand))
  );
}

test.each([
  'scroll.current?.scrollTo({ y: 0, animated: false })',
  'node.scrollTo({ animated: true,\n y: 0 })',
  'node?.scrollTo?.({ "y": 0 })',
  'node["scrollTo"]({ y: 0 })',
  'node.scrollTo({ y: -0 })',
  'list.scrollToOffset({ offset: 0, animated: false })',
  'list?.scrollToOffset?.({ offset: -0 })',
])('raw top-call check catches %s', (source) => {
  expect(rawTopCalls('screen.tsx', source)).toHaveLength(1);
});

test.each([
  'features/search/SearchScreen.tsx',
  'features/search/ResultsScreen.tsx',
  'features/explore/Quiz.tsx',
  'features/explore/TimeMachine.tsx',
])('%s opts its top-reset scroll view into native overflow', (file) => {
  const source = readFileSync(resolve(__dirname, '../src', file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let optedIn = false;
  function visit(node: ts.Node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(ast) === 'Screen'
    ) {
      const props = node.attributes.properties.filter(ts.isJsxAttribute);
      if (
        props.some((prop) => prop.name.getText(ast) === 'scrollRef') &&
        props.some(
          (prop) =>
            prop.name.getText(ast) === 'scrollToOverflowEnabled' &&
            !prop.initializer,
        )
      )
        optedIn = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  expect(optedIn).toBe(true);
});

test('vertical resets use the header-aware helper throughout src', () => {
  const root = resolve(__dirname, '../src');
  const helper = join(root, 'design/scroll-to-top.ts');
  // This Android-only tab listener uses FlatList offsets below an opaque
  // toolbar. It cannot run on iOS or under a native large title.
  const androidTabs = join(root, 'navigation/useAndroidRootScroll.tsx');
  // Known limits: aliases such as { y } and the deprecated positional
  // scrollTo(x, y, animated) overload need data-flow analysis, not this AST rule.
  const offenders: string[] = [];
  function scan(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (
        /\.tsx?$/.test(entry.name) &&
        file !== helper &&
        file !== androidTabs
      )
        offenders.push(
          ...rawTopCalls(file, readFileSync(file, 'utf8')).map(
            (line) => `${relative(root, file)}:${line}`,
          ),
        );
    }
  }
  scan(root);
  expect(offenders).toEqual([]);
});
