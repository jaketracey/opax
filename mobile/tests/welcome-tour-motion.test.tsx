import { act } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WelcomeTour } from '../src/onboarding/WelcomeTour';

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
// Scene reveals are the only timings with a delay.
const reveals: { stop: jest.Mock }[] = [];
const timing = jest
  .spyOn(Animated, 'timing')
  .mockImplementation((_value, config) => {
    const animation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
    if ((config.delay ?? 0) > 0) reveals.push(animation);
    return animation as unknown as Animated.CompositeAnimation;
  });

const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
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

test('first mount with Reduce Motion on: no reveal starts, before or after the answer', async () => {
  const r = render();
  // The setting is not known yet: nothing may move.
  expect(reveals).toHaveLength(0);
  await act(async () => answer(true));
  expect(reveals).toHaveLength(0);
  expect(timing.mock.calls.some(([, config]) => (config.delay ?? 0) > 0)).toBe(
    false,
  );
  act(() => r.unmount());
});

test('Reduce Motion turned on mid-reveal stops the running reveals', async () => {
  // The setting is known from the first test; turn it off and start again.
  act(() => changed?.(false));
  const r = render();
  const started = reveals.length;
  expect(started).toBeGreaterThan(0);
  act(() => changed?.(true));
  for (const animation of reveals) expect(animation.stop).toHaveBeenCalled();
  act(() => r.unmount());
});
