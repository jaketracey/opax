import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { decodeMoneyGraph } from '../src/features/money/data';
import {
  ZOOM_OUT,
  fitCamera,
  type Camera,
  type Insets,
} from '../src/features/money/map/camera';
import { layoutBounds, layoutFor } from '../src/features/money/map/layout';
import {
  MoneyMap,
  forgetCameras,
  type MapCommand,
} from '../src/features/money/map/MoneyMap';
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
// The pan gesture's handlers, taken as the map builds them.
const mockPans: { handlers: Record<string, (e: unknown) => void> }[] = [];
jest.mock('react-native-gesture-handler', () => {
  const actual = jest.requireActual('./gesture-mock');
  return {
    ...actual,
    Gesture: {
      ...actual.Gesture,
      Pan: () => {
        const pan = actual.Gesture.Pan();
        mockPans.push(pan);
        return pan;
      },
    },
  };
});
// The stock mock makes a new shared value each render: the camera would go
// back to its first value at every change. One per mount, as on a device.
jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual('react-native-reanimated/mock');
  const { useRef } = jest.requireActual<typeof import('react')>('react');
  return {
    ...mock,
    useSharedValue: (initial: unknown) =>
      useRef(mock.useSharedValue(initial)).current,
  };
});
jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
jest.mock('../src/features/money/money-probe', () => ({
  MoneyTestHooks: () => null,
  useMoneyMapPerf: () => null,
  useMoneyMapProbe: () => undefined,
}));

const graph = decodeMoneyGraph(pinned('/graph/money.json'));
const model = buildModel(moneyView(graph, defaultMoneyFilters(graph)));
const REST: Insets = { top: 308, bottom: 196, left: 8, right: 76 };

type Props = Partial<React.ComponentProps<typeof MoneyMap>>;
async function mount(props: Props = {}) {
  forgetCameras();
  mockSettlers.length = 0;
  mockPans.length = 0;
  const element = (next: Props) => (
    <MoneyMap
      graph={graph}
      model={model}
      focus={null}
      onFocus={() => undefined}
      insets={REST}
      cacheKey="federal"
      accessibilityLabel="Money map"
      {...next}
    />
  );
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(element(props));
  });
  const stage = (width: number, height: number) =>
    act(() =>
      tree.root
        .findByProps({ testID: 'money-map-stage' })
        .props.onLayout({ nativeEvent: { layout: { width, height } } }),
    );
  stage(402, 760);
  await act(async () => mockSettlers.forEach((settled) => settled()));
  let current = props;
  const set = (next: Props) =>
    act(() => {
      current = { ...current, ...next };
      tree.update(element(current));
    });
  const camera = (): Camera => {
    const { tx, ty, k } = tree.root.findByType(MoneyMapLabels).props;
    return { tx: tx.get(), ty: ty.get(), k: k.get() };
  };
  return { tree, stage, set, camera };
}
/** The fit of everything drawn, in a stage of this size and these insets. */
const fitOf = (width: number, height: number, insets: Insets) => {
  const layout = layoutFor(graph, 1);
  const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
  return fitCamera(
    layoutBounds(
      layout,
      model.nodes.map((n) => index.get(n.id) ?? 0),
    ),
    { width, height, insets },
  );
};
let seq = 0;
const zoomOut = (): MapCommand => ({ type: 'zoom', direction: -1, seq: ++seq });

describe('a stage that grows under the open Search (Android hides its tab bar for the keyboard)', () => {
  test.each([
    ['at the fit', 0],
    ['at the furthest zoom out, where the new limits would pull it in', 2],
  ])('the held map does not move: %s', async (_name, steps) => {
    const map = await mount();
    for (let i = 0; i < steps; i++) map.set({ command: zoomOut() });
    const rest = map.camera();
    if (steps)
      expect(rest.k).toBeCloseTo(fitOf(402, 760, REST).k * ZOOM_OUT, 6);
    map.set({ holdSize: true });
    // The tab bar hides: 104 pt more stage, the same insets.
    map.stage(402, 864);
    expect(map.camera()).toEqual(rest);
    // Search closes before the tab bar is back: still held, then let go on
    // the stage's own size, with nothing to move.
    map.set({ holdSize: false });
    expect(map.camera()).toEqual(rest);
    map.stage(402, 760);
    expect(map.camera()).toEqual(rest);
    // No longer held: a later growth is the map's own.
    map.stage(402, 864);
    expect(map.camera()).not.toEqual(rest);
    await act(async () => map.tree.unmount());
  });

  test('a new width is a turn, and is never held', async () => {
    const map = await mount({ holdSize: true });
    const rest = map.camera();
    map.stage(874, 300);
    expect(map.camera()).not.toEqual(rest);
    await act(async () => map.tree.unmount());
  });
});

describe('the strip under the search card', () => {
  const strip = (top: number): Insets => ({ ...REST, top, bottom: 8 });

  test('is fitted when its results change it, kept otherwise, and the view before Search comes back', async () => {
    const map = await mount();
    const rest = map.camera();
    // Search opens at large text: the panel's room goes to the map, no key.
    map.set({ insets: strip(REST.top), fitKey: null });
    const held = map.camera();
    expect(held).not.toEqual(fitOf(402, 760, strip(REST.top)));
    // Results are listed: a new strip with a new key is fitted.
    map.set({ insets: strip(420), fitKey: 'a' });
    expect(map.camera()).toEqual(fitOf(402, 760, strip(420)));
    // The same key with other insets (the band, say) is not a fit.
    map.set({ insets: { ...strip(420), bottom: 30 }, fitKey: 'a' });
    expect(map.camera()).not.toEqual(
      fitOf(402, 760, { ...strip(420), bottom: 30 }),
    );
    // The reader moves the map in the strip, and lets go.
    const pan = mockPans.at(-1)!.handlers;
    const before = map.camera();
    act(() => {
      pan.onStart!({});
      pan.onUpdate!({ translationX: 30, translationY: 20 });
      pan.onEnd!({ velocityX: 0, velocityY: 0 });
    });
    expect(map.camera()).not.toEqual(before);
    // Other results: fitted again, their move in the old strip with it.
    map.set({ insets: strip(150), fitKey: 'b' });
    expect(map.camera()).toEqual(fitOf(402, 760, strip(150)));
    // Search closes: the view from before it.
    map.set({ insets: REST, fitKey: null });
    expect(map.camera()).toEqual(rest);
    await act(async () => map.tree.unmount());
  });

  test('is not fitted while the reader has the map under a finger', async () => {
    const map = await mount();
    map.set({ insets: strip(REST.top), fitKey: null });
    const pan = mockPans.at(-1)!.handlers;
    act(() => {
      pan.onStart!({});
      pan.onUpdate!({ translationX: 30, translationY: 20 });
    });
    const theirs = map.camera();
    map.set({ insets: strip(420), fitKey: 'a' });
    expect(map.camera()).not.toEqual(fitOf(402, 760, strip(420)));
    expect(map.camera().k).toBe(theirs.k);
    // Let go: the strip they moved in stays theirs until other results.
    act(() => pan.onEnd!({ velocityX: 0, velocityY: 0 }));
    map.set({ insets: { ...strip(420), bottom: 30 }, fitKey: 'a' });
    expect(map.camera().k).toBe(theirs.k);
    map.set({ insets: strip(150), fitKey: 'b' });
    expect(map.camera()).toEqual(fitOf(402, 760, strip(150)));
    await act(async () => map.tree.unmount());
  });
});

describe('a turn to landscape and back', () => {
  test('leaves the map on the view it had, through every viewport on the way', async () => {
    const map = await mount();
    const rest = map.camera();
    const side = (left: number, top: number, bottom: number): Insets => ({
      top,
      bottom,
      left,
      right: left + 68,
    });
    // There: the safe sides, the stage, the card, the panel, the band.
    map.set({ insets: side(67, 308, 196) });
    map.stage(874, 300);
    map.set({ insets: side(67, 150, 196) });
    map.set({ insets: side(67, 150, 140) });
    map.set({ insets: side(67, 150, 110) });
    expect(map.camera()).not.toEqual(rest);
    // And back, in the same pieces.
    map.set({ insets: side(8, 150, 110) });
    map.stage(402, 760);
    map.set({ insets: side(8, 308, 110) });
    map.set({ insets: side(8, 308, 140) });
    map.set({ insets: REST });
    expect(map.camera()).toEqual(rest);
    await act(async () => map.tree.unmount());
  });
});
