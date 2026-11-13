// Sweep 1 item 10: the resting Talk orb breathes (4 s, scale 1.00 to 1.03,
// rings 0.6 to 1.0), and never in a call, under Reduce Motion or in the
// background. The breath is a UI-thread timing: the frame loop stays off.
import { act, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type * as ReanimatedTypes from 'react-native-reanimated';
import TestRenderer from 'react-test-renderer';
import {
  BREATH_SECONDS,
  orbBreathes,
  VoiceOrb,
  type OrbPhase,
} from '../src/features/talk/VoiceOrb';

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
const levels = {
  input: shared(0),
  output: shared(0),
  outputFresh: shared(0),
} as never;
const clock = { setActive: jest.fn(), isActive: false, callbackId: 1 };
let appListener: ((state: AppStateStatus) => void) | null = null;
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Reanimated, 'useFrameCallback').mockReturnValue(clock);
  jest
    .spyOn(Reanimated, 'useSharedValue')
    .mockImplementation(function useStableShared<T>(value: T) {
      return useRef(shared(value)).current as never;
    });
  jest.spyOn(Reanimated, 'withRepeat');
  jest.spyOn(Reanimated, 'withTiming');
  jest.spyOn(Reanimated, 'cancelAnimation');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    appListener = listener as (state: AppStateStatus) => void;
    return { remove: () => (appListener = null) } as never;
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const orb = (phase: OrbPhase, reduceMotion: boolean) => (
  <VoiceOrb
    phase={phase}
    size={240}
    levels={levels}
    reduceMotion={reduceMotion}
  />
);

test('the rule: rest only, motion allowed, app in front', () => {
  expect(orbBreathes('rest', false, true)).toBe(true);
  expect(orbBreathes('rest', true, true)).toBe(false);
  expect(orbBreathes('rest', false, false)).toBe(false);
  for (const phase of [
    'connecting',
    'listening',
    'thinking',
    'speaking',
    'muted',
  ] as const)
    expect(orbBreathes(phase, false, true)).toBe(false);
});

test('at rest the orb breathes forever on a 4 second eased loop, with no frame loop', () => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(orb('rest', false));
  });
  expect(Reanimated.withRepeat).toHaveBeenCalledTimes(1);
  const [, count, reverse] = jest.mocked(Reanimated.withRepeat).mock.calls[0]!;
  expect(count).toBe(-1);
  expect(reverse).toBe(true);
  // Half a breath each way: in and out over BREATH_SECONDS.
  expect(Reanimated.withTiming).toHaveBeenCalledWith(
    0,
    expect.objectContaining({ duration: (BREATH_SECONDS * 1000) / 2 }),
  );
  expect(clock.setActive).not.toHaveBeenCalledWith(true);
  // The background stops it; coming back starts it again.
  jest.mocked(Reanimated.withRepeat).mockClear();
  act(() => appListener?.('background'));
  expect(Reanimated.cancelAnimation).toHaveBeenCalled();
  act(() => appListener?.('active'));
  expect(Reanimated.withRepeat).toHaveBeenCalledTimes(1);
  // A call stops the breath; the call's own motion takes over.
  jest.mocked(Reanimated.withRepeat).mockClear();
  jest.mocked(Reanimated.cancelAnimation).mockClear();
  act(() => r.update(orb('listening', false)));
  expect(Reanimated.cancelAnimation).toHaveBeenCalled();
  expect(Reanimated.withRepeat).not.toHaveBeenCalled();
  act(() => r.unmount());
});

test('under Reduce Motion the resting orb is still', () => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(orb('rest', true));
  });
  expect(Reanimated.withRepeat).not.toHaveBeenCalled();
  act(() => r.unmount());
});
