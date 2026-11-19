import { act, createElement, useRef } from 'react';
import type * as SkiaTypes from '@shopify/react-native-skia';
import * as Native from 'react-native';
import { Platform } from 'react-native';
import type * as ReanimatedTypes from 'react-native-reanimated';
import TestRenderer from 'react-test-renderer';
import { orbColours, VoiceOrb } from '../src/features/talk/VoiceOrb';
import { SizedCanvas } from '../src/design/canvas';

const Reanimated = jest.requireMock(
  'react-native-reanimated',
) as typeof ReanimatedTypes;
const Skia = jest.requireMock('@shopify/react-native-skia') as typeof SkiaTypes;

jest.mock('../src/design/accessibility', () => ({
  useIncreaseContrast: () => false,
  useHighTextContrast: () => false,
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
  jest
    .spyOn(Skia, 'Group')
    .mockImplementation(({ children, ...props }) =>
      createElement('OrbGroup', props, children),
    );
  jest
    .spyOn(Skia, 'Circle')
    .mockImplementation((props) => createElement('OrbCircle', props));
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
    expect(renderer.root.findByType(SizedCanvas).props.colorSpace).toBe(
      os === 'android' ? 'srgb' : undefined,
    );
    const background = renderer.root.findAllByType('OrbCircle' as never)[0];
    expect(background.props.color !== undefined).toBe(os === 'android');
    if (os === 'android') expect(background.props.r).toBe(240);
    // Even with every derived value still zero, Android's initial core is
    // opaque and has a positive radius. iOS keeps its original shared values.
    const cores = renderer.root.findAllByType('OrbCircle' as never).slice(-3);
    expect(cores).toHaveLength(3);
    for (const core of cores) {
      expect(typeof core.props.r).toBe(os === 'android' ? 'number' : 'object');
      if (os === 'android') expect(core.props.r).toBeGreaterThan(0);
    }
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

test('a live switch to dark redraws the orb with the dark set, with no remount', () => {
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  const scheme = jest.spyOn(Native, 'useColorScheme').mockReturnValue('light');
  jest
    .spyOn(Skia, 'RadialGradient')
    .mockImplementation((props) => createElement('OrbGradient', props));
  const orb = () => (
    <VoiceOrb phase="rest" size={240} levels={levels} reduceMotion={false} />
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(orb());
  });
  const ground = () =>
    renderer.root.findAllByType('OrbCircle' as never)[0]!.props.color;
  const stops = () =>
    renderer.root
      .findAllByType('OrbGradient' as never)
      .map((gradient) => gradient.props.colors);
  const light = orbColours('light', false);
  const dark = orbColours('dark', false);
  expect(ground()).toEqual(light.ground);
  for (const part of [light.halo, light.core, light.glow])
    expect(stops()).toContainEqual(part);
  scheme.mockReturnValue('dark');
  act(() => renderer.update(orb()));
  // Android paints its own page ground under the orb: it must follow too.
  expect(ground()).toEqual(dark.ground);
  expect(ground()).not.toEqual(light.ground);
  for (const part of [dark.halo, dark.core, dark.glow])
    expect(stops()).toContainEqual(part);
  expect(stops()).not.toContainEqual(light.core);
  act(() => renderer.unmount());
});
