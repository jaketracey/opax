import { render } from '@testing-library/react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Platform, StyleSheet, Text as NativeText } from 'react-native';
import * as Native from 'react-native';
import {
  Text as SkiaText,
  matchFont,
  useFont,
} from '@shopify/react-native-skia';
import * as Reanimated from 'react-native-reanimated';
import { ShimmerText } from '../src/design/ShimmerText';
import {
  useBoldText,
  useHighTextContrast,
  useIncreaseContrast,
  useReduceMotionSetting,
} from '../src/design/accessibility';
import { contrastRatio } from '../src/design/contrast';
import {
  darkHighContrast,
  lightHighContrast,
  paletteFor,
} from '../src/design/palette';
import { textContent } from '../src/design/text';
import { motion } from '../src/design/tokens';
import { AskStatus } from '../src/features/ask/AskStatus';

jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: jest.fn(() => false),
  useBoldText: jest.fn(() => false),
  useIncreaseContrast: jest.fn(() => false),
  useHighTextContrast: jest.fn(() => false),
}));
jest.mock('@shopify/react-native-skia', () => ({
  Text: jest.fn(() => null),
  // Deliberately incompatible with the mocked native line widths.
  matchFont: jest.fn(() => ({ measureText: () => ({ width: 999 }) })),
  useFont: jest.fn(() => ({ measureText: () => ({ width: 999 }) })),
}));

const label = 'Reading your question';
let view: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useReduceMotionSetting).mockReturnValue(false);
  jest.mocked(useBoldText).mockReturnValue(false);
  jest.mocked(useIncreaseContrast).mockReturnValue(false);
  jest.mocked(useHighTextContrast).mockReturnValue(false);
  jest.spyOn(Native, 'useColorScheme').mockReturnValue('light');
  jest
    .spyOn(Reanimated, 'interpolateColor')
    .mockImplementation((_value, _range, colors) => colors[0]!);
});
afterEach(() => {
  act(() => view?.unmount());
  jest.restoreAllMocks();
});
function draw(text = label) {
  act(() => {
    view = create(<ShimmerText text={text} testID="status" />);
  });
}
function nativeLabel() {
  return view.root
    .findAllByType(NativeText)
    .find((node) => node.props.testID === 'status')!;
}
function measure(fontScale = 1) {
  act(() =>
    nativeLabel().props.onTextLayout({
      nativeEvent: {
        lines: ['Reading your', 'question'].map((text, i) => ({
          text,
          x: i * 0.3,
          y: i * 20 * fontScale,
          width: (i ? 75.25 : 140.1) * fontScale,
          height: 20 * fontScale,
          ascender: 15 * fontScale,
          descender: 4 * fontScale,
          capHeight: 11 * fontScale,
          xHeight: 8 * fontScale,
        })),
      },
    }),
  );
}

// Include both ends of Dynamic Type and the intermediate accessibility sizes.
const sizes = [
  0.82, 0.88, 0.95, 1, 1.12, 1.23, 1.35, 1.64, 1.95, 2.35, 2.76, 3.12,
];
describe.each(['ios', 'android'] as const)(
  '%s native glyph ownership',
  (os) => {
    beforeEach(() => jest.replaceProperty(Platform, 'OS', os));
    test.each(sizes)(
      'no second glyph drawing at font scale %s, with Bold Text and contrast toggles',
      (fontScale) => {
        const dimensions = Native.Dimensions.get('window');
        jest
          .spyOn(Native, 'useWindowDimensions')
          .mockReturnValue({ ...dimensions, fontScale });
        draw();
        for (const bold of [false, true]) {
          for (const contrast of [false, true]) {
            jest.mocked(useBoldText).mockReturnValue(bold);
            jest.mocked(useIncreaseContrast).mockReturnValue(contrast);
            jest
              .mocked(useHighTextContrast)
              .mockReturnValue(contrast && os === 'android');
            act(() =>
              view.update(<ShimmerText text={label} testID="status" />),
            );
            measure(fontScale);
            expect(textContent(nativeLabel().props.children)).toBe(label);
            expect(nativeLabel().props).toMatchObject({
              allowFontScaling: true,
              maxFontSizeMultiplier: 0,
            });
            // Only one native span owns the actual string, regardless of metrics.
            expect(
              view.root.findAll(
                (node) =>
                  typeof node.type === 'string' &&
                  node.children.includes(label),
              ),
            ).toHaveLength(1);
            expect(SkiaText).not.toHaveBeenCalled();
            expect(matchFont).not.toHaveBeenCalled();
            expect(useFont).not.toHaveBeenCalled();
            expect(
              view.root.findAllByProps({ testID: 'shimmer-highlight' }),
            ).toEqual([]);
            const inline = view.root
              .findAllByType(NativeText)
              .find((node) => node.props.accessible === false)!;
            expect(Object.keys(StyleSheet.flatten(inline.props.style))).toEqual(
              ['color'],
            );
          }
        }
      },
    );
  },
);

test('native colour pulse repeats, then stops when Reduce Motion is enabled', () => {
  const timing = jest.spyOn(Reanimated, 'withTiming');
  const repeat = jest.spyOn(Reanimated, 'withRepeat');
  const cancel = jest.spyOn(Reanimated, 'cancelAnimation');
  draw();
  expect(timing).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ duration: 800 }),
  );
  expect(timing).toHaveBeenCalledWith(
    0,
    expect.objectContaining({ duration: 800 }),
  );
  expect(repeat).toHaveBeenCalledWith(expect.anything(), -1, false);
  jest.mocked(useReduceMotionSetting).mockReturnValue(true);
  act(() =>
    view.update(<ShimmerText text="Writing the answer" testID="status" />),
  );
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(nativeLabel().props.children).toBe('Writing the answer');
  expect(view.root.findAllByType(NativeText)).toHaveLength(1);
  expect(motion.duration.standard).toBe(200);
});

test.each([true, null])(
  'Reduce Motion %s has no pulse or glyph highlight',
  (setting) => {
    jest.mocked(useReduceMotionSetting).mockReturnValue(setting);
    const timing = jest.spyOn(Reanimated, 'withTiming');
    draw();
    measure();
    expect(timing).not.toHaveBeenCalled();
    expect(Reanimated.interpolateColor).not.toHaveBeenCalled();
    expect(view.root.findAllByType(NativeText)).toHaveLength(1);
    expect(nativeLabel().props.children).toBe(label);
    expect(nativeLabel().props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: expect.anything() }),
      ]),
    );
    expect(SkiaText).not.toHaveBeenCalled();
  },
);

test('unmount cancels the native pulse', () => {
  const cancel = jest.spyOn(Reanimated, 'cancelAnimation');
  draw();
  act(() => view.unmount());
  expect(cancel).toHaveBeenCalledTimes(1);
});

test.each(['light', 'dark'] as const)(
  '%s pulse never weakens secondary contrast',
  (scheme) => {
    jest.mocked(Native.useColorScheme).mockReturnValue(scheme);
    const palette = paletteFor(scheme);
    const strong = scheme === 'dark' ? darkHighContrast : lightHighContrast;
    draw();
    for (const contrast of [false, true]) {
      jest.mocked(useIncreaseContrast).mockReturnValue(contrast);
      act(() => view.update(<ShimmerText text={label} testID="status" />));
      const secondary =
        (contrast ? strong.inkSoft : undefined) ?? palette.inkSoft;
      const ink = (contrast ? strong.ink : undefined) ?? palette.ink;
      expect(Reanimated.interpolateColor).toHaveBeenLastCalledWith(
        0,
        [0, 1],
        [secondary, ink],
      );
      // RGB interpolation stays between these endpoints in every channel.
      for (let i = 0; i <= 10; i++) {
        const colour =
          '#' +
          [1, 3, 5]
            .map((at) => {
              const start = parseInt(secondary.slice(at, at + 2), 16);
              const end = parseInt(ink.slice(at, at + 2), 16);
              return Math.round(start + ((end - start) * i) / 10)
                .toString(16)
                .padStart(2, '0');
            })
            .join('');
        for (const surface of [palette.paper, palette.raised, palette.sunken])
          expect(contrastRatio(colour, surface)).toBeGreaterThanOrEqual(
            contrastRatio(secondary, surface),
          );
      }
    }
  },
);

test.each([false, true, null])(
  'VoiceOver reads the label once with Reduce Motion %s',
  (setting) => {
    jest.mocked(useReduceMotionSetting).mockReturnValue(setting);
    const screen = render(<ShimmerText text={label} testID="status" />);
    expect(screen.getAllByLabelText(label)).toHaveLength(1);
    expect(screen.getByTestId('status').props.accessible).toBe(true);
    screen.unmount();
  },
);

test('Ask exposes one status label, including while outgoing text is present', () => {
  jest.useFakeTimers();
  try {
    const screen = render(
      <AskStatus
        stage="Reading your question"
        steps={[]}
        announcement={label}
      />,
    );
    screen.rerender(
      <AskStatus stage="Writing the answer" steps={[]} announcement={label} />,
    );
    act(() => jest.advanceTimersByTime(600));
    expect(screen.getAllByLabelText(label)).toHaveLength(1);
    expect(screen.getByTestId('ask-status-row').props.accessible).toBe(true);
    expect(
      screen.getByTestId('ask-status-outgoing', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    screen.unmount();
  } finally {
    jest.useRealTimers();
  }
});
