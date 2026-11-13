import { act, useEffect, type RefObject } from 'react';
import { Keyboard, type ScrollView, type View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TestRenderer from 'react-test-renderer';
import { useScrollReveal } from '../src/design/scroll-reveal';

// A form's error drawn below the fold is scrolled up to sit just above the
// home indicator, once the keyboard the caller hid has finished going down.
const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};
// The jest window is 750 pt tall unless a test sets one.
const { height } = jest
  .requireActual('react-native')
  .Dimensions.get('window') as { height: number };
type Api = ReturnType<typeof useScrollReveal>;
let api!: Api;
function Probe({ onApi }: { onApi: (value: Api) => void }) {
  const value = useScrollReveal();
  useEffect(() => onApi(value));
  return null;
}
let renderer: TestRenderer.ReactTestRenderer;
let scrollTo: jest.Mock;
let keyboardHidden: (() => void) | null;
let removed: jest.Mock;
beforeEach(() => {
  jest.useFakeTimers();
  act(() => {
    renderer = TestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <Probe
          onApi={(value) => {
            api = value;
          }}
        />
      </SafeAreaProvider>,
    );
  });
  scrollTo = jest.fn();
  (api.scrollRef as { current: unknown }).current = { scrollTo };
  keyboardHidden = null;
  removed = jest.fn();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((
    event: string,
    listener: () => void,
  ) => {
    if (event === 'keyboardDidHide') keyboardHidden = listener;
    return { remove: removed };
  }) as never);
});
afterEach(() => {
  act(() => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});
const at = (y: number, viewHeight: number) =>
  ({
    current: {
      measureInWindow: (
        done: (x: number, y: number, w: number, h: number) => void,
      ) => done(0, y, 370, viewHeight),
    },
  }) as unknown as RefObject<View | null>;
const limit = () => height - metrics.insets.bottom - 16;

test('an error below the fold scrolls up just far enough', () => {
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  api.onScroll(40);
  api.reveal(at(limit() - 20, 100));
  act(() => jest.runOnlyPendingTimers());
  expect(scrollTo).toHaveBeenCalledWith({ y: 40 + 80, animated: true });
});

test('an error already in view stays where it is', () => {
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  api.reveal(at(200, 100));
  act(() => jest.runOnlyPendingTimers());
  expect(scrollTo).not.toHaveBeenCalled();
});

test('a keyboard still going down is waited for, and a cancel stops it', () => {
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
  api.reveal(at(limit() + 10, 50));
  act(() => jest.runOnlyPendingTimers());
  expect(scrollTo).not.toHaveBeenCalled();
  act(() => keyboardHidden!());
  expect(removed).toHaveBeenCalled();
  act(() => jest.runOnlyPendingTimers());
  expect(scrollTo).toHaveBeenCalledWith({ y: 60, animated: true });
  scrollTo.mockClear();
  removed.mockClear();
  const cancel = api.reveal(at(limit() + 10, 50));
  cancel();
  expect(removed).toHaveBeenCalled();
});

test('the scroll ref is a plain ref for the Screen', () => {
  const ref: RefObject<ScrollView | null> = api.scrollRef;
  expect(ref).toHaveProperty('current');
});
