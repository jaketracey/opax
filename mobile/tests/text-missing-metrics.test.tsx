import { requireOptionalNativeModule } from 'expo';
import { act } from 'react';
import { Dimensions, StyleSheet, Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { breaksMidWord, Text } from '../src/design/text';
import { textStyles } from '../src/design/tokens';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn(() => null) }));
jest.mock('expo-router', () => ({}));
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: {
    OS: 'android',
    Version: 34,
    select: (values: { android?: unknown; default?: unknown }) =>
      values.android ?? values.default,
  },
}));

test('missing native metrics at 200% still fits whole words without replacing the accessibility element', () => {
  const window = Dimensions.get('window');
  const screen = Dimensions.get('screen');
  let renderer!: TestRenderer.ReactTestRenderer;
  // Simulate native nonlinear conversion independently of the absent bridge.
  const toDp = (sp: number) =>
    sp <= 14 ? sp * 2 : sp >= 28 ? (sp * 4) / 3 : 28 + ((sp - 14) * 2) / 3;
  try {
    act(() =>
      Dimensions.set({
        window: { ...window, fontScale: 2 },
        screen: { ...screen, fontScale: 2 },
      }),
    );
    act(() => {
      renderer = TestRenderer.create(
        <Text
          wordSafe
          variant="sectionTitle"
          accessibilityRole="header"
          accessibilityLabel="Representation"
          accessibilityLanguage="en-AU"
        >
          Representation
        </Text>,
      );
    });
    const text = () => renderer.root.findByType(NativeText);
    const original = text();
    const style = () => StyleSheet.flatten(text().props.style);
    const role = textStyles.sectionTitle;
    const layout = () => {
      const width = (212 * toDp(style().fontSize)) / toDp(role.fontSize);
      const height = toDp(style().lineHeight);
      return width > 200
        ? [
            { text: 'Representatio', width: 198, height },
            { text: 'n', width: 14, height },
          ]
        : [{ text: 'Representation', width, height }];
    };
    const lines = (value = layout()) =>
      act(() => text().props.onTextLayout({ nativeEvent: { lines: value } }));
    const frame = () =>
      act(() =>
        text().props.onLayout({
          nativeEvent: {
            layout: { width: 200, height: 2 * toDp(style().lineHeight) },
          },
        }),
      );
    expect(requireOptionalNativeModule).toHaveBeenCalledWith('OpaxTextMetrics');
    lines(); // No current frame yet: even fallback must not fit these lines.
    expect(style().fontSize).toBe(role.fontSize);
    lines([
      {
        text: 'An earlier heading',
        width: 198,
        height: toDp(style().lineHeight),
      },
    ]);
    frame(); // A queued layout for another content identity must not fit it.
    expect(style().fontSize).toBe(role.fontSize);
    lines();
    const firstStep = style().fontSize;
    expect(firstStep).toBeLessThan(role.fontSize);
    expect(breaksMidWord(layout())).toBe(true); // One shrink is not enough.
    frame();
    lines();
    expect(style().fontSize).toBeLessThan(firstStep);
    expect(breaksMidWord(layout())).toBe(false);
    frame();
    const fitted = style().fontSize;
    lines();
    expect(style().fontSize).toBe(fitted);
    expect(text()).toBe(original);
    expect(text().props).toMatchObject({
      accessibilityRole: 'header',
      accessibilityLabel: 'Representation',
      accessibilityLanguage: 'en-AU',
    });
  } finally {
    act(() => {
      renderer?.unmount();
      Dimensions.set({ window, screen });
    });
  }
});
