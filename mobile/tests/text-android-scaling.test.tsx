import { act } from 'react';
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text as NativeText,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { LINE_HEIGHT_NUDGE, Text } from '../src/design/text';
import { textStyles } from '../src/design/tokens';

// Stand in for native SP conversion, not PixelRatio's global configuration.
// Larger SP sizes grow less; the inverse also matters after each fitting step.
jest.mock('../modules/opax-text-metrics', () => ({
  spToDp: (sp: number, fontScale: number) => {
    const largeScale = 1 + (fontScale - 1) / 3;
    if (sp <= 14) return sp * fontScale;
    if (sp >= 28) return sp * largeScale;
    return 14 * fontScale + (sp - 14) * (2 * largeScale - fontScale);
  },
  dpToSp: (dp: number, fontScale: number) => {
    const largeScale = 1 + (fontScale - 1) / 3;
    if (dp <= 14 * fontScale) return dp / fontScale;
    if (dp >= 28 * largeScale) return dp / largeScale;
    return 14 + (dp - 14 * fontScale) / (2 * largeScale - fontScale);
  },
}));

test.each([1.3, 1.5, 2])(
  'Android nonlinear %s fits fresh lines and rejects stale steps through current props',
  (fontScale) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    const { spToDp } = jest.requireMock('../modules/opax-text-metrics');
    let renderer!: TestRenderer.ReactTestRenderer;
    try {
      act(() =>
        Dimensions.set({
          window: { ...window, fontScale },
          screen: { ...screen, fontScale },
        }),
      );
      act(() => {
        renderer = TestRenderer.create(
          <Text
            wordSafe
            variant="sectionTitle"
            accessibilityRole="header"
            accessibilityLanguage="en-AU"
          >
            Representation
          </Text>,
        );
      });
      const text = () => renderer.root.findByType(NativeText);
      const original = text();
      const base = textStyles.sectionTitle.lineHeight + LINE_HEIGHT_NUDGE;
      const size = () => StyleSheet.flatten(text().props.style).fontSize;
      const layout = (height: number, broken: boolean) =>
        act(() => {
          text().props.onLayout({
            nativeEvent: { layout: { width: 200, height: 2 * height } },
          });
          text().props.onTextLayout({
            nativeEvent: {
              lines: broken
                ? [
                    { text: 'Representatio', width: 198, height },
                    { text: 'n', width: 14, height },
                  ]
                : [{ text: 'Representation', width: 195, height }],
            },
          });
        });
      const fullHeight = spToDp(base, fontScale);
      layout(fullHeight, true);
      expect(size()).toBeLessThan(textStyles.sectionTitle.fontSize);
      const firstCap = size();
      layout(fullHeight, true); // queued full-size event dispatched to CURRENT props
      expect(size()).toBe(firstCap);
      const cappedHeight = spToDp(
        StyleSheet.flatten(text().props.style).lineHeight,
        fontScale,
      );
      layout(cappedHeight, true);
      if (cappedHeight / base > 1.01) expect(size()).toBeLessThan(firstCap);
      else expect(size()).toBe(firstCap); // Never shrink below the default role.
      layout(
        spToDp(StyleSheet.flatten(text().props.style).lineHeight, fontScale),
        false,
      );
      expect(text()).toBe(original);
      expect(text().props).toMatchObject({
        accessibilityRole: 'header',
        accessibilityLanguage: 'en-AU',
      });
    } finally {
      act(() => {
        renderer?.unmount();
        Dimensions.set({ window, screen });
      });
      Object.defineProperty(Platform, 'OS', descriptor);
    }
  },
);

describe('a maxFontSizeMultiplier cap', () => {
  function drawn(os: 'android' | 'ios', fontScale: number) {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    let renderer!: TestRenderer.ReactTestRenderer;
    try {
      act(() =>
        Dimensions.set({
          window: { ...window, fontScale },
          screen: { ...screen, fontScale },
        }),
      );
      act(() => {
        renderer = TestRenderer.create(
          <Text variant="secondary" maxFontSizeMultiplier={1.353}>
            The Senate next sits Monday 16 November
          </Text>,
        );
      });
      const text = renderer.root.findByType(NativeText);
      return {
        native: text.props.maxFontSizeMultiplier as number,
        style: StyleSheet.flatten(text.props.style),
      };
    } finally {
      act(() => {
        renderer?.unmount();
        Dimensions.set({ window, screen });
      });
      Object.defineProperty(Platform, 'OS', descriptor);
    }
  }
  const role = textStyles.secondary;
  const base = role.lineHeight + LINE_HEIGHT_NUDGE;

  test('on Android at 2.0 caps the line height with the font size, from the role', () => {
    const { spToDp } = jest.requireMock('../modules/opax-text-metrics');
    const { native, style } = drawn('android', 2);
    // Folded into the role's size, so the native cap is not applied twice.
    expect(native).toBe(0);
    // The drawn line height is the role's at the cap, not at 2.0.
    expect(spToDp(style.lineHeight, 2)).toBeCloseTo(base * 1.353, 5);
    // Size and leading keep the role's own ratio.
    expect(style.lineHeight! / style.fontSize!).toBeCloseTo(
      base / role.fontSize,
      5,
    );
  });

  test('on Android below the cap, and on iOS, nothing changes', () => {
    const below = drawn('android', 1.15);
    expect(below.native).toBe(1.353);
    expect(below.style.fontSize).toBe(role.fontSize);
    const ios = drawn('ios', 2);
    expect(ios.native).toBe(1.353);
    expect(ios.style.fontSize).toBe(role.fontSize);
    expect(ios.style.lineHeight).toBeCloseTo(base, 5);
  });
});
