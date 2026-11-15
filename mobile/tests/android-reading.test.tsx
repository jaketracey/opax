import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  FlatList,
  Platform,
  StyleSheet,
  Text as NativeText,
} from 'react-native';
import { Text } from '../src/design/text';
import { ReaderList } from '../src/features/records/ReaderList';
import { textChunks } from '../src/features/records/model';

test.each(['android', 'ios'] as const)(
  '%s reading keeps scaling and selectable text, with platform-specific layout work',
  (platform) => {
    const original = Platform.OS;
    let text!: TestRenderer.ReactTestRenderer;
    let reader!: TestRenderer.ReactTestRenderer;
    try {
      Object.defineProperty(Platform, 'OS', {
        value: platform,
        configurable: true,
      });
      act(() => {
        text = TestRenderer.create(<Text selectable>Full source text</Text>);
        reader = TestRenderer.create(
          <ReaderList header={null} parts={[]} testID="reader" />,
        );
      });
      const native = text.root.findByType(NativeText);
      expect(native.props.allowFontScaling).toBe(true);
      expect(native.props.selectable).toBe(true);
      if (platform === 'android') expect(native.props.onLayout).toBeUndefined();
      else {
        act(() =>
          native.props.onLayout({
            nativeEvent: { layout: { width: 300, height: 24 } },
          }),
        );
        expect(
          StyleSheet.flatten(text.root.findByType(NativeText).props.style)
            .minHeight,
        ).toBe(25);
      }
      const list = reader.root.findByType(FlatList);
      expect(list.props.initialNumToRender).toBe(
        platform === 'android' ? 1 : 4,
      );
      expect(list.props.maxToRenderPerBatch).toBe(
        platform === 'android' ? 2 : 4,
      );
      expect(list.props.removeClippedSubviews).toBe(false);
    } finally {
      if (text) act(() => text.unmount());
      if (reader) act(() => reader.unmount());
      Object.defineProperty(Platform, 'OS', {
        value: original,
        configurable: true,
      });
    }
  },
);

test('smaller Android source slices preserve the entire long record including whitespace', () => {
  const source = (
    'A synthetic paragraph for rendering measurements.\n\n' +
    'The words and spaces stay in source order. '
  ).repeat(300);
  expect(textChunks(source, 600).join('')).toBe(source);
  expect(textChunks(source, 600).length).toBeGreaterThan(
    textChunks(source, 1200).length,
  );
});
