import { Profiler, act } from 'react';
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text as NativeText,
  View,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  LINE_HEIGHT_NUDGE,
  Text,
  WORD_SAFE_MIN_POINTS,
  breaksMidWord,
  nextWordSafeCap,
  roleWordSafeSizes,
  wordSafeFloor,
  wordSafeSizes,
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
  nativeGeometry = false,
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
    // RN iOS reports TextKit's used rectangles, not the paragraph advance.
    // Include leading and trailing-space overhang instead of idealised boxes.
    // These are geometry fixtures, not measurements from a device capture.
    const reported = nativeGeometry
      ? lines.map((line, index) => ({
          ...line,
          y: index * height,
          height: height + 1,
          width:
            line.width + (line.text.endsWith(' ') ? textWidth(' ', drawn) : 0),
        }))
      : lines;
    act(() =>
      text().props.onLayout({
        nativeEvent: {
          layout: {
            x: 0,
            y: 0,
            width: column,
            height: Math.ceil(lines.length * height + (nativeGeometry ? 1 : 0)),
          },
        },
      }),
    );
    act(() => text().props.onTextLayout({ nativeEvent: { lines: reported } }));
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

describe.each([
  ['AX3', AX3],
  ['AX5', AX5],
] as const)('%s TextKit rectangles', (_, fontScale) => {
  test.each(
    ['(Consequential', '(Strengthening', 'amendment', 'Enforcement'].flatMap(
      (word) => [110, 120, 277].map((column) => [word, column] as const),
    ),
  )('%s stays whole in a %spt column', (word, column) => {
    const { lines, drawnPoints } = settle(
      'rowRecord',
      `Bill ${word} changes`,
      column,
      fontScale,
      true,
    );
    expect(lines.map((line) => line.text).join('')).toBe(
      `Bill ${word} changes`,
    );
    expect(lines.every((line) => line.width <= column)).toBe(true);
    expect(breaksMidWord(lines)).toBe(false);
    expect(drawnPoints).toBeGreaterThanOrEqual(WORD_SAFE_MIN_POINTS - 0.2);
  });
});

test('Large text that already fits has the same size and line measurements with native rectangles', () => {
  for (const content of [
    'A short bill',
    'Limitation of debate',
    'Senate · 19 Aug 2026',
  ]) {
    const ideal = settle('rowRecord', content, 277, 1);
    const native = settle('rowRecord', content, 277, 1, true);
    expect(native).toEqual(ideal);
    expect(native.drawnPoints).toBe(textStyles.rowRecord.fontSize);
  }
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

test('word-safe numberOfLines treats a truncated tail as the last line, with no step-down', () => {
  act(() =>
    Dimensions.set({
      window: { ...window, fontScale: 1 },
      screen: { ...screen, fontScale: 1 },
    }),
  );
  const content = 'Online Safety Amendment (Strengthening Enforcement)';
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Text wordSafe numberOfLines={2}>
        {content}
      </Text>,
    );
  });
  const text = () => renderer.root.findByType(NativeText);
  const style = StyleSheet.flatten(text().props.style);
  const height = style.lineHeight as number;
  // TextKit keeps the undrawn tail in the last reported line. There is no
  // next line, so truncating that tail cannot count as a mid-word wrap.
  const lines = [
    { text: 'Online Safety ', width: 100, height },
    { text: 'Amendment (Strengthening Enforcement)', width: 110, height },
  ];
  expect(breaksMidWord(lines)).toBe(false);
  act(() =>
    text().props.onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width: 110, height: 2 * height } },
    }),
  );
  act(() => text().props.onTextLayout({ nativeEvent: { lines } }));
  expect(text().props.numberOfLines).toBe(2);
  expect(StyleSheet.flatten(text().props.style).fontSize).toBe(style.fontSize);
  // A platform reporting hidden lines must not trigger fitting either.
  act(() =>
    text().props.onTextLayout({
      nativeEvent: { lines: wrap(content, 110, style.fontSize, height) },
    }),
  );
  expect(StyleSheet.flatten(text().props.style).fontSize).toBe(style.fontSize);
  act(() => renderer.unmount());
});

test.each([
  'averylongexampleperson@archive.example.invalid',
  'https://archive.example.org/photos/long-path',
  'www.archive.example.org/photos/long-path',
  'archive.example.org',
])(
  'a row text containing address %j keeps full size despite character wrapping',
  (content) => {
    act(() =>
      Dimensions.set({
        window: { ...window, fontScale: 1 },
        screen: { ...screen, fontScale: 1 },
      }),
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Text wordSafe onTextLayout={() => {}}>
          {content}
        </Text>,
      );
    });
    const text = () => renderer.root.findByType(NativeText);
    const style = StyleSheet.flatten(text().props.style);
    const height = style.lineHeight as number;
    const split = content.indexOf('example') + 3;
    const lines = [
      { text: content.slice(0, split), width: 99, height },
      { text: content.slice(split), width: 99, height },
    ];
    expect(breaksMidWord(lines)).toBe(true);
    act(() =>
      text().props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 2 * height } },
      }),
    );
    act(() => text().props.onTextLayout({ nativeEvent: { lines } }));
    expect(StyleSheet.flatten(text().props.style).fontSize).toBe(
      style.fontSize,
    );
    act(() => renderer.unmount());
  },
);

// Every iOS reader text size, xSmall to AX5 (RN's font-scale multipliers).
const readerSizes = [
  ['xSmall', 0.823],
  ['Small', 0.882],
  ['Medium', 0.941],
  ['Large', 1],
  ['xLarge', 1.118],
  ['xxLarge', 1.235],
  ['xxxLarge', 1.353],
  ['AX1', 1.786],
  ['AX2', 2.143],
  ['AX3', AX3],
  ['AX4', 3.143],
  ['AX5', AX5],
] as const;

describe('one set of word-safe sizes for every reader (D8 leftover)', () => {
  test('"(Strengthening" in a 110pt column at Large takes the 16pt Medium draws, whole', () => {
    // Before, Large stepped 10% from its own 17pt to 15.3pt, smaller than
    // the 16pt a Medium reader draws, where the word already fits.
    const { lines, drawnPoints } = settle(
      'rowRecord',
      'Online Safety Amendment (Strengthening Enforcement for the Social Media Minimum Age) Bill 2026',
      110,
      1,
    );
    expect(breaksMidWord(lines)).toBe(false);
    expect(lines.some((line) => line.text.startsWith('(Strengthening'))).toBe(
      true,
    );
    expect(drawnPoints).toBeCloseTo(16, 6);
  });

  test.each([
    ['rowRecord', 'Bill (Strengthening changes', 110],
    ['rowRecord', 'Bill (Consequential changes', 120],
    ['rowRecord', cases[0]![2], 200],
    ['body', 'Community', 110],
    ['sectionTitle', 'Who wins government contracts?', 110],
    ['sectionTitle', 'Who wins government contracts?', 200],
    ['recordTitle', 'Parliamentary Representation', 160],
  ] as const)(
    '%s "%s" at %spt: a larger text setting never draws smaller, and never breaks a word',
    (variant, content, column) => {
      const drawn = readerSizes.map(([name, fontScale]) => {
        const { lines, drawnPoints } = settle(
          variant,
          content,
          column,
          fontScale,
        );
        expect(`${name} ${breaksMidWord(lines)}`).toBe(`${name} false`);
        return [name, drawnPoints] as const;
      });
      // Small, Large, xLarge, AX1 and AX5 among them.
      for (let i = 1; i < drawn.length; i++) {
        const [smaller, below] = drawn[i - 1]!;
        const [larger, above] = drawn[i]!;
        expect(`${larger} ${above >= below - 1e-6}`).toBe(`${larger} true`);
        if (above < below - 1e-6)
          throw new Error(`${larger} ${above}pt < ${smaller} ${below}pt`);
      }
    },
  );

  test('every reader size draws exactly its role size when the text fits', () => {
    const role = textStyles.rowRecord;
    const content = 'That the amendment be agreed to';
    for (const [name, fontScale] of readerSizes) {
      const { lines, drawnPoints } = settle(
        'rowRecord',
        content,
        330,
        fontScale,
      );
      const ramp = textRampScale(role.dynamicTypeRamp, fontScale) ?? 1;
      expect(`${name} ${drawnPoints}`).toBe(`${name} ${role.fontSize * ramp}`);
      expect(lines.map((line) => line.text).join('')).toBe(content);
    }
  });

  test('the sizes hold every Dynamic Type size of the role, no step wider than 10%, down to 11pt', () => {
    const points = roleWordSafeSizes('rowRecord', 0, 'ios').map(
      (size) => size * textStyles.rowRecord.fontSize,
    );
    for (const own of [14, 15, 16, 17, 19, 21, 23, 28, 33, 40, 47, 53])
      expect(points.some((point) => Math.abs(point - own) < 1e-9)).toBe(true);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!).toBeLessThan(points[i - 1]!);
      expect(points[i]! / points[i - 1]!).toBeGreaterThanOrEqual(0.9 - 1e-9);
    }
    expect(points[points.length - 1]).toBeCloseTo(
      wordSafeFloor(textStyles.rowRecord.fontSize) * 17,
      6,
    );
    // The title ceiling: recordTitle never steps from above AX2's 43pt.
    expect(roleWordSafeSizes('recordTitle', 0, 'ios')[0]! * 28).toBeCloseTo(
      43,
      6,
    );
    // Equal anchors collapse, and each gap wider than 10% is filled evenly.
    expect(wordSafeSizes([1, 1, 0.8], 0.5).map((x) => +x.toFixed(4))).toEqual([
      1, 0.9283, 0.8618, 0.8, 0.7282, 0.6629, 0.6034, 0.5493, 0.5,
    ]);
  });
});

test('fifty fitting rows: word-safe adds no render and no measure after layout', () => {
  act(() =>
    Dimensions.set({
      window: { ...window, width: 402, fontScale: 1 },
      screen: { ...screen, width: 402, fontScale: 1 },
    }),
  );
  const run = (wordSafe: boolean) => {
    const renders = new Map<number, number>();
    const measure = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <View>
          {Array.from({ length: 50 }, (_, row) => (
            <Profiler
              key={row}
              id={String(row)}
              onRender={() => renders.set(row, (renders.get(row) ?? 0) + 1)}
            >
              <Text wordSafe={wordSafe} variant="rowRecord">
                {`Division ${row + 1}: that the bill be read a second time`}
              </Text>
            </Profiler>
          ))}
        </View>,
        { createNodeMock: () => ({ measure }) },
      );
    });
    const measuredOnMount = measure.mock.calls.length;
    const rows = renderer.root.findAllByType(NativeText);
    const sizes = rows.map(
      (row) => StyleSheet.flatten(row.props.style).fontSize as number,
    );
    const height = textStyles.rowRecord.lineHeight + LINE_HEIGHT_NUDGE;
    // Fabric may deliver each event more than once.
    for (let pass = 0; pass < 2; pass++)
      for (const [row, text] of rows.entries()) {
        const content = `Division ${row + 1}: that the bill be read a second time`;
        act(() =>
          text.props.onLayout({
            nativeEvent: {
              layout: { x: 0, y: 0, width: 360, height: Math.ceil(2 * height) },
            },
          }),
        );
        text.props.onTextLayout &&
          act(() =>
            text.props.onTextLayout({
              nativeEvent: {
                lines: wrap(
                  content,
                  360,
                  textStyles.rowRecord.fontSize,
                  height,
                ),
              },
            }),
          );
      }
    const after = renderer.root
      .findAllByType(NativeText)
      .map((row) => StyleSheet.flatten(row.props.style).fontSize as number);
    act(() => renderer.unmount());
    return {
      renders: [...renders.values()],
      measuredOnMount,
      measuredAfter: measure.mock.calls.length - measuredOnMount,
      sizes,
      after,
    };
  };
  const plain = run(false);
  const safe = run(true);
  // Every row fits, so word-safe never changes a size...
  expect(safe.after).toEqual(safe.sizes);
  expect(
    safe.after.every((size) => size === textStyles.rowRecord.fontSize),
  ).toBe(true);
  // ...and each row renders exactly as often as plain text (its mount and the
  // shared height floor), with no measure() beyond the one on mount.
  expect(safe.renders).toHaveLength(50);
  expect(safe.renders).toEqual(plain.renders);
  expect(safe.measuredOnMount).toBeLessThanOrEqual(50);
  expect(safe.measuredAfter).toBe(0);
});
