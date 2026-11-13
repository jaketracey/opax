// Sweep 1 item 11: the masthead dots fade in over the crossfade duration the
// first time they draw in a session, with no movement; never again that
// session, and never under Reduce Motion.
import type * as SkiaTypes from '@shopify/react-native-skia';
import { NavigationContext } from 'expo-router/react-navigation';
import { act } from 'react';
import { Dimensions } from 'react-native';
import type * as ReanimatedTypes from 'react-native-reanimated';
import TestRenderer from 'react-test-renderer';
import { motion } from '../src/design/tokens';
import {
  AustraliaDots,
  resetDotArrivalForTests,
} from '../src/features/today/AustraliaDots';
import { dotArrival } from '../src/features/today/australia-dots-model';

const Skia = jest.requireMock('@shopify/react-native-skia') as typeof SkiaTypes;
const Reanimated = jest.requireMock(
  'react-native-reanimated',
) as typeof ReanimatedTypes;

let mockReduced: boolean | null = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: () => mockReduced,
}));

test('the rule: first draw fades, later draws and Reduce Motion show at once', () => {
  expect(dotArrival(false, false)).toBe('fade');
  expect(dotArrival(true, false)).toBe('shown');
  expect(dotArrival(false, true)).toBe('shown');
  expect(dotArrival(false, null)).toBe('wait');
  expect(dotArrival(true, null)).toBe('shown');
});

describe('AustraliaDots', () => {
  const navigation = {
    isFocused: () => true,
    addListener: () => () => {},
  };
  const scroll = { value: 0, get: () => 0, set: () => {} } as never;
  const header = { value: 160, get: () => 160, set: () => {} } as never;
  const mount = () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <AustraliaDots state={null} scroll={scroll} expandedHeader={header} />
        </NavigationContext.Provider>,
      );
    });
    return r;
  };
  const fades = () =>
    jest
      .mocked(Reanimated.withTiming)
      .mock.calls.filter(
        ([to, config]) =>
          to === 1 && config?.duration === motion.duration.crossfade,
      );
  beforeEach(() => {
    resetDotArrivalForTests();
    mockReduced = false;
    Dimensions.set({
      window: { width: 402, height: 874, scale: 3, fontScale: 1 },
      screen: { width: 402, height: 874, scale: 3, fontScale: 1 },
    });
    jest.spyOn(Reanimated, 'withTiming');
    jest
      .spyOn(Skia.Skia.Path, 'MakeFromSVGString')
      .mockReturnValue({ contains: () => false } as never);
  });
  afterEach(() => jest.restoreAllMocks());

  test('fades once per session at the crossfade duration, then never again', () => {
    let r = mount();
    expect(fades()).toHaveLength(1);
    act(() => r.unmount());
    r = mount();
    expect(fades()).toHaveLength(1);
    act(() => r.unmount());
  });

  test('under Reduce Motion the dots are simply there', () => {
    mockReduced = true;
    const r = mount();
    expect(fades()).toHaveLength(0);
    act(() => r.unmount());
  });
});
