import { HeaderHeightContext } from 'expo-router/react-navigation';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { act } from 'react';
import { Platform } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import TestRenderer from 'react-test-renderer';
import ts from 'typescript';
import { scrollToTop } from '../src/design/scroll-to-top';
import { useHeaderBottom } from '../src/design/useHeaderBottom';

test.each(['ios', 'android'] as const)(
  '%s: reset follows live header height, fallback inset and animation choice',
  (os) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    const scroll = { scrollTo: jest.fn() };
    let reset!: (animated?: boolean) => void;
    function Content() {
      const bottom = useHeaderBottom();
      reset = (animated = false) => scrollToTop(scroll, bottom, animated);
      return null;
    }
    const screen = (header: number) => (
      <SafeAreaInsetsContext.Provider
        value={{ top: 59, bottom: 34, left: 0, right: 0 }}
      >
        <HeaderHeightContext.Provider value={header}>
          <Content />
        </HeaderHeightContext.Provider>
      </SafeAreaInsetsContext.Provider>
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    try {
      act(() => {
        renderer = TestRenderer.create(screen(156));
      });
      reset();
      expect(scroll.scrollTo).toHaveBeenLastCalledWith({
        y: os === 'ios' ? -156 : 0,
        animated: false,
      });
      act(() => renderer.update(screen(96)));
      reset(true);
      expect(scroll.scrollTo).toHaveBeenLastCalledWith({
        y: os === 'ios' ? -96 : 0,
        animated: true,
      });
      act(() => renderer.update(screen(0)));
      reset();
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
        name === 'scrollTo' &&
        options &&
        ts.isObjectLiteralExpression(options) &&
        options.properties.some(
          (property) =>
            ts.isPropertyAssignment(property) &&
            property.name.getText(ast).replace(/['"]/g, '') === 'y' &&
            ts.isNumericLiteral(property.initializer) &&
            Number(property.initializer.text) === 0,
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

test.each([
  'scroll.current?.scrollTo({ y: 0, animated: false })',
  'node.scrollTo({ animated: true,\n y: 0 })',
  'node?.scrollTo?.({ "y": 0 })',
  'node["scrollTo"]({ y: 0 })',
])('raw top-call check catches %s', (source) => {
  expect(rawTopCalls('screen.tsx', source)).toHaveLength(1);
});

test('vertical resets use the header-aware helper throughout src', () => {
  const root = resolve(__dirname, '../src');
  const helper = join(root, 'design/scroll-to-top.ts');
  const offenders: string[] = [];
  function scan(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/\.tsx?$/.test(entry.name) && file !== helper)
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
