import { act } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WelcomeTour } from '../src/onboarding/WelcomeTour';

// An iPad in landscape: the tour draws its two columns.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 1376, height: 1032, scale: 2, fontScale: 1 }),
}));
jest.mock('../src/design/adaptive', () => ({
  ...jest.requireActual('../src/design/adaptive'),
  useLayout: () => ({
    size: 'regular',
    regular: true,
    wide: true,
    width: 1376,
    height: 1032,
    window: { width: 1376, height: 1032 },
    landscape: true,
  }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
}));

// The Reduce Motion setting answers asynchronously: control when and how.
let answer!: (value: boolean) => void;
let changed: ((value: boolean) => void) | undefined;
jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(
  () =>
    new Promise<boolean>((resolve) => {
      answer = resolve;
    }),
);
jest
  .spyOn(AccessibilityInfo, 'addEventListener')
  .mockImplementation((event, handler) => {
    if (event === 'reduceMotionChanged')
      changed = handler as (value: boolean) => void;
    return { remove: () => undefined } as ReturnType<
      typeof AccessibilityInfo.addEventListener
    >;
  });
// Every timing the tour starts, by its duration: 360 and 240 are the
// crossfade, 480 the incoming picture's drift, 320 the words' fade, 420 a
// scene's reveal. 200 and 260 are the veil and a released swipe.
const started: number[] = [];
jest.spyOn(Animated, 'timing').mockImplementation((_value, config) => {
  const animation = {
    start: () => started.push(config.duration ?? 0),
    stop: jest.fn(),
    reset: jest.fn(),
  };
  return animation as unknown as Animated.CompositeAnimation;
});
jest.spyOn(Animated, 'parallel').mockImplementation(
  (animations) =>
    ({
      start: () => animations.forEach((animation) => animation.start()),
      stop: jest.fn(),
      reset: jest.fn(),
    }) as unknown as Animated.CompositeAnimation,
);

// Page turns move VoiceOver focus on a timer.
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

const metrics = {
  frame: { x: 0, y: 0, width: 1376, height: 1032 },
  insets: { top: 24, left: 0, right: 0, bottom: 20 },
};
const render = () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <WelcomeTour onLeave={jest.fn()} onClosed={jest.fn()} />
      </SafeAreaProvider>,
    );
  });
  return renderer;
};
const press = (root: ReactTestInstance, id: string) =>
  act(() =>
    root
      .find(
        (n) => n.props.testID === id && typeof n.props.onPress === 'function',
      )
      .props.onPress(),
  );
const motion = (durations: number[]) =>
  durations.filter((d) => [240, 320, 360, 420, 480].includes(d));

test('before iOS answers, and with Reduce Motion on, a page turn moves nothing', async () => {
  const r = render();
  // The setting is not known yet: no reveal, no crossfade, no drift.
  press(r.root, 'tour-next');
  press(r.root, 'tour-dot-3');
  expect(motion(started)).toEqual([]);
  await act(async () => answer(true));
  press(r.root, 'tour-back');
  press(r.root, 'tour-next');
  expect(motion(started)).toEqual([]);
  // The new page is in place at once.
  expect(
    r.root.find(
      (n) => n.props.testID === 'tour-progress' && typeof n.type === 'string',
    ).props.accessibilityLabel,
  ).toBe('Page 4 of 5');
  act(() => r.unmount());
});

test('with Reduce Motion off, pages crossfade and the picture drifts in', () => {
  act(() => changed?.(false));
  started.length = 0;
  const r = render();
  // Page 1's scene reveals itself on open.
  expect(started).toContain(420);
  started.length = 0;
  press(r.root, 'tour-next');
  expect(started).toEqual(expect.arrayContaining([360, 240, 480, 320]));
  // Turning Reduce Motion on mid-tour: the next turn is still again.
  act(() => changed?.(true));
  started.length = 0;
  press(r.root, 'tour-next');
  expect(motion(started)).toEqual([]);
  act(() => r.unmount());
});
