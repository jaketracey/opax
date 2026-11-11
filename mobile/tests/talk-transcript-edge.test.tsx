import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { Stop } from 'react-native-svg';
import { TranscriptEdge } from '../src/features/talk/TranscriptEdge';
import { colors } from '../src/design/tokens';
import { paletteFor } from '../src/design/palette';

let mockScheme: 'light' | 'dark' = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: () => mockScheme,
}));
afterEach(() => jest.restoreAllMocks());

test.each(['light', 'dark'] as const)(
  'fades in the %s screen background token',
  async (scheme) => {
    mockScheme = scheme;
    jest
      .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
      .mockResolvedValue(false);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<TranscriptEdge />);
    });
    const stops = renderer.root.findAllByType(Stop);
    expect(stops.map((stop) => stop.props.stopColor)).toEqual([
      paletteFor(scheme).paper,
      paletteFor(scheme).paper,
    ]);
    expect(stops.map((stop) => stop.props.stopOpacity)).toEqual([1, 0]);
  },
);

test('a newer Reduce Transparency event wins over a delayed initial read and falls back to a solid band', async () => {
  let complete!: (value: boolean) => void;
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  let change!: (value: boolean) => void;
  const remove = jest.fn();
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((name, listener) => {
      if (name === 'reduceTransparencyChanged')
        change = listener as (value: boolean) => void;
      return { remove };
    });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<TranscriptEdge />);
  });
  act(() => change(true));
  await act(async () => {
    complete(false);
  });
  expect(renderer.root.findAllByType(Stop)).toHaveLength(0);
  const edge = renderer.root.find(
    (node) =>
      typeof node.type === 'string' &&
      node.props.testID === 'talk-transcript-edge',
  );
  expect(StyleSheet.flatten(edge.props.style).backgroundColor).toBe(
    colors.paper,
  );
  expect(edge.props.pointerEvents).toBe('none');
  expect(edge.props.accessibilityElementsHidden).toBe(true);
  act(() => change(false));
  expect(renderer.root.findAllByType(Stop)).toHaveLength(2);
  act(() => renderer.unmount());
  expect(remove).toHaveBeenCalled();
});
