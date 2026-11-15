import { Profiler, act } from 'react';
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text as NativeText,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  LINE_HEIGHT_NUDGE,
  Text,
  breaksMidWord,
  wordSafeOnFrame,
  wordSafeOnLines,
  wordSafeStart,
} from '../src/design/text';
import { textRampScale } from '../src/design/text-scale';
import { textStyles, type TextVariant } from '../src/design/tokens';
import { textWidth } from './row-layout';

/**
 * Word-safe stepping must settle. Shared sizes can sit closer together than
 * 10%. A first step within the measurement tolerance of full size (0.7% at
 * Android 14's 130%), or a one-line layout whose TextKit rect is a point
 * taller than its line, read as a full-size layout that fits: the text
 * restarted at full size, broke, stepped and fitted again on every frame
 * ("Community" in a 74pt column at Large went 15/14/15pt). A layout queued
 * from the size before must not step it again either.
 *
 * Android 14's nonlinear SP scaling, from AOSP's FontScaleConverterFactory
 * lookup tables; other scales convert linearly.
 */
const mockState = { nonlinear: false };
const mockFromSp = [8, 10, 12, 14, 18, 20, 24, 30, 100];
const mockToDp: Record<string, number[]> = {
  '1.15': [9.2, 11.5, 13.8, 16.4, 19.8, 21.8, 25.2, 30, 100],
  '1.3': [10.4, 13, 15.6, 18.8, 21.6, 23.6, 26.4, 30, 100],
  '1.5': [12, 15, 18, 22, 24, 26, 28, 30, 100],
  '1.8': [14.4, 18, 21.6, 24.4, 27.6, 30.8, 32.8, 34.8, 100],
  '2': [16, 20, 24, 26, 30, 34, 36, 38, 100],
};
function mockInterpolate(value: number, from: number[], to: number[]) {
  if (value <= from[0]!) return (value * to[0]!) / from[0]!;
  for (let i = 1; i < from.length; i++)
    if (value <= from[i]!)
      return (
        to[i - 1]! +
        ((value - from[i - 1]!) * (to[i]! - to[i - 1]!)) /
          (from[i]! - from[i - 1]!)
      );
  return value;
}
jest.mock('../modules/opax-text-metrics', () => ({
  spToDp: (sp: number, fontScale: number) => {
    const table = mockState.nonlinear ? mockToDp[String(fontScale)] : null;
    return table ? mockInterpolate(sp, mockFromSp, table) : sp * fontScale;
  },
  dpToSp: (dp: number, fontScale: number) => {
    const table = mockState.nonlinear ? mockToDp[String(fontScale)] : null;
    return table ? mockInterpolate(dp, table, mockFromSp) : dp / fontScale;
  },
}));
const { spToDp } = jest.requireMock('../modules/opax-text-metrics') as {
  spToDp: (sp: number, fontScale: number) => number;
};

const window = Dimensions.get('window');
const screen = Dimensions.get('screen');
let descriptor: PropertyDescriptor;
beforeEach(() => {
  descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
});
afterEach(() => {
  mockState.nonlinear = false;
  act(() => Dimensions.set({ window, screen }));
  Object.defineProperty(Platform, 'OS', descriptor);
});

interface Line {
  text: string;
  width: number;
  height: number;
  y: number;
}
/** TextKit's greedy wrap: whole words where they fit, else break the word. */
function wrap(content: string, column: number, size: number, height: number) {
  const lines: Line[] = [];
  let line = '';
  const push = (text: string) =>
    lines.push({
      text,
      width: textWidth(text.trimEnd(), size),
      height,
      y: lines.length * height,
    });
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

/**
 * Lays the Text out at the size it draws, as the platform reports it, up to
 * 40 times or until its size holds. Then delivers that settled layout five
 * more times. iOS reports TextKit's used rects (a point taller than the line)
 * with line origins; Android reports line boxes in dp.
 */
function settle(
  os: 'ios' | 'android',
  variant: TextVariant,
  content: string,
  column: number,
  fontScale: number,
) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  act(() =>
    Dimensions.set({
      window: { ...window, width: 402, height: 678, fontScale },
      screen: { ...screen, width: 402, height: 678, fontScale },
    }),
  );
  let renders = 0;
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Profiler id="text" onRender={() => renders++}>
        <Text wordSafe variant={variant}>
          {content}
        </Text>
      </Profiler>,
    );
  });
  const role = textStyles[variant];
  const ramp = textRampScale(role.dynamicTypeRamp, fontScale, 0, 'ios') ?? 1;
  const text = () => renderer.root.findByType(NativeText);
  const deliver = () => {
    const style = StyleSheet.flatten(text().props.style);
    const size = style.fontSize as number;
    const lineHeight = style.lineHeight as number;
    const drawn = os === 'ios' ? size * ramp : spToDp(size, fontScale);
    const height =
      os === 'ios' ? lineHeight * ramp : spToDp(lineHeight, fontScale);
    const lines = wrap(content, column, drawn, height);
    const reported =
      os === 'ios'
        ? lines.map((line) => ({
            ...line,
            height: height + 1,
            width:
              line.width +
              (line.text.endsWith(' ') ? textWidth(' ', drawn) : 0),
          }))
        : lines;
    const frameHeight = Math.ceil(
      lines.length * height + (os === 'ios' ? 1 : 0),
    );
    act(() =>
      text().props.onLayout({
        nativeEvent: {
          layout: { x: 0, y: 0, width: column, height: frameHeight },
        },
      }),
    );
    act(() => text().props.onTextLayout({ nativeEvent: { lines: reported } }));
    return { lines, drawn, size };
  };
  let sizes: number[] = [];
  let last = deliver();
  sizes.push(last.size);
  for (let i = 0; i < 40; i++) {
    const size = StyleSheet.flatten(text().props.style).fontSize as number;
    if (size === last.size) break;
    last = deliver();
    sizes.push(last.size);
  }
  const settledRenders = renders;
  const settledSize = last.size;
  for (let i = 0; i < 5; i++) deliver();
  const after = StyleSheet.flatten(text().props.style).fontSize as number;
  sizes = [...sizes, after];
  act(() => renderer.unmount());
  return {
    steps: new Set(sizes).size - 1,
    sizes,
    settledSize,
    after,
    renders: settledRenders,
    extraRenders: renders - settledRenders,
    broken: breaksMidWord(last.lines),
    drawn: last.drawn,
  };
}

const iosSizes = [0.882, 0.941, 1, 1.118];
describe.each([
  ['secondary', 'Community', 74],
  ['body', 'Community', 74],
  ['body', 'Representation', 110],
  ['body', 'Representation', 120],
] as const)(
  'iOS TextKit rects: %s "%s" in a %spt column',
  (variant, content, column) => {
    test.each(iosSizes)(
      'settles whole at %s, with no render once settled',
      (fontScale) => {
        const result = settle('ios', variant, content, column, fontScale);
        expect(result.broken).toBe(false);
        // One size, held: no 15/14/15pt alternation, however often it is laid out.
        expect(result.after).toBe(result.settledSize);
        expect(result.extraRenders).toBe(0);
        expect(result.steps).toBeLessThanOrEqual(3);
        // Mount, the shared height floor, and at most one render a step.
        expect(result.renders).toBeLessThanOrEqual(2 + 2 * result.steps);
      },
    );
  },
);

describe.each([
  ['body', 'Community', 110, 1.3],
  ['rowRecord', 'Community', 110, 1.3],
  ['sectionTitle', 'Bill Parliamentary changes', 160, 1.3],
  ['footnote', 'Representation', 90, 1.8],
  ['rowRecord', 'Who wins government contracts?', 160, 2],
] as const)(
  'Android 14 nonlinear: %s "%s" in a %sdp column at %s',
  (variant, content, column, fontScale) => {
    test('settles whole, with no render once settled', () => {
      mockState.nonlinear = true;
      const result = settle('android', variant, content, column, fontScale);
      expect(result.broken).toBe(false);
      expect(result.after).toBe(result.settledSize);
      expect(result.extraRenders).toBe(0);
      expect(result.steps).toBeLessThanOrEqual(8);
    });
  },
);

test.each([
  ['body', 'Community', 110],
  ['body', 'Community', 120],
  ['secondary', 'Representation', 120],
  ['secondary', 'Bill (Strengthening changes', 120],
  ['sectionTitle', 'Who wins government contracts?', 160],
] as const)(
  'Android linear: %s "%s" in a %sdp column never draws smaller at a larger standard font size',
  (variant, content, column) => {
    let below = 0;
    for (const fontScale of [0.85, 1, 1.15, 1.3, 1.5, 1.8, 2]) {
      const { drawn, broken } = settle(
        'android',
        variant,
        content,
        column,
        fontScale,
      );
      expect(broken).toBe(false);
      expect(`${fontScale} ${drawn >= below - 1e-6}`).toBe(`${fontScale} true`);
      below = drawn;
    }
  },
);

test('iOS: a word over several whole lines at AX5 skips the sizes it provably overflows, and keeps the largest that fits', () => {
  // At AX5 "(Strengthening" fills four lines of a 110pt column. Their summed
  // width proves every size above about 1.4 still breaks, so it skips them
  // rather than stepping through each one.
  const result = settle(
    'ios',
    'rowRecord',
    'Bill (Strengthening changes',
    110,
    3.571,
  );
  expect(result.broken).toBe(false);
  // The 16pt every reader from Medium up draws, in a few steps rather than 15.
  expect(result.drawn).toBeCloseTo(16, 6);
  expect(result.steps).toBeLessThanOrEqual(7);
  expect(result.extraRenders).toBe(0);
});

test('a cap within the tolerance of full size never reads its own layout as full size', () => {
  // A last step to a floor just below full size (0.98 of 1) lands within the
  // measurement tolerance. Its own fitting layout must not restart full size,
  // or the text would break, step and fit again on every frame.
  const base = textStyles.sectionTitle.lineHeight + LINE_HEIGHT_NUDGE;
  const content = 'Recorded representation';
  const at = (scale: number, texts: [string, string]) =>
    texts.map((text, index) => ({
      text,
      width: text.length * 9,
      height: base * scale,
      y: index * base * scale,
    }));
  let state = wordSafeStart(content, 1);
  state = wordSafeOnFrame(state, state, 200);
  state = wordSafeOnLines(
    state,
    state,
    at(1, ['Recorded representatio', 'n']),
    content,
    base,
    true,
    0.98,
    textStyles.sectionTitle.fontSize,
    [1, 0.98],
    'ios',
  );
  expect(state.cap).toBe(0.98);
  state = wordSafeOnFrame(state, state, 200);
  const capped = state;
  const next = wordSafeOnLines(
    state,
    state,
    at(0.98, ['Recorded ', 'representation']),
    content,
    base,
    true,
    0.98,
    textStyles.sectionTitle.fontSize,
    [1, 0.98],
    'ios',
  );
  expect(next.cap).toBe(0.98);
  expect(next.gen).toBe(capped.gen);
});

test("iOS figure: Apple's 1pt steps hold against a layout queued from the size before", () => {
  // figure is 34pt on the largeTitle ramp, so its readers' sizes are 1pt
  // (2.9%) apart: closer than the 0.03 measurement tolerance. A layout
  // queued from the size before a step must not step the new size again.
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  act(() =>
    Dimensions.set({
      window: { ...window, fontScale: 1 },
      screen: { ...screen, fontScale: 1 },
    }),
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Text wordSafe variant="figure">
        Representation
      </Text>,
    );
  });
  const text = () => renderer.root.findByType(NativeText);
  const base = textStyles.figure.lineHeight + LINE_HEIGHT_NUDGE;
  const points = () => StyleSheet.flatten(text().props.style).fontSize;
  const broken = (at: number) =>
    act(() => {
      text().props.onLayout({
        nativeEvent: {
          layout: {
            x: 0,
            y: 0,
            width: 200,
            height: Math.ceil(2 * base * at + 1),
          },
        },
      });
      text().props.onTextLayout({
        nativeEvent: {
          lines: [
            { text: 'Representatio', width: 198, height: base * at + 1, y: 0 },
            { text: 'n', width: 14, height: base * at + 1, y: base * at },
          ],
        },
      });
    });
  broken(1);
  // Medium's own 33pt, the next size down.
  expect(points()).toBeCloseTo(33, 6);
  broken(1); // The 34pt layout, queued, through current props.
  expect(points()).toBeCloseTo(33, 6);
  broken(33 / 34); // 33pt's own layout still breaks: Small's 32pt.
  expect(points()).toBeCloseTo(32, 6);
  broken(33 / 34); // And the 33pt layout queued after that step.
  expect(points()).toBeCloseTo(32, 6);
  act(() => renderer.unmount());
});

test.each([
  ['figure', 'Representation', 200],
  ['figure', '$1,234,567', 150],
  ['figure', 'Senate · 19 Aug 2026', 110],
  ['pageTitle', 'Representation', 200],
  ['pageTitle', 'Parliamentarians', 160],
  ['recordTitle', 'Senate · 19 Aug 2026', 90],
  ['recordTitle', 'Representation', 180],
] as const)(
  'iOS %s "%s" in a %spt column: a larger text setting never draws smaller, 1pt steps included',
  (variant, content, column) => {
    let below = 0;
    for (const fontScale of [
      0.823, 0.882, 0.941, 1, 1.118, 1.235, 1.353, 1.786, 2.143, 2.643, 3.143,
      3.571,
    ]) {
      const result = settle('ios', variant, content, column, fontScale);
      expect(result.after).toBe(result.settledSize);
      expect(`${fontScale} ${result.drawn >= below - 1e-6}`).toBe(
        `${fontScale} true`,
      );
      below = result.drawn;
    }
  },
);
