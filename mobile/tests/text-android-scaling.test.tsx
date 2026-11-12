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
