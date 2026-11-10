import { act, useRef } from 'react';
import { Platform } from 'react-native';
import type * as ReanimatedTypes from 'react-native-reanimated';
import TestRenderer from 'react-test-renderer';
import { VoiceOrb } from '../src/features/talk/VoiceOrb';

const Reanimated = jest.requireMock(
  'react-native-reanimated',
) as typeof ReanimatedTypes;

jest.mock('../src/design/accessibility', () => ({
  useIncreaseContrast: () => false,
}));

function shared<T>(initial: T) {
  let value = initial;
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
    },
  };
}
const original = Platform.OS;
const clock = { setActive: jest.fn(), isActive: false, callbackId: 1 };
const levels = {
  input: shared(0),
  output: shared(0),
  outputFresh: shared(0),
} as never;
beforeEach(() => {
  jest.useFakeTimers();
  clock.setActive.mockClear();
  jest.spyOn(Reanimated, 'useFrameCallback').mockReturnValue(clock);
  jest
    .spyOn(Reanimated, 'useSharedValue')
    .mockImplementation(function useStableShared<T>(value: T) {
      return useRef(shared(value)).current as never;
    });
  jest.spyOn(Reanimated, 'useDerivedValue').mockReturnValue(shared(0) as never);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  Object.defineProperty(Platform, 'OS', {
    value: original,
    configurable: true,
  });
});

test.each(['android', 'ios'] as const)(
  '%s first paint and a late layout retain the platform’s resting animation policy',
  (os) => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    const orb = (size: number) => (
      <VoiceOrb phase="rest" size={size} levels={levels} reduceMotion={false} />
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(orb(0));
    });
    expect(clock.setActive.mock.calls).toEqual(
      os === 'android' ? [[true]] : [],
    );
    act(() => jest.advanceTimersByTime(1200));
    expect(clock.setActive).toHaveBeenLastCalledWith(false);
    clock.setActive.mockClear();
    // Layout may arrive after the first settling window on a busy Android host.
    act(() => renderer.update(orb(240)));
    expect(clock.setActive.mock.calls).toEqual(
      os === 'android' ? [[true]] : [],
    );
    act(() => jest.advanceTimersByTime(1200));
    expect(clock.setActive.mock.calls).toEqual(
      os === 'android' ? [[true], [false]] : [],
    );
    act(() => renderer.unmount());
    expect(jest.getTimerCount()).toBe(0);
  },
);
