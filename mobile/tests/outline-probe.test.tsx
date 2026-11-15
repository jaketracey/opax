import { act } from 'react';
import { AppState } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { NavigationContext } from 'expo-router/react-navigation';
import {
  readableFrame,
  useOutlineProbe,
} from '../src/features/electorate-map/outline-probe.e2e';

jest.mock('../src/design/environment', () => ({ isE2E: true }));

// Build 82, Duo (iOS 27.2): the e2e probe snapshotted the electorate map
// after a member's profile had been pushed over its page, and Metal aborted
// the app on a view it could not read. The probe asks first.
type Frame = [x: number, y: number, width: number, height: number];
const dark = () => {
  // 64 navy pixels: more than the 40 the probe counts as drawn.
  const bytes = new Uint8Array(64 * 4);
  for (let i = 0; i < bytes.length; i += 4) bytes.set([20, 40, 70, 255], i);
  return bytes;
};
function canvas(frame: Frame | null) {
  const image = {
    width: () => 8,
    height: () => 8,
    readPixels: jest.fn(dark),
    dispose: jest.fn(),
  };
  return {
    image,
    makeImageSnapshot: jest.fn(() => image),
    measureInWindow: jest.fn(
      (callback: (...frame: Frame) => void) => frame && callback(...frame),
    ),
  };
}
function probe(
  view: ReturnType<typeof canvas> | null,
  { focused = true }: { focused?: boolean } = {},
) {
  const ref = { current: view };
  const state = { focused };
  const navigation = { isFocused: () => state.focused };
  let id = '';
  function Harness() {
    id = useOutlineProbe(ref as never, 'M0 0L1 1Z');
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <NavigationContext.Provider value={navigation as never}>
        <Harness />
      </NavigationContext.Provider>,
    );
  });
  return {
    state,
    id: () => id,
    run: (ms: number) => act(() => jest.advanceTimersByTime(ms)),
    unmount: () => act(() => renderer.unmount()),
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test.each([
  ['has no layout yet', null],
  ['has no width', [0, 300, 0, 200]],
  ['has no height', [16, 300, 370, 0]],
  ['has a size that is not a number', [16, 300, NaN, 200]],
  ['is scrolled off the top', [16, -400, 370, 200]],
  ['is below the window', [16, 5000, 370, 200]],
] as const)('a map that %s is never snapshotted', (_case, frame) => {
  const view = canvas(frame as Frame | null);
  const page = probe(view);
  page.run(40_000);
  expect(view.measureInWindow).toHaveBeenCalled();
  expect(view.makeImageSnapshot).not.toHaveBeenCalled();
  expect(page.id()).toBe('electorate-outline');
  page.unmount();
});

test('a map whose page has another page over it is never snapshotted, and is read once it is back in front', () => {
  const view = canvas([16, 300, 370, 200]);
  const page = probe(view, { focused: false });
  page.run(5_000);
  expect(view.makeImageSnapshot).not.toHaveBeenCalled();
  page.state.focused = true;
  page.run(250);
  expect(view.makeImageSnapshot).toHaveBeenCalledTimes(1);
  expect(page.id()).toBe('electorate-outline-drawn-pixels-64');
  page.unmount();
});

test('with the app in the background nothing is snapshotted', () => {
  const before = Object.getOwnPropertyDescriptor(AppState, 'currentState');
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    value: 'background',
  });
  const view = canvas([16, 300, 370, 200]);
  const page = probe(view);
  page.run(5_000);
  expect(view.makeImageSnapshot).not.toHaveBeenCalled();
  if (before) Object.defineProperty(AppState, 'currentState', before);
  else delete (AppState as { currentState?: unknown }).currentState;
  page.unmount();
});

// Journey 24's wait: a laid-out map on screen still reports its pixels,
// once, and the probe stops there.
test('a laid-out map on screen reports its drawn pixels and stops', () => {
  const view = canvas([16, 300, 370, 200]);
  const page = probe(view);
  page.run(250);
  expect(page.id()).toBe('electorate-outline-drawn-pixels-64');
  expect(view.image.dispose).toHaveBeenCalledTimes(1);
  page.run(40_000);
  expect(view.makeImageSnapshot).toHaveBeenCalledTimes(1);
  page.unmount();
});

test('a map that never draws is given up on after twenty snapshots', () => {
  const view = canvas([16, 300, 370, 200]);
  view.image.readPixels.mockImplementation(() => new Uint8Array(64 * 4));
  const page = probe(view);
  page.run(40_000);
  expect(view.makeImageSnapshot).toHaveBeenCalledTimes(20);
  expect(page.id()).toBe('electorate-outline');
  page.unmount();
});

test('readableFrame wants a real size, on screen', () => {
  const window = { width: 402, height: 874 };
  expect(
    readableFrame({ x: 16, y: 300, width: 370, height: 200 }, window),
  ).toBe(true);
  // Partly on screen is enough.
  expect(
    readableFrame({ x: 16, y: -100, width: 370, height: 200 }, window),
  ).toBe(true);
  expect(readableFrame({ x: 16, y: 300, width: -1, height: -1 }, window)).toBe(
    false,
  );
  expect(
    readableFrame({ x: 500, y: 300, width: 370, height: 200 }, window),
  ).toBe(false);
});
