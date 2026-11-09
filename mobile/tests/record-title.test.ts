import { act, createElement } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  NO_BREAK_SPACE,
  WORD_JOINER,
  bindRecordTitle,
  bindShortLastWord,
} from '../src/design/record-title';
import { Text } from '../src/design/text';

const nb = NO_BREAK_SPACE;

test.each([
  // A year is bound to the word before it: bills-06's lone "2026".
  [
    'Interactive Gambling (Cost Recovery Levy) Bill 2026',
    `Interactive Gambling (Cost Recovery Levy) Bill${nb}2026`,
  ],
  // "Bill" as the last word.
  ['Treasury Laws Amendment Bill', `Treasury Laws Amendment${nb}Bill`],
  // Any last word of four characters or fewer.
  [
    'Red Lines Package Omnibus Bill 2026 [No. 2]',
    `Red Lines Package Omnibus Bill 2026 [No.${nb}2]`,
  ],
  ['Matters of public importance', 'Matters of public importance'],
  ['Questions without notice: Jobs', `Questions without notice:${nb}Jobs`],
  ['Speech · 9 February 1999', `Speech · 9 February${nb}1999`],
  // Trailing white space is kept after the bound pair.
  ['Budget Savings Bill 2026 ', `Budget Savings Bill${nb}2026 `],
])('binds a short last word: %s', (title, bound) => {
  expect(bindShortLastWord(title)).toBe(bound);
});

test.each([
  // One or two words: nothing to orphan.
  'Bill 2026',
  'Senate',
  '',
  // A long last word stays free to wrap.
  'Interactive Gambling Amendment Regulations',
  // A pair too long to share an AX5 line is not bound.
  'Australian Telecommunications 2026',
])('leaves %p as it is', (title) => {
  expect(bindShortLastWord(title)).toBe(title);
});

test('binds only the last string run of a Text', () => {
  expect(bindRecordTitle('Water Amendment Bill 2026')).toBe(
    `Water Amendment Bill${nb}2026`,
  );
  const unchanged = ['Water Amendment ', 'Bill 2026'];
  expect(bindRecordTitle(unchanged)).toBe(unchanged);
  expect(bindRecordTitle(['A ', 'Water Amendment Bill 2026'])).toEqual([
    'A ',
    `Water Amendment Bill${nb}2026`,
  ]);
  expect(bindRecordTitle(42)).toBe(42);
  expect(bindRecordTitle(null)).toBeNull();
});

function drawn(props: Record<string, unknown>, title: string) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(createElement(Text, props, title));
  });
  const native = renderer.root.findByType(NativeText).props;
  act(() => renderer.unmount());
  return native;
}

test('a bound title keeps its words as published in the accessibility label', () => {
  const title = 'Interactive Gambling (Cost Recovery Levy) Bill 2026';
  const native = drawn({ variant: 'recordTitle' }, title);
  expect(native.children).toBe(
    `Interactive Gambling (Cost Recovery Levy${WORD_JOINER}) Bill${nb}2026`,
  );
  expect(native.accessibilityLabel).toBe(title);
  expect(native.accessibilityLabel).not.toContain(nb);
});

test("a caller's own accessibility label wins over the plain title", () => {
  const native = drawn(
    { variant: 'recordTitle', accessibilityLabel: 'Bill, Gambling levy' },
    'Interactive Gambling (Cost Recovery Levy) Bill 2026',
  );
  expect(native.accessibilityLabel).toBe('Bill, Gambling levy');
});

test('a title that needs no binding gets no accessibility label', () => {
  const native = drawn(
    { variant: 'recordTitle' },
    'Interactive Gambling Amendment Regulations',
  );
  expect(native.children).toBe('Interactive Gambling Amendment Regulations');
  expect(native).not.toHaveProperty('accessibilityLabel');
  // Other roles are never bound or labelled.
  const body = drawn({ variant: 'body' }, 'Water Amendment Bill 2026');
  expect(body.children).toBe('Water Amendment Bill 2026');
  expect(body).not.toHaveProperty('accessibilityLabel');
});

test('a closing parenthesis stays attached to its preceding word at AX sizes', () => {
  expect(bindRecordTitle('Implementation) Bill 2026')).toBe(
    `Implementation${WORD_JOINER}) Bill${nb}2026`,
  );
});
