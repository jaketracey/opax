import { act } from 'react';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/design/controls';
import { Text } from '../src/design/text';
import { SourceDestination } from '../src/navigation/SourceDestination';
import { presentSourceDestination } from '../src/navigation/source-destination';

// Native presentation is covered by the device journey. Keep this unit test
// on the modal boundary; RN's actual bridge requires the Hermes WASM parser.
jest.mock('react-native/Libraries/Modal/Modal', () => ({
  __esModule: true,
  default: 'Modal',
}));

test('the local destination keeps the complete URL in bounded scrolling content and dismisses independently', () => {
  const url =
    'https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Senators_Interests/Senators_Interests_Register/123072';
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<SourceDestination />);
  });
  expect(renderer.toJSON()).toBeNull();
  act(() => presentSourceDestination(url));
  expect(renderer.root.findByType(Modal).props.presentationStyle).toBe(
    'fullScreen',
  );
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
  expect(renderer.toJSON()).toBeNull();
  act(() => renderer.unmount());
});
