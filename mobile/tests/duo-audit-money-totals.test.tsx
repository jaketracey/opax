import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { rhythm } from '../src/design/tokens';
import { MoneyMapPanel } from '../src/features/money/map/MoneyMapPanel';

/**
 * iPhone Duo audit (im-duo-audit, 13 Nov): on the folded outer display at
 * AX5 the money map's resting totals clipped to "$1.2b" and "$305." (capture
 * duo-outer-ax5 a5-16-money). Each compact figure is one word that cannot
 * wrap, and both kept a 120pt share of one row. The row is a wrapping flex
 * row, so two totals share it only while their bases and the gap fit.
 */

let mockFontScale = 1;
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: { value: { ...actual.Platform, OS: 'ios', isPad: false } },
    useWindowDimensions: {
      value: () => ({
        width: 466,
        height: 678,
        scale: 3,
        fontScale: mockFontScale,
      }),
    },
  });
});
jest.mock('react-native-gesture-handler', () =>
  jest.requireActual('./gesture-mock'),
);
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated/mock');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    ...actual,
    useSharedValue: <T,>(initial: T) => {
      const ref = React.useRef({ value: initial });
      return ref.current;
    },
  };
});
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Native =
    jest.requireActual<typeof import('react-native')>('react-native');
  const Wrap = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(Native.View, props, children);
  return {
    Link: Object.assign(Wrap, {
      Trigger: Wrap,
      Preview: () => null,
      Menu: Wrap,
      MenuAction: Wrap,
    }),
    router: { push: jest.fn() },
    useRouter: () => ({ push: jest.fn() }),
    useNavigation: () => ({ setOptions: jest.fn() }),
    useSegments: () => [],
    useLocalSearchParams: () => ({}),
  };
});

/** The folded display's panel: 466pt less the 80pt rail. */
const FOLDED_PANEL = 466 - 80;

function bases(fontScale: number) {
  mockFontScale = fontScale;
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <MoneyMapPanel
        focus={null}
        totals={{ donations: 1.2e9, publicMoney: 305.9e9 }}
        caption="Recorded flows"
        legend={null}
        sourceLine={null}
        stageHeight={400}
        expanded={false}
        onExpanded={jest.fn()}
        onClear={jest.fn()}
        onPeekHeight={jest.fn()}
      />,
    );
  });
  const basisOf = (testID: string) =>
    StyleSheet.flatten(
      tree.root.find(
        (node) => typeof node.type === 'string' && node.props.testID === testID,
      ).props.style,
    ).flexBasis as number;
  const result = [
    basisOf('money-map-total-donations'),
    basisOf('money-map-total-public'),
  ];
  act(() => tree.unmount());
  return result;
}
const shareARow = ([a, b]: number[]) => a! + rhythm.block + b! <= FOLDED_PANEL;

afterEach(() => {
  mockFontScale = 1;
});

test('at the default size both totals share the resting row, as before', () => {
  const both = bases(1);
  // The default-size share is unchanged.
  expect(both).toEqual([120, 120]);
  expect(shareARow(both)).toBe(true);
});

test.each([
  ['AX3', 2.35],
  ['AX5', 3.12],
])(
  'at %s on the folded display each total takes its own line instead of clipping',
  (_name, fontScale) => {
    expect(shareARow(bases(fontScale))).toBe(false);
  },
);
