import { act, createElement } from 'react';
import {
  Dimensions,
  Text as NativeText,
  Platform,
  StyleSheet,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import * as accessibility from '../src/design/accessibility';
import {
  Heading,
  LINE_HEIGHT_NUDGE,
  nextWordSafeCap,
  Text,
  titleSizeCap,
  wordSafeOnLines,
  wordSafeOnFrame,
  wordSafeStart,
} from '../src/design/text';
import { textStyles } from '../src/design/tokens';

// Android 13's linear native SP conversion. Newer curves have separate tests.
jest.mock('../modules/opax-text-metrics', () => ({
  spToDp: (sp: number, fontScale: number) => sp * fontScale,
  dpToSp: (dp: number, fontScale: number) => dp / fontScale,
}));

test.each(['ios', 'android'] as const)(
  '%s: text keeps its native accessibility element across fitting, layout, size and content changes',
  (os) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    const resize = (width: number, fontScale: number) =>
      act(() =>
        Dimensions.set({
          window: { ...window, width, fontScale },
          screen: { ...screen, width, fontScale },
        }),
      );
    try {
      for (const [variant, iosScale] of [
        ['largeTitle', 60 / 34],
        ['recordHeading', 56 / 22],
        ['body', 53 / 17],
      ] as const) {
        resize(390, 3.571);
        const full = os === 'ios' ? iosScale : 3.571;
        const accessibility = {
          accessible: true,
          accessibilityRole: 'header' as const,
          accessibilityLabel: 'Record heading',
          accessibilityHint: 'The published record',
          accessibilityLanguage: 'en-AU',
        };
        const renderText = (content: string, wordSafe = true) =>
          createElement(Text, { ...accessibility, variant, wordSafe }, content);
        let renderer!: TestRenderer.ReactTestRenderer;
        act(() => {
          renderer = TestRenderer.create(renderText('Representation'));
        });
        const native = renderer.root.findByType(NativeText);
        const base = textStyles[variant].lineHeight + LINE_HEIGHT_NUDGE;
        const layout = (at: number) => ({
          nativeEvent: {
            lines: [
              { text: 'Representatio', width: 198, height: base * at },
              { text: 'n', width: 14, height: base * at },
            ],
          },
        });
        const expectSameElement = () => {
          expect(renderer.root.findByType(NativeText)).toBe(native);
          expect(native.props).toMatchObject(accessibility);
        };
        act(() =>
          native.props.onLayout({
            nativeEvent: {
              layout: { x: 0, y: 0, width: 200, height: base * full * 2 },
            },
          }),
        );
        act(() => native.props.onTextLayout(layout(full)));
        expectSameElement();
        const cappedSize = StyleSheet.flatten(native.props.style).fontSize;
        expect(cappedSize).toBeLessThan(textStyles[variant].fontSize);
        // A delayed full-size event cannot drive another shrink at this cap.
        act(() => native.props.onTextLayout(layout(full)));
        expect(StyleSheet.flatten(native.props.style).fontSize).toBe(
          cappedSize,
        );
        resize(844, 3.571);
        expectSameElement();
        expect(StyleSheet.flatten(native.props.style).fontSize).toBe(
          textStyles[variant].fontSize,
        );
        act(() => renderer.update(renderText('Updated record heading')));
        expectSameElement();
        expect(native.props.children).toBe('Updated record heading');
        resize(390, 1);
        act(() => native.props.onTextLayout(layout(full)));
        expectSameElement();
        expect(StyleSheet.flatten(native.props.style).fontSize).toBe(
          textStyles[variant].fontSize,
        );
        // Enabling fitting after mount must also preserve the element.
        act(() => renderer.update(renderText('Updated record heading', false)));
        expectSameElement();
        act(() => renderer.update(renderText('Updated record heading')));
        expectSameElement();
        act(() => renderer.unmount());
      }
    } finally {
      Object.defineProperty(Platform, 'OS', descriptor);
      act(() => Dimensions.set({ window, screen }));
    }
  },
);

// React Native ceils a text's measured height to the pixel grid and TextKit
// draws into exactly that height. The room left for the last line is the
// distance from the text's height up to the next pixel: zero means floating-
// point noise decides whether the last line is drawn (review round 2, the
// AX5 lead title).
function slack(
  lines: number,
  lineHeight: number,
  multiplier: number,
  scale: number,
) {
  const height = lines * lineHeight * multiplier;
  return Math.ceil(height * scale - 1e-9) / scale - height;
}

describe('text heights never land exactly on the pixel grid', () => {
  test('the device case: six 24pt subheading lines at AX5 on a 3x screen', () => {
    // Measured on the 17 Pro (iOS 26.5) at AX5: 62.22pt lines, 373.33pt frame.
    const multiplier = 62.2222222 / 24;
    expect(slack(6, 24, 70 / 27, 3)).toBeLessThan(1e-9);
    expect(Math.round(6 * 24 * multiplier * 3)).toBe(1120);
    expect(slack(6, 24 + LINE_HEIGHT_NUDGE, 70 / 27, 3)).toBeGreaterThan(0.01);
  });
  test('every role, 2x and 3x, every ratio of whole point sizes, up to 200 lines', () => {
    // UIFontMetrics multipliers are ratios of the whole-point Dynamic Type
    // sizes (the device case is 70/27). With a 1/997 nudge, a total can only
    // land on the grid when 997 divides the line count, so never below 997.
    const multipliers = new Set<number>();
    for (let q = 1; q <= 60; q++)
      for (let p = 1; p <= 4 * q; p++)
        if (p / q >= 0.8 && p / q <= 3.7) multipliers.add(p / q);
    let worst = Infinity;
    for (const role of Object.values(textStyles))
      for (const scale of [2, 3])
        for (const multiplier of multipliers)
          for (let lines = 1; lines <= 200; lines++)
            worst = Math.min(
              worst,
              slack(
                lines,
                role.lineHeight + LINE_HEIGHT_NUDGE,
                multiplier,
                scale,
              ),
            );
    // Far above floating-point noise (about 1e-13 at these sizes).
    expect(worst).toBeGreaterThan(1e-6);
  });
  test('the nudge is invisible: under a hundredth of a point per line at AX5', () => {
    expect(LINE_HEIGHT_NUDGE * 3.6).toBeLessThan(0.01);
  });
});

// Host CoreText measurements, 8 November 2026, SF system weights and the
// bundled Merriweather Bold. Two sizes measured independently because SF's
// optical sizing is not linear. These are host regression fixtures, not iOS
// capture evidence. The orchestrator owns the Large/AX5 D1 capture sweep.
// Screen, role, longest run, Large width, AX5 width, effective AX5 font size.
const measuredWords = [
  ['Today', 'sectionTitle', 'Following', 98.27, 246.76, 56],
  ['Profile', 'pageTitle', 'Parliamentarian', 205.75, 418.56, 58],
  ['Bill', 'recordTitle', 'Appropriation', 195.03, 299.52, 43],
  ['Search results', 'rowRecord', 'Parliamentary', 121.24, 378, 53],
  ['Your MP', 'name', 'Representatives', 128.76, 383.42, 53],
  ['Source sheet', 'footnote', 'Parliamentary', 83.1, 255.58, 44],
  ['Filter sheet', 'groupHeader', 'Parliament', 64.09, 197.23, 44],
  ['Welcome', 'largeTitle', 'parliament', 169.86, 295.65, 60],
  ['Account', 'body', 'Conversations', 108.61, 323.36, 53],
  ['Division', 'strong', 'Representatives', 128.76, 383.42, 53],
  ['Today serif', 'sectionTitle', 'Following', 107.05, 272.5, 56],
  ['Profile serif', 'pageTitle', 'Parliamentarian', 226.81, 469.83, 58],
  ['Welcome serif', 'largeTitle', 'parliament', 186.52, 329.16, 60],
] as const;

test.each(measuredWords)(
  '%s: measured word-safe widths with new metrics',
  (_, variant, word, largeWidth, axWidth, axSize) => {
    const role = textStyles[variant];
    expect(largeWidth).toBeLessThan(358); // 390pt screen, 16pt margins.
    expect(axWidth).toBeGreaterThan(largeWidth);
    const full = axSize / role.fontSize;
    // Feed a measured mid-word break at the new role's actual line height.
    // A column just narrower than the native AX5 run must step down, while
    // the Large-size rendering keeps its full default size.
    const base = role.lineHeight + LINE_HEIGHT_NUDGE;
    let state = wordSafeStart(word, full);
    state = wordSafeOnFrame(state, state, axWidth - 1);
    const broken = (at: number) => [
      { text: word.slice(0, -1), width: axWidth - 2, height: base * at },
      { text: word.slice(-1), width: 2, height: base * at },
    ];
    expect(wordSafeOnLines(state, state, broken(1), word, base)).toBe(state);
    let at = full;
    while ((axWidth * at) / full > axWidth - 1 && at > 1) {
      const next = nextWordSafeCap(base * at, base)!;
      state = wordSafeOnLines(state, state, broken(at), word, base);
      expect(state.cap).toBe(next);
      expect(state.cap).toBeGreaterThanOrEqual(1);
      at = state.cap;
    }
    expect((axWidth * at) / full).toBeLessThanOrEqual(axWidth - 1);
  },
);

test('record titles cap at the title1 AX2 size; other roles stay uncapped', () => {
  expect(titleSizeCap('recordTitle', 3.571, 'ios')).toBeCloseTo(43 / 58);
  expect(titleSizeCap('recordTitle', 3.571, 'ios')).toBeCloseTo(43 / 58);
  expect(titleSizeCap('recordTitle', 3.571, 'ios')).toBeCloseTo(43 / 58);
  expect(titleSizeCap('recordTitle', 2.143, 'ios')).toBe(1);
  expect(titleSizeCap('recordTitle', 3.571, 'android')).toBeCloseTo(
    43 / 28 / 3.571,
  );
  for (const variant of [
    'pageTitle',
    'recordHeading',
    'sectionTitle',
    'largeTitle',
    'body',
  ] as const)
    expect(titleSizeCap(variant, 3.571, 'ios')).toBe(1);
});

test.each(['ios', 'android'] as const)(
  '%s: only record title roles and their aliases request push-out line breaking',
  (os) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    try {
      for (const variant of Object.keys(
        textStyles,
      ) as (keyof typeof textStyles)[]) {
        let renderer!: TestRenderer.ReactTestRenderer;
        act(() => {
          renderer = TestRenderer.create(
            createElement(
              Text,
              { variant },
              'Interactive Gambling (Cost Recovery Levy) Bill 2026',
            ),
          );
        });
        const title = [
          'recordTitle',
          'recordHeading',
          'title',
          'recordTitle',
        ].includes(variant);
        expect(
          renderer.root.findByType(NativeText).props.lineBreakStrategyIOS,
        ).toBe(os === 'ios' && title ? 'push-out' : undefined);
        // push-out does not move a Latin word, so record titles bind their
        // short last word on every platform; other roles draw as given.
        expect(renderer.root.findByType(NativeText).props.children).toBe(
          title
            ? 'Interactive Gambling (Cost Recovery Levy\u2060) Bill\u00A02026'
            : 'Interactive Gambling (Cost Recovery Levy) Bill 2026',
        );
        act(() => renderer.unmount());
      }
    } finally {
      Object.defineProperty(Platform, 'OS', descriptor);
    }
  },
);

test.each(['recordTitle', 'recordHeading', 'rowRecord', 'recordText'] as const)(
  '%s: Merriweather leading stays at least 1.28 times the size',
  (variant) => {
    const role = textStyles[variant];
    expect(role.lineHeight / role.fontSize).toBeGreaterThanOrEqual(1.28);
  },
);

test('Heading chooses record, long record, page and section roles with the header trait', () => {
  for (const [props, variant] of [
    [{ level: 1 }, 'recordTitle'],
    [{ level: 1, long: true }, 'recordHeading'],
    [{ level: 1, kind: 'page' }, 'pageTitle'],
    [{ level: 2 }, 'sectionTitle'],
    [{ level: 3 }, 'subsectionTitle'],
  ] as const) {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        createElement(Heading, props, 'Parliament'),
      );
    });
    const node = renderer.root.findByType(NativeText);
    expect(node.props.dynamicTypeRamp).toBe(
      textStyles[variant].dynamicTypeRamp,
    );
    expect(node.props.accessibilityRole).toBe('header');
    expect(StyleSheet.flatten(node.props.style).fontSize).toBe(
      textStyles[variant].fontSize,
    );
    act(() => renderer.unmount());
  }
});
test('new interface text omits fontFamily, uses explicit weight, and links render navy', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      createElement(Text, { variant: 'strong', tone: 'link' }, 'Open'),
    );
  });
  const style = StyleSheet.flatten(
    renderer.root.findByType(NativeText).props.style,
  );
  expect(style).not.toHaveProperty('fontFamily');
  expect(style.fontWeight).toBe('600');
  act(() => renderer.unmount());
});

test('iOS citation code uses the requested monospace face and keeps Dynamic Type', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      createElement(
        Text,
        { monospace: true },
        '@misc{fixture,\n  title = {Fixture record}\n}',
      ),
    );
  });
  const native = renderer.root.findByType(NativeText);
  expect(StyleSheet.flatten(native.props.style).fontFamily).toBe('Menlo');
  expect(native.props.allowFontScaling).toBe(true);
  expect(native.props.maxFontSizeMultiplier).toBe(0);
  act(() => renderer.unmount());
});

test('Bold Text leaves SF native and steps only the bundled record face', () => {
  const bold = jest.spyOn(accessibility, 'useBoldText').mockReturnValue(true);
  try {
    for (const variant of ['strong', 'recordText'] as const) {
      let renderer!: TestRenderer.ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          createElement(Text, { variant }, 'Parliament'),
        );
      });
      const style = StyleSheet.flatten(
        renderer.root.findByType(NativeText).props.style,
      );
      if (variant === 'strong') {
        expect(style).not.toHaveProperty('fontFamily');
        expect(style.fontWeight).toBe('600');
      } else {
        expect(style.fontFamily).toBe('Merriweather-Bold');
        expect(style.fontWeight).toBe('700');
      }
      act(() => renderer.unmount());
    }
  } finally {
    bold.mockRestore();
  }
});
