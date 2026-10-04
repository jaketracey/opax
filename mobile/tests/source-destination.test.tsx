import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';
import { act } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/design/controls';
import { Text } from '../src/design/text';
import { SourceDestination } from '../src/navigation/SourceDestination';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

test('the local destination keeps the complete URL in bounded scrolling content and dismisses independently', () => {
  const url =
    'https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Senators_Interests/Senators_Interests_Register/123072';
  let renderer!: TestRenderer.ReactTestRenderer;
  const dismiss = jest.fn();
  act(() => {
    renderer = TestRenderer.create(
      <SourceDestination url={url} dismiss={dismiss} />,
    );
  });
  expect(
    renderer.root.findByType(SafeAreaView).props.accessibilityViewIsModal,
  ).toBe(true);
  expect(
    StyleSheet.flatten(renderer.root.findByType(ScrollView).props.style).flex,
  ).toBe(1);
  const destination = renderer.root
    .findAllByType(Text)
    .find((node) => node.props.testID === 'source-destination-url')!;
  expect(destination.props.children).toBe(url);
  expect(destination.props.accessibilityLabel).toBe(url);
  expect(destination.props.numberOfLines).toBeUndefined();
  act(() => renderer.root.findByType(Button).props.onPress());
  expect(dismiss).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});
