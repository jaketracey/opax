import { act } from 'react';
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text as NativeText,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  Text,
  WORD_SAFE_MIN_POINTS,
  breaksMidWord,
  nextWordSafeCap,
  wordSafeFloor,
} from '../src/design/text';
import { textRampScale } from '../src/design/text-scale';
import { textStyles, type TextVariant } from '../src/design/tokens';
import { textWidth } from './row-layout';

/**
 * Duo audit A5-1 / A3-2 (BACKLOG D8). On the iPhone Duo's folded display
 * (402pt, two-column cards about 200pt wide) word-safe text still broke
 * mid-word: "amendmen / t", "(Strength / ening", "Communit / y", "Who wins
 * governmen…". The step-down ran, then stopped at the reader's default size
 * (cap 1), where these words are still wider than the text column. These
 * tests drive the real Text through a model of TextKit's greedy wrap until
 * it settles, at the folded widths, xSmall, Large, AX3 and AX5.
 */

const window = Dimensions.get('window');
const screen = Dimensions.get('screen');
let descriptor: PropertyDescriptor;
beforeEach(() => {
  descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
});
afterEach(() => {
  act(() => Dimensions.set({ window, screen }));
  Object.defineProperty(Platform, 'OS', descriptor);
});

interface Line {
  text: string;
  width: number;
  height: number;
}

/** TextKit's greedy wrap: whole words where they fit, else break the word. */
function wrap(content: string, column: number, size: number, height: number) {
  const lines: Line[] = [];
  let line = '';
  const push = (text: string) =>
    lines.push({ text, width: textWidth(text.trimEnd(), size), height });
  for (const word of content.split(/(?<= )/)) {
    if (textWidth((line + word).trimEnd(), size) <= column) {
      line += word;
      continue;
    }
    if (line) push(line);
    line = '';
    for (const glyph of word) {
      if (line && textWidth((line + glyph).trimEnd(), size) > column) {
        push(line);
        line = '';
      }
      line += glyph;
    }
  }
  if (line) push(line);
  return lines;
}

const AX3 = 2.643;
const AX5 = 3.571;

/** Lays the Text out until its size stops changing; returns the last lines. */
function settle(
  variant: TextVariant,
  content: string,
  column: number,
  fontScale: number,
) {
  act(() =>
    Dimensions.set({
      window: { ...window, width: 402, height: 678, fontScale },
      screen: { ...screen, width: 402, height: 678, fontScale },
    }),
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Text wordSafe variant={variant}>
        {content}
      </Text>,
    );
  });
  const role = textStyles[variant];
  // UIFontMetrics multiplies the drawn role by its ramp.
  const ramp = textRampScale(role.dynamicTypeRamp, fontScale) ?? 1;
  const text = () => renderer.root.findByType(NativeText);
  let lines: Line[] = [];
  let size = 0;
  for (let step = 0; step < 40; step++) {
    const style = StyleSheet.flatten(text().props.style);
    if (style.fontSize === size) break;
    size = style.fontSize;
    const drawn = size * ramp;
    const height = (style.lineHeight as number) * ramp;
    lines = wrap(content, column, drawn, height);
    act(() =>
      text().props.onLayout({
        nativeEvent: {
          layout: { x: 0, y: 0, width: column, height: lines.length * height },
        },
      }),
    );
    act(() => text().props.onTextLayout({ nativeEvent: { lines } }));
  }
  const drawnPoints = size * ramp;
  act(() => renderer.unmount());
  return { lines, drawnPoints };
}

const cases: [string, TextVariant, string][] = [
  [
    "Today's MP card vote row",
    'rowRecord',
    'Online Safety Amendment (Strengthening Enforcement for the Social Media Minimum Age) Bill 2026',
  ],
  ["Today's MP card vote row", 'rowRecord', 'That the amendment be agreed to'],
  ['Account sheet row', 'body', 'Community'],
  ['public money card', 'sectionTitle', 'Who wins government contracts?'],
];

// The text column inside a folded two-column card, a full folded card, and
// the folded display's single column beside the tab rail.
const columns = [110, 120, 200, 330];

describe.each([
  ['xSmall', 0.824],
  ['Large', 1],
  ['AX3', AX3],
  ['AX5', AX5],
])('%s on the folded display', (_, fontScale) => {
  test.each(
    cases.flatMap(([where, variant, content]) =>
      columns.map((column) => [where, column, variant, content] as const),
    ),
  )(
    '%s at %spt (%s): "%s" never breaks mid-word',
    (_w, column, variant, content) => {
      const { lines, drawnPoints } = settle(
        variant,
        content,
        column,
        fontScale,
      );
      expect(lines.map((line) => line.text).join('')).toBe(content);
      expect(breaksMidWord(lines)).toBe(false);
      expect(drawnPoints).toBeGreaterThanOrEqual(WORD_SAFE_MIN_POINTS - 0.2);
    },
  );
});

test('the audit case: "(Strengthening" is wider than a 110pt column at the default size', () => {
  // So stopping at cap 1, as before, could never fit it.
  expect(
    textWidth('(Strengthening', textStyles.rowRecord.fontSize),
  ).toBeGreaterThan(110);
  const { lines, drawnPoints } = settle(
    'rowRecord',
    'Online Safety Amendment (Strengthening Enforcement for the Social Media Minimum Age) Bill 2026',
    110,
    AX3,
  );
  expect(drawnPoints).toBeLessThan(textStyles.rowRecord.fontSize);
  expect(breaksMidWord(lines)).toBe(false);
});

test('a word that fits keeps the largest size that fits, not the floor', () => {
  const { drawnPoints } = settle('body', 'Community', 200, AX5);
  expect(drawnPoints).toBeGreaterThan(textStyles.body.fontSize);
});

test('the floor is 11pt below the default size, never above it', () => {
  expect(wordSafeFloor(17)).toBeCloseTo(0.65, 2);
  expect(wordSafeFloor(22) * 22).toBeGreaterThanOrEqual(WORD_SAFE_MIN_POINTS);
  expect(wordSafeFloor(11)).toBe(1);
  expect(wordSafeFloor(9)).toBe(1);
  expect(wordSafeFloor(0)).toBe(1);
  // The default floor is unchanged for direct callers.
  expect(nextWordSafeCap(30 * 1.05, 30)).toBe(1);
  expect(nextWordSafeCap(30, 30)).toBeNull();
  // With a role floor, a break at the default size steps down again.
  expect(nextWordSafeCap(30, 30, 0.65)).toBe(0.9);
  expect(nextWordSafeCap(30 * 0.7, 30, 0.65)).toBe(0.65);
  expect(nextWordSafeCap(30 * 0.65, 30, 0.65)).toBeNull();
});

test.each([110, 120])(
  'at Large a long title fits whole words above the floor in a %spt column',
  (column) => {
    const content = cases[0]![2];
    const { lines, drawnPoints } = settle('rowRecord', content, column, 1);
    expect(lines.map((line) => line.text).join('')).toBe(content);
    expect(breaksMidWord(lines)).toBe(false);
    expect(drawnPoints).toBeGreaterThan(WORD_SAFE_MIN_POINTS);
    expect(drawnPoints).toBeLessThanOrEqual(textStyles.rowRecord.fontSize);
  },
);

test.each([110, 120])(
  'at Large a short title keeps its full size in a %spt column',
  (column) => {
    const { lines, drawnPoints } = settle(
      'rowRecord',
      'A short bill',
      column,
      1,
    );
    expect(breaksMidWord(lines)).toBe(false);
    expect(drawnPoints).toBe(textStyles.rowRecord.fontSize);
  },
);
