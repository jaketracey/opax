import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform } from 'react-native';
import { phoneCopy } from '../src/design/phone-copy';

function barePhoneStrings(source: string, path: string): number[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const found: number[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isStringLiteralLike(node) ||
        ts.isTemplateLiteralToken(node) ||
        ts.isJsxText(node)) &&
      node.getText(file).includes('iPhone')
    ) {
      let parent: ts.Node | undefined = node.parent;
      while (
        parent &&
        !(
          ts.isCallExpression(parent) &&
          parent.expression.getText(file) === 'phoneCopy'
        )
      )
        parent = parent.parent;
      if (!parent)
        found.push(
          file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
        );
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

test('the Android copy guard detects bare JSX, literals and interpolated copy', () => {
  expect(
    barePhoneStrings(
      'const a = "this iPhone"; const b = <Text>iPhone</Text>; const c = `iPhone ${a}`;',
      'copy.tsx',
    ),
  ).toHaveLength(3);
  expect(
    barePhoneStrings('const a = phoneCopy(`this iPhone ${name}`);', 'copy.tsx'),
  ).toEqual([]);
});

test('all Android-readable source copy routes iPhone wording through phoneCopy', () => {
  const root = join(__dirname, '../src');
  const violations: string[] = [];
  const scan = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        scan(path);
        continue;
      }
      if (!/\.tsx?$/.test(path)) continue;
      const name = relative(root, path);
      // Android route/module discovery excludes voice and account UI. Its
      // independent entry.android.tsx remains part of this copy sweep.
      if (
        name.startsWith('voice/') ||
        name.startsWith('features/talk/') ||
        (name.startsWith('features/account/') &&
          !name.endsWith('entry.android.tsx')) ||
        name === 'design/phone-copy.ts'
      )
        continue;
      violations.push(
        ...barePhoneStrings(readFileSync(path, 'utf8'), path).map(
          (line) => `${name}:${line}`,
        ),
      );
    }
  };
  scan(root);
  expect(violations).toEqual([]);
});

test('Android-rendered offline copy contains phone; iOS keeps its released wording', () => {
  const original = Platform.OS;
  let renderer!: TestRenderer.ReactTestRenderer;
  try {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    const { OfflineBanner } = jest.requireActual<
      typeof import('../src/design/states')
    >('../src/design/states');
    act(() => {
      renderer = TestRenderer.create(<OfflineBanner cached={false} />);
    });
    expect(JSON.stringify(renderer.toJSON())).not.toContain('iPhone');
    expect(phoneCopy('Saved on this iPhone.')).toBe('Saved on this phone.');
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    expect(phoneCopy('Saved on this iPhone.')).toBe('Saved on this iPhone.');
  } finally {
    if (renderer) act(() => renderer.unmount());
    Object.defineProperty(Platform, 'OS', {
      value: original,
      configurable: true,
    });
  }
});
