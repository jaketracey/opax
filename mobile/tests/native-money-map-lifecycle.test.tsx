import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { GLView } from 'expo-gl';
import { NativeMoneyMap } from '../src/features/money/NativeMoneyMap';
import { NativeMoneyScene } from '../src/features/money/NativeMoneyScene';
import { Button } from '../src/design/primitives';
import { decodeMoneyGraph } from '../src/features/money/data';
import { defaultMoneyFilters, moneyView } from '../src/features/money/view';
import { pinned } from './pinned';

jest.mock('expo-gl', () => ({
  GLView: jest.requireActual('react-native').View,
}));
let mockBlur: (() => void) | undefined;
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => () => void) =>
    jest.requireActual('react').useEffect(() => {
      mockBlur = callback();
      return mockBlur;
    }, [callback]),
}));
let mockE2E = true;
jest.mock('../src/design/environment', () => ({
  get isE2E() {
    return mockE2E;
  },
}));
let mockReduced: boolean | null = null;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: () => mockReduced,
}));
jest.mock('../src/features/money/NativeMoneyScene', () => ({
  NativeMoneyScene: jest.fn().mockImplementation(() => {
    let completed = 0;
    return {
      render: jest.fn(),
      endFrame: jest.fn(() => completed++),
      verifyPixels: jest.fn(() => 100),
      diagnostics: () => ({ completedFrames: completed }),
      labels: () => [],
      dispose: jest.fn(),
      setView: jest.fn(),
      setReducedMotion: jest.fn(),
      resize: jest.fn(),
      orbit: jest.fn(),
      zoom: jest.fn(),
      focus: jest.fn(),
      pick: () => 'party:Labor',
    };
  }),
}));
jest.mock('react-native-gesture-handler', () => {
  const chain = () => {
    const value: Record<string, unknown> = {};
    for (const name of [
      'maxPointers',
      'runOnJS',
      'onBegin',
      'onUpdate',
      'onEnd',
    ])
      value[name] = () => value;
    return value;
  };
  return {
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
const graph = decodeMoneyGraph(pinned('/graph/money.json'));
const pending = new Map<number, FrameRequestCallback>();
let sequence = 0,
  now = 0;
let appChanged: (state: AppStateStatus) => void;
const unsubscribe = jest.fn();
jest
  .spyOn(AppState, 'addEventListener')
  .mockImplementation((_event, callback) => {
    appChanged = callback;
    return { remove: unsubscribe };
  });
const gl = { getError: () => 0, NO_ERROR: 0 };
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  pending.clear();
  sequence = 0;
  now = 0;
  mockReduced = null;
  mockE2E = true;
  AppState.currentState = 'active';
  global.requestAnimationFrame = jest.fn((callback) => {
    const id = ++sequence;
    pending.set(id, callback);
    return id;
  });
  global.cancelAnimationFrame = jest.fn((id) => {
    pending.delete(id);
  });
  jest.spyOn(performance, 'now').mockImplementation(() => now);
});
function frame() {
  now += 34;
  const [id, callback] = pending.entries().next().value!;
  pending.delete(id);
  act(() => callback(now));
}
function start(r: TestRenderer.ReactTestRenderer) {
  const canvas = r.root
    .findAllByProps({ testID: 'money-map-canvas' })
    .find((x) => typeof x.props.onLayout === 'function')!;
  act(() => canvas.props.onLayout({ nativeEvent: { layout: { width: 360 } } }));
  const view = r.root
    .findAllByType(GLView)
    .find((x) => typeof x.props.onContextCreate === 'function')!;
  act(() => view.props.onContextCreate(gl));
  return jest.mocked(NativeMoneyScene).mock.results.at(-1)!.value;
}
test('native pixels and completed frames gate the probe; blur, background, offscreen and close stop rendering', () => {
  let r!: TestRenderer.ReactTestRenderer;
  const select = jest.fn();
  const element = (active: boolean, view = graph) => (
    <NativeMoneyMap
      graph={graph}
      view={view}
      active={active}
      onSelect={select}
    />
  );
  act(() => {
    r = TestRenderer.create(element(true));
  });
  const scene = start(r);
  expect(scene.setReducedMotion).toHaveBeenCalledWith(true);
  frame();
  frame();
  expect(
    r.root.findAllByProps({ testID: 'money-map-drawn-frames-2-pixels-100' })
      .length,
  ).toBeGreaterThan(0);
  expect(scene.verifyPixels).toHaveBeenCalledTimes(1);
  const filtered = moneyView(graph, {
    ...defaultMoneyFilters(graph),
    from: 2024,
    to: 2024,
  });
  act(() => r.update(element(true, filtered)));
  expect(NativeMoneyScene).toHaveBeenCalledTimes(1);
  expect(scene.setView).toHaveBeenLastCalledWith(filtered);
  act(() => appChanged('background'));
  expect(pending.size).toBe(0);
  act(() => appChanged('active'));
  expect(pending.size).toBe(1);
  act(() => r.update(element(false, filtered)));
  expect(pending.size).toBe(0);
  mockReduced = false;
  act(() => r.update(element(true, filtered)));
  expect(scene.setReducedMotion).toHaveBeenLastCalledWith(false);
  act(() => mockBlur?.());
  expect(pending.size).toBe(0);
  act(() => r.unmount());
  expect(scene.dispose).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
test('a lost context removes the GL view, releases the scene and offers one fresh context', () => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <NativeMoneyMap graph={graph} view={graph} active onSelect={jest.fn()} />,
    );
  });
  const scene = start(r);
  scene.render.mockImplementationOnce(() => {
    throw new Error('Context no longer exists');
  });
  frame();
  expect(scene.dispose).toHaveBeenCalledTimes(1);
  expect(pending.size).toBe(0);
  expect(
    r.root.findAllByType(GLView).filter((x) => x.props.onContextCreate),
  ).toHaveLength(0);
  act(() =>
    r.root
      .findAllByType(Button)
      .find((x) => x.props.testID === 'money-gl-retry')!
      .props.onPress(),
  );
  start(r);
  expect(NativeMoneyScene).toHaveBeenCalledTimes(2);
  act(() => r.unmount());
});

test('benign GL diagnostics do not remove a drawable view; real context loss offers the list', () => {
  let r!: TestRenderer.ReactTestRenderer;
  const unavailable = jest.fn();
  act(() => {
    r = TestRenderer.create(
      <NativeMoneyMap
        graph={graph}
        view={graph}
        active
        onSelect={jest.fn()}
        onUnavailable={unavailable}
      />,
    );
  });
  const scene = start(r);
  const getError = jest.spyOn(gl, 'getError');
  getError.mockReturnValue(0x0500);
  for (let i = 0; i < 32; i++) frame();
  expect(scene.dispose).not.toHaveBeenCalled();
  expect(unavailable).not.toHaveBeenCalled();
  getError.mockReturnValue(0x9242);
  for (let i = 0; i < 31 && pending.size; i++) frame();
  expect(unavailable).toHaveBeenCalledTimes(1);
  expect(scene.dispose).toHaveBeenCalledTimes(1);
  getError.mockRestore();
  act(() => r.unmount());
});

test('production never gates its first frame on the e2e pixel probe', () => {
  mockE2E = false;
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <NativeMoneyMap graph={graph} view={graph} active onSelect={jest.fn()} />,
    );
  });
  const scene = start(r);
  scene.verifyPixels.mockImplementation(() => {
    throw new Error('Benign readback discrepancy');
  });
  frame();
  frame();
  expect(scene.verifyPixels).not.toHaveBeenCalled();
  expect(scene.endFrame).toHaveBeenCalledTimes(2);
  expect(scene.dispose).not.toHaveBeenCalled();
  act(() => r.unmount());
});
