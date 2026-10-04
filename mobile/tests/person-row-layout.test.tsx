import { act } from 'react';
import {
  StyleSheet,
  Text as NativeText,
  useWindowDimensions,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { PersonRow } from '../src/design/people';
import { Text } from '../src/design/text';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Include the 16e's 3x screen and every accessibility size, plus standard.
test.each([1, 1.786, 2.143, 2.643, 3.143, 3.571])(
  'representative name has no line or height cap at font scale %s',
  (fontScale) => {
    jest.mocked(useWindowDimensions).mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale,
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <PersonRow
          name="Anthony Albanese"
          party="Labor"
          partyStatus="current"
          place="Member for Grayndler · House of Representatives · New South Wales"
          detail="As at 4 September 2026"
          testID="electorate-member-anthony-albanese"
          onPress={() => undefined}
        />,
      );
    });
    const name = renderer.root
      .findAllByType(NativeText)
      .find(
        (node) =>
          node.props.testID === 'electorate-member-anthony-albanese-name',
      )!;
    expect(name.props.children).toBe('Anthony Albanese');
    expect(name.props.numberOfLines).toBeUndefined();
    expect(name.props.adjustsFontSizeToFit).toBeUndefined();
    expect(name.props.allowFontScaling).toBe(true);
    expect(StyleSheet.flatten(name.props.style).flexShrink).toBe(0);
    const opaxText = renderer.root
      .findAllByType(Text)
      .find((node) => node.props.testID === name.props.testID)!;
    expect(opaxText.props.wordSafe).toBe(true);
    // Walk the real rendered name containers, excluding the decorative portrait.
    for (let node = name; node; node = node.parent!) {
      if (typeof node.props.style === 'function') continue;
      const style = StyleSheet.flatten(node.props.style) ?? {};
      expect(style.height).toBeUndefined();
      expect(style.maxHeight).toBeUndefined();
    }
    const column = renderer.root.find(
      (node) =>
        typeof node.type === 'string' &&
        StyleSheet.flatten(node.props.style)?.alignSelf === 'stretch',
    );
    let main = column.parent!;
    while (!StyleSheet.flatten(main.props.style)?.flexDirection)
      main = main.parent!;
    expect(StyleSheet.flatten(main.props.style).flexDirection).toBe(
      fontScale === 1 ? 'row' : 'column',
    );
    expect(StyleSheet.flatten(column.props.style).flex).toBe(
      fontScale === 1 ? 1 : undefined,
    );
    act(() => renderer.unmount());
  },
);

test('word-safe text keeps the fractional AX5 final line inside its rounded drawing frame', () => {
  jest.mocked(useWindowDimensions).mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 3.571,
  });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Text wordSafe>Anthony Albanese</Text>);
  });
  const name = () => renderer.root.findByType(NativeText);
  const layout = (height: number) =>
    act(() =>
      name().props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 298, height } },
      }),
    );
  layout(141);
  expect(StyleSheet.flatten(name().props.style).minHeight).toBe(142);
  layout(142);
  expect(StyleSheet.flatten(name().props.style).minHeight).toBe(142);
  expect(StyleSheet.flatten(name().props.style).height).toBeUndefined();
  expect(StyleSheet.flatten(name().props.style).maxHeight).toBeUndefined();
  // A smaller Dynamic Type setting must measure afresh rather than retain
  // the larger name's minimum height.
  jest.mocked(useWindowDimensions).mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 1,
  });
  act(() => renderer.update(<Text wordSafe>Anthony Albanese</Text>));
  expect(StyleSheet.flatten(name().props.style).minHeight).toBeUndefined();
  layout(25);
  expect(StyleSheet.flatten(name().props.style).minHeight).toBe(26);
  act(() => renderer.unmount());
});
