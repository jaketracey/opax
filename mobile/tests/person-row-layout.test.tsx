import Constants from 'expo-constants';
import { act, Profiler } from 'react';
import {
  StyleSheet,
  Text as NativeText,
  useWindowDimensions,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { PersonRow } from '../src/design/people';
import { Text } from '../src/design/text';
import { drawnTextClipped } from '../src/design/text-probe.e2e';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'production' } } },
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Include the 16e's 3x screen and every accessibility size, plus standard.
test.each([1, 1.786, 2.143, 2.643, 3.143, 3.571])(
  'representative name has no line or height cap at font scale %s',
  (fontScale) => {
    jest.mocked(useWindowDimensions).mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale,
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <PersonRow
          name="Anthony Albanese"
          party="Labor"
          partyCurrent
          place="Member for Grayndler · House of Representatives · New South Wales"
          detail="As at 4 September 2026"
          testID="electorate-member-anthony-albanese"
          onPress={() => undefined}
        />,
      );
    });
    const name = renderer.root
      .findAllByType(NativeText)
      .find(
        (node) =>
          node.props.testID === 'electorate-member-anthony-albanese-name',
      )!;
    expect(name.props.children).toBe('Anthony Albanese');
    expect(name.props.numberOfLines).toBeUndefined();
    expect(name.props.adjustsFontSizeToFit).toBeUndefined();
    expect(name.props.allowFontScaling).toBe(true);
    expect(StyleSheet.flatten(name.props.style).flexShrink).toBe(0);
    const opaxText = renderer.root
      .findAllByType(Text)
      .find((node) => node.props.testID === name.props.testID)!;
    expect(opaxText.props.wordSafe).toBe(true);
    // Walk the real rendered name containers, excluding the decorative portrait.
    for (let node = name; node; node = node.parent!) {
      if (typeof node.props.style === 'function') continue;
      const style = StyleSheet.flatten(node.props.style) ?? {};
      expect(style.height).toBeUndefined();
      expect(style.maxHeight).toBeUndefined();
    }
    const column = renderer.root.find(
      (node) =>
        typeof node.type === 'string' &&
        StyleSheet.flatten(node.props.style)?.alignSelf === 'stretch',
    );
    let main = column.parent!;
    while (!StyleSheet.flatten(main.props.style)?.flexDirection)
      main = main.parent!;
    expect(StyleSheet.flatten(main.props.style).flexDirection).toBe(
      fontScale === 1 ? 'row' : 'column',
    );
    expect(StyleSheet.flatten(column.props.style).flex).toBe(
      fontScale === 1 ? 1 : undefined,
    );
    act(() => renderer.unmount());
  },
);

test('word-safe text keeps the fractional AX5 final line inside its rounded drawing frame', () => {
  jest.mocked(useWindowDimensions).mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 3.571,
  });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Text wordSafe>Anthony Albanese</Text>);
  });
  const name = () => renderer.root.findByType(NativeText);
  const layout = (height: number) =>
    act(() =>
      name().props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 298, height } },
      }),
    );
  layout(141);
  expect(StyleSheet.flatten(name().props.style).minHeight).toBe(142);
  layout(142);
  expect(StyleSheet.flatten(name().props.style).minHeight).toBe(142);
  expect(StyleSheet.flatten(name().props.style).height).toBeUndefined();
  expect(StyleSheet.flatten(name().props.style).maxHeight).toBeUndefined();
  // A smaller Dynamic Type setting must measure afresh rather than retain
  // the larger name's minimum height.
  jest.mocked(useWindowDimensions).mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 1,
  });
  act(() => renderer.update(<Text wordSafe>Anthony Albanese</Text>));
  expect(StyleSheet.flatten(name().props.style).minHeight).toBeUndefined();
  layout(25);
  expect(StyleSheet.flatten(name().props.style).minHeight).toBe(26);
  act(() => renderer.unmount());
});

test('298 → 320 → 298 → 600 measures afresh without carrying the old floor', () => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 3.571 });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Text wordSafe>Anthony Albanese</Text>);
  });
  const name = () => renderer.root.findByType(NativeText);
  const floor = () => StyleSheet.flatten(name().props.style).minHeight;
  const layout = (width: number, height: number) =>
    act(() =>
      name().props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width, height } },
      }),
    );
  layout(298, 141);
  expect(floor()).toBe(142);
  for (const [width, oldHeight, naturalHeight, expected] of [
    [320, 142, 71, 72],
    [298, 141, 141, 142],
    [600, 142, 71, 72],
  ]) {
    layout(width!, oldHeight!);
    expect(floor()).toBeUndefined();
    layout(width!, naturalHeight!);
    expect(floor()).toBe(expected);
    layout(width!, expected!);
    expect(floor()).toBe(expected);
  }
  act(() => renderer.unmount());
});

test('a width reset remeasures even when removing the floor emits no onLayout', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  const callbacks: ((
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void)[] = [];
  const measure = jest.fn((callback) => callbacks.push(callback));
  act(() => {
    renderer = TestRenderer.create(<Text wordSafe>Anthony Albanese</Text>);
  });
  const name = () => renderer.root.findByType(NativeText);
  name().instance.measure = measure;
  const floor = () => StyleSheet.flatten(name().props.style).minHeight;
  const layout = (width: number, height: number) =>
    act(() =>
      name().props.onLayout({ nativeEvent: { layout: { width, height } } }),
    );
  layout(298, 141);
  expect(measure).not.toHaveBeenCalled();
  layout(320, 142);
  expect(floor()).toBeUndefined();
  act(() => callbacks.shift()!(0, 0, 320.000001, 71));
  expect(floor()).toBe(72);
  // Narrowing already exceeds the old 72pt floor. Removing it leaves 141pt
  // unchanged, so there is no second layout event to drive the guard.
  layout(298, 141);
  expect(floor()).toBeUndefined();
  act(() => callbacks.shift()!(0, 0, 298, 141));
  expect(floor()).toBe(142);
  layout(600, 142);
  const stale = callbacks.shift()!;
  // A normal layout can settle before the asynchronous native measure returns.
  layout(600, 71);
  expect(floor()).toBe(72);
  act(() => stale(0, 0, 600, 72));
  expect(floor()).toBe(72);
  expect(measure).toHaveBeenCalledTimes(3);
  act(() => renderer.unmount());
});

const nativeLines = [
  { text: 'Anthony ', x: 0, y: 0, width: 200, height: 70.591 },
  { text: 'Albanese', x: 0, y: 70.591, width: 200, height: 70.591 },
];

test.each(['body', 'metadata', 'fine'] as const)(
  'plain %s text protects its fractional final line',
  (variant) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Text variant={variant}>Anthony Albanese</Text>,
      );
    });
    const text = () => renderer.root.findByType(NativeText);
    const layout = (height: number) =>
      act(() =>
        text().props.onLayout({
          nativeEvent: { layout: { width: 298, height } },
        }),
      );
    layout(141);
    // The guard works without any line event, including RN's suppressed first
    // empty glyph result. Plain text does not request extra line measurement.
    expect(text().props.onTextLayout).toBeUndefined();
    expect(StyleSheet.flatten(text().props.style).minHeight).toBe(142);
    for (let i = 0; i < 20; i++) layout(142);
    expect(StyleSheet.flatten(text().props.style).minHeight).toBe(142);
    act(() => renderer.unmount());
  },
);

test('drawing check rejects the clipped one-line surname, missing text and last-line height', () => {
  const frame = { width: 298, height: 142 };
  expect(
    drawnTextClipped(
      [{ text: 'Anthony Albanese', x: 0, y: 0, width: 306, height: 70.591 }],
      frame,
      'Anthony Albanese',
    ),
  ).toBe(true);
  expect(
    drawnTextClipped(nativeLines.slice(0, 1), frame, 'Anthony Albanese'),
  ).toBe(true);
  expect(
    drawnTextClipped(
      nativeLines,
      { ...frame, height: 141 },
      'Anthony Albanese',
    ),
  ).toBe(true);
  expect(drawnTextClipped(nativeLines, frame, 'Anthony Albanese')).toBe(false);
});

test.each([false, true])(
  'person-row name keeps its stable ID unless drawn checks are requested: %s',
  (testDrawnName) => {
    Constants.expoConfig!.extra!.variant = 'e2e';
    jest.mocked(useWindowDimensions).mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <PersonRow
          name="Anthony Albanese"
          testID="search-result-anthony-albanese"
          testDrawnName={testDrawnName}
          onPress={() => undefined}
        />,
      );
    });
    const name = () =>
      renderer.root
        .findAllByType(NativeText)
        .find((node) =>
          node.props.testID?.startsWith('search-result-anthony-albanese-name'),
        )!;
    expect(name().props.testID).toBe('search-result-anthony-albanese-name');
    act(() =>
      name().props.onLayout({
        nativeEvent: { layout: { width: 298, height: 142 } },
      }),
    );
    act(() =>
      name().props.onTextLayout({ nativeEvent: { lines: nativeLines } }),
    );
    expect(name().props.testID).toBe(
      testDrawnName
        ? 'search-result-anthony-albanese-name-drawn-complete-2'
        : 'search-result-anthony-albanese-name',
    );
    act(() => renderer.unmount());
    Constants.expoConfig!.extra!.variant = 'production';
  },
);

test.each(['production', 'development', 'e2e'])(
  'drawn-name hook is gated for %s',
  (variant) => {
    Constants.expoConfig!.extra!.variant = variant;
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Text wordSafe testDrawnText testID="name">
          Anthony Albanese
        </Text>,
      );
    });
    const name = () => renderer.root.findByType(NativeText);
    act(() =>
      name().props.onLayout({
        nativeEvent: { layout: { width: 298, height: 141 } },
      }),
    );
    act(() =>
      name().props.onTextLayout({
        nativeEvent: {
          lines: [
            {
              text: 'Anthony Albanese',
              x: 0,
              y: 0,
              width: 306,
              height: 70.591,
            },
          ],
        },
      }),
    );
    expect(name().props.testID).toBe(
      variant === 'e2e' ? 'name-drawn-clipped-1' : 'name',
    );
    act(() =>
      name().props.onLayout({
        nativeEvent: { layout: { width: 298, height: 142 } },
      }),
    );
    act(() =>
      name().props.onTextLayout({ nativeEvent: { lines: nativeLines } }),
    );
    expect(name().props.testID).toBe(
      variant === 'e2e' ? 'name-drawn-complete-2' : 'name',
    );
    act(() => renderer.unmount());
    Constants.expoConfig!.extra!.variant = 'production';
  },
);

test.each([
  ['single-line', 25.333, 27],
  ['multiline', 50.333, 52],
] as const)(
  'standard-size %s cost settles once without recurring layouts',
  (kind, naturalHeight, minimum) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    let renderer!: TestRenderer.ReactTestRenderer;
    let commits = 0;
    let duration = 0;
    act(() => {
      renderer = TestRenderer.create(
        <Profiler
          id="standard-text"
          onRender={(_id, _phase, actualDuration) => {
            commits++;
            duration += actualDuration;
          }}
        >
          {Array.from({ length: 100 }, (_, i) => (
            <Text key={i}>
              {kind === 'single-line'
                ? 'A source line'
                : 'A source line\nA second line'}
            </Text>
          ))}
        </Profiler>,
      );
    });
    const nodes = () => renderer.root.findAllByType(NativeText);
    const layout = (height: number) =>
      act(() =>
        nodes().forEach((text) =>
          text.props.onLayout({
            nativeEvent: { layout: { width: 298, height } },
          }),
        ),
      );
    expect(commits).toBe(1);
    layout(naturalHeight);
    expect(commits).toBe(2);
    expect(StyleSheet.flatten(nodes()[0]!.props.style).minHeight).toBe(minimum);
    expect(minimum - naturalHeight).toBeCloseTo(1.667, 3);
    expect(nodes().every((text) => text.props.onTextLayout === undefined)).toBe(
      true,
    );
    for (let i = 0; i < 20; i++) layout(minimum);
    expect(commits).toBe(2);
    console.log(
      `standard-size ${kind} guard cost: 100 texts, ${commits} commits including mount, 20 repeated layouts add 0 commits, Profiler ${duration.toFixed(2)}ms`,
    );
    act(() => renderer.unmount());
  },
);
