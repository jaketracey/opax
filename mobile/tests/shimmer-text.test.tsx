import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Platform, Text as NativeText } from 'react-native';
import * as Native from 'react-native';
import { matchFont, useFont } from '@shopify/react-native-skia';
import * as Reanimated from 'react-native-reanimated';
import { ShimmerText } from '../src/design/ShimmerText';
import { useReduceMotionSetting } from '../src/design/accessibility';
import { motion } from '../src/design/tokens';
import { paletteFor } from '../src/design/palette';

jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: jest.fn(() => false),
  useBoldText: () => false,
  useIncreaseContrast: () => false,
  useHighTextContrast: () => false,
}));
jest.mock('@shopify/react-native-skia', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  const node = (testID: string) => {
    const Node = (props: object) =>
      React.createElement(View, { ...props, testID });
    Node.displayName = testID;
    return Node;
  };
  return {
    Canvas: node('skia-canvas'),
    Text: node('skia-text'),
    LinearGradient: node('skia-gradient'),
    matchFont: jest.fn(() => ({ type: 'system' })),
    useFont: jest.fn(() => ({ type: 'bundled' })),
  };
});

let view: ReactTestRenderer;
beforeEach(() => {
  jest.mocked(useReduceMotionSetting).mockReturnValue(false);
  jest.mocked(matchFont).mockClear();
  jest.mocked(useFont).mockClear();
});
afterEach(() => act(() => view?.unmount()));
function draw() {
  act(() => {
    view = create(
      <ShimmerText text={'Checking records: <Greens>'} testID="status" />,
    );
  });
}
function measure() {
  const text = view.root.findByType(NativeText);
  act(() =>
    text.props.onTextLayout({
      nativeEvent: {
        lines: [
          {
            text: 'Checking records:',
            x: 0,
            y: 0,
            width: 140,
            height: 20,
            ascender: 15,
            descender: 4,
            capHeight: 11,
            xHeight: 8,
          },
          {
            text: '<Greens>',
            x: 0,
            y: 20,
            width: 75,
            height: 20,
            ascender: 15,
            descender: 4,
            capHeight: 11,
            xHeight: 8,
          },
        ],
      },
    }),
  );
}

test.each(['ios', 'android'] as const)(
  '%s retains native text and overlays a glyph gradient with a 1.6 second sweep and pause',
  (os) => {
    const platform = jest.replaceProperty(Platform, 'OS', os);
    const timing = jest.spyOn(Reanimated, 'withTiming');
    const cancel = jest.spyOn(Reanimated, 'cancelAnimation');
    try {
      draw();
      expect(view.root.findByType(NativeText).props.children).toBe(
        'Checking records: <Greens>',
      );
      expect(view.root.findAllByProps({ testID: 'shimmer-highlight' })).toEqual(
        [],
      );
      measure();
      const glyphs = view.root.findAll(
        (n) => n.props.testID === 'skia-text' && typeof n.type === 'string',
      );
      expect(glyphs.map((g) => [g.props.text, g.props.x, g.props.y])).toEqual([
        ['Checking records:', 0, 15],
        ['<Greens>', 0, 35],
      ]);
      expect(
        view.root.findAllByProps({ testID: 'skia-gradient' }).length,
      ).toBeGreaterThan(0);
      expect(timing).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ duration: 1600 }),
      );
      if (os === 'ios')
        expect(matchFont).toHaveBeenCalledWith(
          expect.objectContaining({ fontFamily: 'System' }),
        );
      else
        expect(useFont).toHaveBeenCalledWith(
          expect.anything(),
          expect.any(Number),
        );
      jest.mocked(useReduceMotionSetting).mockReturnValue(true);
      act(() =>
        view.update(<ShimmerText text="Writing the answer" testID="status" />),
      );
      expect(view.root.findByType(NativeText).props.children).toBe(
        'Writing the answer',
      );
      expect(view.root.findAllByProps({ testID: 'shimmer-highlight' })).toEqual(
        [],
      );
      expect(cancel).toHaveBeenCalled();
      expect(motion.duration.standard).toBe(200);
    } finally {
      timing.mockRestore();
      cancel.mockRestore();
      platform.restore();
    }
  },
);

test.each([true, null])(
  'Reduce Motion setting %s keeps static secondary text even after measurement',
  (setting) => {
    jest.mocked(useReduceMotionSetting).mockReturnValue(setting);
    draw();
    measure();
    expect(view.root.findAllByProps({ testID: 'shimmer-highlight' })).toEqual(
      [],
    );
    expect(matchFont).not.toHaveBeenCalled();
    expect(view.root.findByType(NativeText).props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: expect.anything() }),
      ]),
    );
  },
);

test.each(['light', 'dark'] as const)(
  '%s highlight uses the appearance tokens',
  (scheme) => {
    const appearance = jest
      .spyOn(Native, 'useColorScheme')
      .mockReturnValue(scheme);
    try {
      draw();
      measure();
      const gradient = view.root.findAllByProps({
        testID: 'skia-gradient',
      })[0]!;
      expect(gradient.props.colors).toEqual([
        `${paletteFor(scheme).ink}00`,
        `${paletteFor(scheme).ink}99`,
        `${paletteFor(scheme).ink}00`,
      ]);
    } finally {
      appearance.mockRestore();
    }
  },
);
