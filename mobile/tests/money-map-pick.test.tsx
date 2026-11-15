import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { decodeMoneyGraph } from '../src/features/money/data';
import { layoutFor } from '../src/features/money/map/layout';
import { MoneyMap } from '../src/features/money/map/MoneyMap';
import { MoneyMapLabels } from '../src/features/money/map/MoneyMapLabels';
import { buildModel } from '../src/features/money/map/model';
import { defaultMoneyFilters, moneyView } from '../src/features/money/view';
import { pinned } from './pinned';

// The layout settles when the test says so, not by the clock.
const mockSettlers: (() => void)[] = [];
jest.mock('../src/features/money/map/settle', () => ({
  settleLayout: (_layout: unknown, onSettled: () => void) => {
    mockSettlers.push(onSettled);
    return () => undefined;
  },
}));
// The tap gesture's handler, taken as the map builds it.
const mockTaps: { handlers: Record<string, (e: unknown) => void> }[] = [];
jest.mock('react-native-gesture-handler', () => {
  const actual = jest.requireActual('./gesture-mock');
  return {
    ...actual,
    Gesture: {
      ...actual.Gesture,
      Tap: () => {
        const tap = actual.Gesture.Tap();
        mockTaps.push(tap);
        return tap;
      },
    },
  };
});
jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
jest.mock('../src/features/money/money-probe', () => ({
  MoneyTestHooks: () => null,
  useMoneyMapPerf: () => null,
  useMoneyMapProbe: () => undefined,
}));

const graph = decodeMoneyGraph(pinned('/graph/money.json'));
const view = moneyView(graph, defaultMoneyFilters(graph));
const model = buildModel(view);

async function mount(onFocus: (id: string | null) => void) {
  mockSettlers.length = 0;
  mockTaps.length = 0;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <MoneyMap
        graph={graph}
        model={model}
        focus={null}
        onFocus={onFocus}
        insets={{ top: 100, bottom: 100, left: 8, right: 8 }}
        cacheKey="federal"
        accessibilityLabel="Money map"
      />,
    );
  });
  act(() =>
    tree.root
      .findByProps({ testID: 'money-map-stage' })
      .props.onLayout({ nativeEvent: { layout: { width: 380, height: 700 } } }),
  );
  return tree;
}

/** Where a disc is on screen at the camera the map is at. */
function discPoint(tree: TestRenderer.ReactTestRenderer) {
  const { tx, ty, k } = tree.root.findByType(MoneyMapLabels).props;
  const node = model.nodes[0]!;
  const layout = layoutFor(graph, 380 / (700 - 200));
  const li = graph.nodes.findIndex((n) => n.id === node.id);
  return {
    id: node.id,
    x: layout.x[li]! * k.get() + tx.get(),
    y: layout.y[li]! * k.get() + ty.get(),
  };
}

const tapAt = async (x: number, y: number) => {
  mockTaps.at(-1)!.handlers.onEnd!({ x, y });
  // The router waits out a second tap before it decides this was one.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
};

test('a tap before the layout has settled does nothing; after it, the same tap focuses the disc', async () => {
  const onFocus = jest.fn();
  const tree = await mount(onFocus);
  expect(mockSettlers.length).toBeGreaterThan(0);
  const point = discPoint(tree);
  await tapAt(point.x, point.y);
  expect(onFocus).not.toHaveBeenCalled();
  // The layout settles: the map is drawn, and the same tap now lands.
  await act(async () => mockSettlers.forEach((settled) => settled()));
  const settledPoint = discPoint(tree);
  await tapAt(settledPoint.x, settledPoint.y);
  expect(onFocus).toHaveBeenCalledTimes(1);
  expect(onFocus.mock.calls[0]![0]).not.toBeNull();
  await act(async () => tree.unmount());
});
