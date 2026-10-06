import { act, useEffect, useRef } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  Keyboard,
  type KeyboardEvent,
  type ScrollView,
  type View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useStableKeyboard } from '../src/design/useStableKeyboard';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: 1 }),
}));
let state!: ReturnType<typeof useStableKeyboard>;
let handlers: Record<string, (event: KeyboardEvent) => void>;
let renderer: TestRenderer.ReactTestRenderer;
const scrollTo = jest.fn();
function Harness() {
  const scroll = useRef({ scrollTo } as unknown as ScrollView);
  const target = useRef<View>(null);
  const value = useStableKeyboard(scroll, target);
  useEffect(() => {
    state = value;
  }, [value]);
  return null;
}
function move(y: number) {
  act(() =>
    state.onScroll({
      nativeEvent: { contentOffset: { x: 0, y } },
    } as Parameters<typeof state.onScroll>[0]),
  );
}
function keyboard(screenY: number) {
  act(() =>
    handlers.keyboardWillChangeFrame({
      endCoordinates: { screenY },
    } as KeyboardEvent),
  );
}
beforeEach(() => {
  handlers = {};
  scrollTo.mockClear();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, handler) => {
    handlers[name] = handler;
    return { remove: jest.fn() };
  });
  act(() => {
    renderer = TestRenderer.create(
      <SafeAreaInsetsContext.Provider
        value={{ top: 168, bottom: 83, left: 0, right: 0 }}
      >
        <Harness />
      </SafeAreaInsetsContext.Provider>,
    );
  });
  act(() => {
    state.onLayout({ nativeEvent: { layout: { height: 874 } } } as Parameters<
      typeof state.onLayout
    >[0]);
  });
});
afterEach(() => {
  act(() => renderer.unmount());
  jest.restoreAllMocks();
});
test('resting short Search adds no artificial scroll extent', () => {
  move(-168);
  expect(state.contentStyle.minHeight).toBe(0);
});
test('a negative reveal offset retains exactly enough height through dismissal', () => {
  move(-168);
  keyboard(539);
  move(-24);
  expect(state.contentStyle.minHeight).toBe(767);
  keyboard(874);
  expect(state.contentStyle.minHeight).toBe(767);
  expect(state.contentStyle.paddingBottom).toBe(52);
  expect(scrollTo).not.toHaveBeenCalled();
});
test('returning toward the top releases retained blank space', () => {
  move(-168);
  keyboard(539);
  move(40);
  keyboard(874);
  expect(state.contentStyle.minHeight).toBe(831);
  move(-168);
  expect(state.contentStyle.minHeight).toBe(623);
});
