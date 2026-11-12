import { act } from 'react';
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text as NativeText,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Text } from '../src/design/text';

test.each([
  [false, 'up', 1, 3.571, 25, 141],
  [true, 'up', 1, 3.571, 25, 141],
  [false, 'down', 3.571, 1, 141, 25],
  [true, 'down', 3.571, 1, 141, 25],
] as const)(
  'iOS wordSafe=%s text size %s rejects a queued floor from the previous identity',
  (wordSafe, _direction, from, to, staleHeight, freshHeight) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    const size = (fontScale: number) =>
      act(() =>
        Dimensions.set({
          window: { ...window, fontScale },
          screen: { ...screen, fontScale },
        }),
      );
    let renderer!: TestRenderer.ReactTestRenderer;
    try {
      size(from);
      act(() => {
        renderer = TestRenderer.create(
          <Text
            wordSafe={wordSafe}
            accessibilityRole="header"
            accessibilityLabel="A heading"
            accessibilityLanguage="en-AU"
          >
            Example heading
          </Text>,
        );
      });
      const text = () => renderer.root.findByType(NativeText);
      const original = text();
      const floor = () => StyleSheet.flatten(text().props.style).minHeight;
      // Every queued event goes through the current callback, just like Fabric.
      const frame = (height: number) =>
        act(() =>
          text().props.onLayout({
            nativeEvent: { layout: { width: 298, height } },
          }),
        );
      const callbacks: ((
        x: number,
        y: number,
        width: number,
        height: number,
      ) => void)[] = [];
      text().instance.measure = jest.fn((callback) => callbacks.push(callback));
      frame(staleHeight);
      expect(floor()).toBe(staleHeight + 1);
      size(to);
      frame(staleHeight); // queued frame dispatched after the new size committed
      frame(freshHeight);
      // Neither frame carries proof of which identity produced it.
      expect(floor()).toBeUndefined();
      act(() => callbacks.shift()?.(0, 0, 298, freshHeight));
      expect(floor()).toBe(freshHeight + 1);
      frame(staleHeight); // even a later stale frame cannot replace the verified floor
      expect(floor()).toBe(freshHeight + 1);
      expect(text()).toBe(original);
      expect(text().props).toMatchObject({
        accessibilityRole: 'header',
        accessibilityLabel: 'A heading',
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
