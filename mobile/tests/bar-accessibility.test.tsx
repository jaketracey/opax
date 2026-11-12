import { act } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { useSolidBar } from '../src/design/accessibility';
import { colors } from '../src/design/tokens';
import { largeTitleBar, opaqueBar, scrollBar } from '../src/navigation/chrome';

afterEach(() => jest.restoreAllMocks());

test('either iOS legibility setting selects solid bars and changes back live', async () => {
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 26 });
  jest
    .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
    .mockResolvedValue(false);
  jest
    .spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled')
    .mockResolvedValue(false);
  const listeners = new Map<string, (value: boolean) => void>();
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((event, listener) => {
      listeners.set(event, listener as (value: boolean) => void);
      return { remove: jest.fn() };
    });
  let solid = false;
  function Probe() {
    solid = useSolidBar();
    return null;
  }
  let tree!: TestRenderer.ReactTestRenderer;
  try {
    await act(async () => {
      tree = TestRenderer.create(<Probe />);
    });
    for (const [reduced, contrast] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
      [false, false],
    ]) {
      act(() => {
        listeners.get('reduceTransparencyChanged')!(reduced!);
        listeners.get('darkerSystemColorsChanged')!(contrast!);
      });
      expect(solid).toBe(reduced || contrast);
      const inline = scrollBar(colors.sunken, solid);
      expect(inline).toMatchObject(
        solid
          ? {
              headerTransparent: false,
              headerStyle: { backgroundColor: colors.sunken },
              scrollEdgeEffects: { top: 'hidden', bottom: 'soft' },
            }
          : {
              headerTransparent: true,
              headerStyle: {},
              scrollEdgeEffects: { top: 'soft', bottom: 'soft' },
            },
      );
      // Large titles retain their transparent UIKit appearance even when a
      // native solid sibling is required, avoiding the iOS 26 title bug.
      expect(largeTitleBar(colors.sunken, solid)).toMatchObject({
        headerStyle: {},
        headerLargeStyle: {},
        headerTransparent: true,
      });
      expect(inline).not.toHaveProperty('headerBackground');
      expect(inline).not.toHaveProperty('headerBlurEffect');
    }
    act(() => listeners.get('reduceTransparencyChanged')!(true));
    jest.replaceProperty(Platform, 'OS', 'android');
    act(() => tree.update(<Probe />));
    expect(solid).toBe(false);
    expect(scrollBar(colors.sunken, true)).toEqual(opaqueBar(colors.sunken));
  } finally {
    act(() => tree.unmount());
    Object.defineProperty(Platform, 'Version', version);
    jest.replaceProperty(Platform, 'OS', 'ios');
  }
});
