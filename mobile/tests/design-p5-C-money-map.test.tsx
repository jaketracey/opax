import { act } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';
import { apiClient } from '../src/api/runtime';
import MoneyScreen from '../src/features/money/MoneyScreen';
import { NativeMoneyMap } from '../src/features/money/NativeMoneyMap';
import { decodeMoneyGraph } from '../src/features/money/data';
import { defaultMoneyFilters, moneyView } from '../src/features/money/view';
import { Button, SegmentedControl } from '../src/design/primitives';
import { pinned } from './pinned';

// Design programme pass 5 (docs/design/review-2026-10/pass5-app-critique.md):
// P3-15, at accessibility sizes the map's meta line follows the scene so the
// map starts on the first screen; P3-17, on a regular-width window "Fit map"
// sits at the scene's top right, not in the far corner under it.
let mockAccessibilitySize = false;
let mockRegular = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useAccessibilitySize: () => mockAccessibilitySize,
  useReduceMotionSetting: () => true,
}));
jest.mock('../src/design/adaptive', () => {
  const actual = jest.requireActual('../src/design/adaptive');
  return {
    ...actual,
    useLayout: () => ({
      ...actual.useLayout(),
      regular: mockRegular,
      size: mockRegular ? 'regular' : 'compact',
      window: { width: mockRegular ? 1180 : 402, height: 900 },
    }),
  };
});
jest.mock('../src/api/runtime', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('expo-gl', () => ({
  GLView: jest.requireActual('react-native').View,
}));
jest.mock('../src/features/money/NativeMoneyScene', () => ({
  NativeMoneyScene: jest.fn().mockImplementation(() => ({
    render: jest.fn(),
    endFrame: jest.fn(),
    verifyPixels: jest.fn(() => 100),
    diagnostics: () => ({ completedFrames: 0 }),
    labels: () => [],
    dispose: jest.fn(),
    setView: jest.fn(),
    setReducedMotion: jest.fn(),
    resize: jest.fn(),
    orbit: jest.fn(),
    zoom: jest.fn(),
    focus: jest.fn(),
    pick: () => null,
  })),
}));
jest.mock('react-native-gesture-handler', () => {
  const chain = () => {
    const value: Record<string, unknown> = {};
    for (const name of [
      'maxPointers',
      'runOnJS',
      'activeOffsetX',
      'failOffsetY',
      'onBegin',
      'onUpdate',
      'onEnd',
      'onFinalize',
    ])
      value[name] = () => value;
    return value;
  };
  return {
    GestureHandlerRootView: jest.requireActual('react-native').View,
    GestureDetector: jest.requireActual('react-native').View,
    Gesture: {
      Pan: chain,
      Tap: chain,
      Pinch: chain,
      Race: chain,
      Simultaneous: chain,
    },
  };
});
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (callback: () => () => void) =>
    jest.requireActual('react').useEffect(() => callback(), [callback]),
}));
jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
jest
  .spyOn(AccessibilityInfo, 'addEventListener')
  .mockImplementation(() => ({ remove: jest.fn() }));

async function render(element: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  return r;
}
const index = (
  root: ReactTestInstance,
  match: (n: ReactTestInstance) => boolean,
) => root.findAll(() => true).findIndex(match);
beforeEach(() => {
  mockAccessibilitySize = false;
  mockRegular = false;
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decode(pinned(path)),
    stale: false,
    asOf: '2026-09-21',
    savedAt: 1,
  }));
});

describe('P3-15: the map’s meta line at accessibility sizes', () => {
  const order = async () => {
    const r = await render(<MoneyScreen />);
    // The 3D map, as a sighted reader without VoiceOver gets it.
    await act(async () =>
      r.root.findByType(SegmentedControl).props.onChange('3d'),
    );
    const summary = index(
      r.root,
      (n) =>
        typeof n.type === 'string' && n.props.testID === 'money-view-summary',
    );
    const map = index(r.root, (n) => n.type === NativeMoneyMap);
    await act(async () => r.unmount());
    return { summary, map };
  };
  test('at standard sizes it leads the map', async () => {
    const { summary, map } = await order();
    expect(summary).toBeGreaterThanOrEqual(0);
    expect(map).toBeGreaterThan(summary);
  });
  test('at accessibility sizes it follows the map', async () => {
    mockAccessibilitySize = true;
    const { summary, map } = await order();
    expect(map).toBeGreaterThanOrEqual(0);
    expect(summary).toBeGreaterThan(map);
  });
});

describe('P3-17: "Fit map" beside the scene', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  const view = moneyView(graph, defaultMoneyFilters(graph));
  const map = () => (
    <NativeMoneyMap graph={graph} view={view} active onSelect={jest.fn()} />
  );
  test('on a regular-width window it is anchored to the scene’s top right', async () => {
    mockRegular = true;
    const r = await render(map());
    const anchor = r.root.find(
      (n) =>
        typeof n.type === 'string' && n.props.testID === 'money-fit-anchor',
    );
    expect(anchor.findAllByType(Button)).toHaveLength(1);
    expect(anchor.findByType(Button).props.label).toBe('Fit map');
    const style = Object.assign({}, ...[anchor.props.style].flat());
    expect(style).toMatchObject({
      position: 'absolute',
      right: expect.any(Number),
      top: expect.any(Number),
    });
    // The scene's gestures never hold the button: it is the canvas's sibling.
    const canvas = r.root.find(
      (n) =>
        typeof n.type === 'string' && n.props.testID === 'money-map-canvas',
    );
    expect(canvas.findAll((n) => n === anchor)).toHaveLength(0);
    expect(r.root.findAllByType(Button)).toHaveLength(1);
    await act(async () => r.unmount());
  });
  test('on an iPhone it stays under the scene', async () => {
    const r = await render(map());
    expect(
      r.root.findAll((n) => n.props.testID === 'money-fit-anchor'),
    ).toHaveLength(0);
    expect(r.root.findAllByType(Button).map((b) => b.props.label)).toEqual([
      'Fit map',
    ]);
    await act(async () => r.unmount());
  });
});
