import Constants from 'expo-constants';
import { act, Profiler } from 'react';
import {
  Text as NativeText,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { PersonRow } from '../src/design/people';
import { Text, pixelSlack } from '../src/design/text';
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
          partyStatus="current"
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

const nativeLines = [
  { text: 'Anthony ', x: 0, y: 0, width: 200, height: 70.591 },
  { text: 'Albanese', x: 0, y: 70.591, width: 200, height: 70.591 },
];
const oneLine = [
  { text: 'Anthony Albanese', x: 0, y: 0, width: 280, height: 70.591 },
];
const floorOf = (node: TestRenderer.ReactTestInstance) =>
  StyleSheet.flatten(node.props.style).minHeight;

test('word-safe text keeps the fractional AX5 final line inside its drawing frame, and grows only when it is proven short', () => {
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
  const lines = (value: typeof nativeLines) =>
    act(() => name().props.onTextLayout({ nativeEvent: { lines: value } }));
  // A fraction of a pixel is reserved from the first render: Yoga then ceils
  // the frame's bottom edge instead of flooring it (pixelSlack).
  expect(StyleSheet.flatten(name().props.style).paddingBottom).toBe(
    pixelSlack(3),
  );
  expect(pixelSlack(3)).toBeGreaterThan(0);
  // The frame the slack gives holds both lines: nothing grows.
  layout(141.667);
  lines(nativeLines);
  expect(floorOf(name())).toBeUndefined();
  // A frame proven shorter than its lines (141.182 pt in 141) still takes
  // the floor, once.
  layout(141);
  expect(floorOf(name())).toBe(142);
  layout(142);
  expect(floorOf(name())).toBe(142);
  expect(StyleSheet.flatten(name().props.style).height).toBeUndefined();
  expect(StyleSheet.flatten(name().props.style).maxHeight).toBeUndefined();
  // A smaller Dynamic Type setting must measure afresh rather than retain
  // the larger name's minimum height.
  let committed!: (x: number, y: number, width: number, height: number) => void;
  name().instance.measure = jest.fn((callback) => {
    committed = callback;
  });
  jest.mocked(useWindowDimensions).mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 1,
  });
  act(() => renderer.update(<Text wordSafe>Anthony Albanese</Text>));
  expect(floorOf(name())).toBeUndefined();
  layout(141); // A queued AX5 frame cannot establish Large's floor.
  layout(24);
  lines([{ text: 'Anthony Albanese', x: 0, y: 0, width: 150, height: 24.5 }]);
  expect(floorOf(name())).toBeUndefined();
  // Only the committed view's own measure proves the frame is this size's.
  act(() => committed(0, 0, 298, 24));
  expect(floorOf(name())).toBe(25);
  act(() => renderer.unmount());
});

test('a dropped final line (fewer characters than the words) takes the floor; a trailing no-break space or extra nested text does not', () => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 3.571 });
  const mount = (words: string) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Text wordSafe>{words}</Text>);
    });
    const name = () => renderer.root.findByType(NativeText);
    act(() =>
      name().props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 298, height: 141 } },
      }),
    );
    return {
      name,
      lines: (value: typeof nativeLines) =>
        act(() => name().props.onTextLayout({ nativeEvent: { lines: value } })),
      done: () => act(() => renderer.unmount()),
    };
  };
  // TextKit dropped "Albanese": its line fits the frame, the words do not.
  const dropped = mount('Anthony Albanese');
  dropped.lines(nativeLines.slice(0, 1));
  expect(floorOf(dropped.name())).toBe(142);
  dropped.done();
  const spaced = mount('divisions ');
  spaced.lines([{ text: 'divisions', x: 0, y: 0, width: 90, height: 52.157 }]);
  expect(floorOf(spaced.name())).toBeUndefined();
  spaced.done();
  const nested = mount('votes');
  nested.lines([{ text: '12 votes', x: 0, y: 0, width: 90, height: 52.157 }]);
  expect(floorOf(nested.name())).toBeUndefined();
  nested.done();
});

test('a listening Text that hears no line at all takes the floor: a fully clipped first line is silent', () => {
  jest.useFakeTimers();
  try {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Text wordSafe>Anthony Albanese</Text>);
    });
    const name = () => renderer.root.findByType(NativeText);
    act(() =>
      name().props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 298, height: 141 } },
      }),
    );
    expect(floorOf(name())).toBeUndefined();
    act(() => jest.advanceTimersByTime(300));
    expect(floorOf(name())).toBe(142);
    act(() => renderer.unmount());
    // Lines that arrive in time cancel it.
    act(() => {
      renderer = TestRenderer.create(<Text wordSafe>Anthony Albanese</Text>);
    });
    act(() =>
      name().props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 298, height: 141.667 } },
      }),
    );
    act(() => jest.advanceTimersByTime(100));
    act(() =>
      name().props.onTextLayout({ nativeEvent: { lines: nativeLines } }),
    );
    act(() => jest.advanceTimersByTime(300));
    expect(floorOf(name())).toBeUndefined();
    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
  }
});

test('a Text that has had its lines takes no silent floor later: after a rotation the same lines send no event', () => {
  jest.useFakeTimers();
  try {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Text wordSafe>Anthony Albanese</Text>);
    });
    const name = () => renderer.root.findByType(NativeText);
    let committed!: (x: number, y: number, w: number, h: number) => void;
    name().instance.measure = jest.fn((callback) => {
      committed = callback;
    });
    act(() =>
      name().props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 298, height: 25 } },
      }),
    );
    act(() =>
      name().props.onTextLayout({
        nativeEvent: {
          lines: [
            { text: 'Anthony Albanese', x: 0, y: 0, width: 150, height: 24 },
          ],
        },
      }),
    );
    // Landscape: a new identity, the same one line, and no line event.
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 844, height: 390, scale: 3, fontScale: 1 });
    act(() => renderer.update(<Text wordSafe>Anthony Albanese</Text>));
    act(() => committed(0, 0, 298, 25));
    act(() => jest.advanceTimersByTime(400));
    expect(floorOf(name())).toBeUndefined();
    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
  }
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
  const floor = () => floorOf(name());
  const layout = (width: number, height: number) =>
    act(() =>
      name().props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width, height } },
      }),
    );
  const lines = (value: typeof nativeLines) =>
    act(() => name().props.onTextLayout({ nativeEvent: { lines: value } }));
  layout(298, 141);
  lines(nativeLines);
  expect(floor()).toBe(142);
  // Wider: the floor goes, and the old width's lines prove nothing.
  layout(320, 142);
  expect(floor()).toBeUndefined();
  layout(320, 71);
  expect(floor()).toBeUndefined();
  lines(oneLine);
  expect(floor()).toBeUndefined();
  // Narrow again, short again: this width's own lines set the floor.
  layout(298, 71);
  layout(298, 141);
  expect(floor()).toBeUndefined();
  lines(nativeLines);
  expect(floor()).toBe(142);
  layout(600, 142);
  expect(floor()).toBeUndefined();
  layout(600, 71);
  lines(oneLine);
  expect(floor()).toBeUndefined();
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
  const floor = () => floorOf(name());
  const layout = (width: number, height: number) =>
    act(() =>
      name().props.onLayout({ nativeEvent: { layout: { width, height } } }),
    );
  const lines = (value: typeof nativeLines) =>
    act(() => name().props.onTextLayout({ nativeEvent: { lines: value } }));
  layout(298, 141);
  lines(nativeLines);
  expect(floor()).toBe(142);
  expect(measure).not.toHaveBeenCalled();
  layout(320, 142);
  expect(floor()).toBeUndefined();
  act(() => callbacks.shift()!(0, 0, 320.000001, 71));
  lines(oneLine);
  expect(floor()).toBeUndefined();
  // Narrowing already exceeds the old floor. Removing it leaves 141pt
  // unchanged, so there is no second layout event: the measure supplies the
  // frame, and this width's lines prove it short.
  layout(298, 141);
  expect(floor()).toBeUndefined();
  act(() => callbacks.shift()!(0, 0, 298, 141));
  expect(floor()).toBeUndefined();
  lines(nativeLines);
  expect(floor()).toBe(142);
  layout(600, 142);
  const stale = callbacks.shift()!;
  // A normal layout can settle before the asynchronous native measure returns.
  layout(600, 71);
  lines(oneLine);
  expect(floor()).toBeUndefined();
  act(() => stale(0, 0, 600, 72));
  expect(floor()).toBeUndefined();
  expect(measure).toHaveBeenCalledTimes(3);
  act(() => renderer.unmount());
});

test.each(['body', 'secondary', 'footnote'] as const)(
  'plain %s text reserves its slack in its measured height and never grows',
  (variant) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Text variant={variant} style={{ paddingBottom: 4 }}>
          Anthony Albanese
        </Text>,
      );
    });
    const text = () => renderer.root.findByType(NativeText);
    const layout = (height: number) =>
      act(() =>
        text().props.onLayout({
          nativeEvent: { layout: { width: 298, height } },
        }),
      );
    // The caller's own padding keeps its value and the slack is added to it.
    expect(StyleSheet.flatten(text().props.style).paddingBottom).toBe(
      4 + pixelSlack(3),
    );
    layout(141);
    // Plain text does not request line measurement, and takes no floor.
    expect(text().props.onTextLayout).toBeUndefined();
    expect(floorOf(text())).toBeUndefined();
    for (let i = 0; i < 20; i++) layout(141);
    expect(floorOf(text())).toBeUndefined();
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
    // No settling commit: until b77 every Text rendered again here to take
    // a floor of ceil(height) + 1 (1.667 pt taller than it first drew).
    expect(commits).toBe(1);
    expect(
      StyleSheet.flatten(nodes()[0]!.props.style).minHeight,
    ).toBeUndefined();
    expect(minimum - naturalHeight).toBeCloseTo(1.667, 3);
    expect(nodes().every((text) => text.props.onTextLayout === undefined)).toBe(
      true,
    );
    for (let i = 0; i < 20; i++) layout(naturalHeight);
    expect(commits).toBe(1);
    console.log(
      `standard-size ${kind} cost: 100 texts, ${commits} commit (the mount), 20 repeated layouts add 0 commits, Profiler ${duration.toFixed(2)}ms`,
    );
    act(() => renderer.unmount());
  },
);

test.each([
  ['standard', 1],
  ['AX5', 3.571],
] as const)(
  'word-safe text that fits at %s size settles once without recurring layouts',
  (size, fontScale) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
    let renderer!: TestRenderer.ReactTestRenderer;
    let commits = 0;
    act(() => {
      renderer = TestRenderer.create(
        <Profiler id="word-safe-text" onRender={() => commits++}>
          {Array.from({ length: 100 }, (_, i) => (
            <Text key={i} wordSafe variant="sectionTitle">
              Sources
            </Text>
          ))}
        </Profiler>,
      );
    });
    const nodes = () => renderer.root.findAllByType(NativeText);
    const height = 30 * fontScale;
    const layout = (frameHeight: number) =>
      act(() =>
        nodes().forEach((text) => {
          text.props.onLayout({
            nativeEvent: { layout: { width: 298, height: frameHeight } },
          });
          text.props.onTextLayout({
            nativeEvent: {
              lines: [{ text: 'Sources', x: 0, y: 0, width: 120, height }],
            },
          });
        }),
      );
    expect(commits).toBe(1);
    layout(height);
    // No settling commit: the word-safe state records frames and lines
    // without rendering, and a frame that holds its lines takes no floor.
    expect(commits).toBe(1);
    expect(
      StyleSheet.flatten(nodes()[0]!.props.style).minHeight,
    ).toBeUndefined();
    for (let i = 0; i < 20; i++) layout(height);
    expect(commits).toBe(1);
    console.log(
      `${size} word-safe fitting text: 100 texts, ${commits} commit (the mount), 20 repeated layouts add 0 commits`,
    );
    act(() => renderer.unmount());
  },
);
