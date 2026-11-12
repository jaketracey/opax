import { act } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { SectionHeader } from '../src/design/layout';
import { SourceAffordance, SourceLine } from '../src/design/source';
import { Heading, Text } from '../src/design/text';
import {
  isAccessibilityCategory,
  minimumTarget,
  rhythm,
  textStyles,
} from '../src/design/tokens';
import { TodayBlock } from '../src/features/today/TodayBlock';

beforeEach(() => {
  jest
    .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
});
afterEach(() => jest.mocked(useWindowDimensions).mockRestore());

function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <TodayBlock
        title="Records"
        action={{ accessibilityLabel: 'See all records', onPress: jest.fn() }}
        state={{ kind: 'ready', data: 'The record' }}
        skeleton={<View />}
        line={{ citation: 'Public register' }}
        error="Records could not be loaded."
        testID="today-records"
      >
        {(data) => <Text testID="group">{data}</Text>}
      </TodayBlock>,
    );
  });
  return tree.root;
}

test('Today: header text to group is 8 pt while See all keeps its 44 pt target', () => {
  const root = render();
  const header = root.findByType(SectionHeader);
  const band = header.findByType(View);
  const heading = header.findByType(Heading);
  act(() =>
    heading.props.onLayout({ nativeEvent: { layout: { height: 26 } } }),
  );
  expect(header.props.compact).toBe(true);
  expect(StyleSheet.flatten(band.props.style).minHeight).toBe(0);
  const action = header.find(
    (node) =>
      node.props.accessibilityLabel === 'See all records' &&
      typeof node.props.style === 'function',
  );
  const target = StyleSheet.flatten(action.props.style({ pressed: false }));
  expect(target.minHeight).toBe(44);
  expect(target.minHeight + 2 * Number(target.marginVertical)).toBe(26);
  const container = root
    .findAllByProps({ testID: 'today-records' })
    .find((node) => node.type === View)!;
  expect(StyleSheet.flatten(container.props.style).gap).toBe(8);
});

test('Today at an accessibility text size: the stacked header keeps its -8 pt margin to the group', () => {
  const fontScale = 3.1; // AX5
  expect(isAccessibilityCategory(fontScale)).toBe(true);
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale });
  const root = render();
  const header = root.findByType(SectionHeader);
  expect(header.props.compact).toBe(true);
  const band = StyleSheet.flatten(header.findByType(View).props.style);
  expect(rhythm.heading - rhythm.block).toBe(-8);
  expect(band.marginBottom).toBe(-8);
  expect(band.minHeight).toBeUndefined();
  // The same as an uncompacted header at this size.
  let plain!: TestRenderer.ReactTestRenderer;
  act(() => {
    plain = TestRenderer.create(
      <SectionHeader
        title="Records"
        action={{ accessibilityLabel: 'See all records', onPress: jest.fn() }}
      />,
    );
  });
  expect(band).toEqual(
    StyleSheet.flatten(plain.root.findByType(View).props.style),
  );
  // The stacked See all keeps its full target with no negative margin.
  const action = header.find(
    (node) =>
      node.props.accessibilityLabel === 'See all records' &&
      typeof node.props.style === 'function',
  );
  const target = StyleSheet.flatten(action.props.style({ pressed: false }));
  expect(target.minHeight).toBe(minimumTarget);
  expect(target.marginVertical).toBeUndefined();
});

test.each([18, 36, 60])(
  'Today: source text is 24 pt under its group at text height %i',
  (height) => {
    const root = render();
    const source = root.findByType(SourceLine);
    expect(source.props.overlap).toBe(true);
    const affordance = source.findByType(SourceAffordance);
    const text = affordance.findByType(Text);
    act(() =>
      text.props.onTextLayout({ nativeEvent: { lines: [{ height }] } }),
    );
    const target = affordance.find(
      (node) => typeof node.props.style === 'function',
    );
    const style = StyleSheet.flatten(target.props.style({ pressed: false }));
    const gap = Number(StyleSheet.flatten(source.parent!.props.style).gap);
    expect(gap).toBe(24);
    expect(gap + Number(style.marginTop) + Number(style.paddingVertical)).toBe(
      24,
    );
    expect(style.minHeight).toBe(minimumTarget);
  },
);

test('shared header and source defaults retain the existing spacing', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <View>
        <SectionHeader title="Records" />
        <SourceLine citation="Public register" />
      </View>,
    );
  });
  expect(
    StyleSheet.flatten(
      tree.root.findByType(SectionHeader).findByType(View).props.style,
    ).minHeight,
  ).toBe(44);
  const source = tree.root.findByType(SourceAffordance);
  const target = source.find((node) => typeof node.props.style === 'function');
  const style = StyleSheet.flatten(target.props.style({ pressed: false }));
  expect(style.minHeight).toBe(44);
  expect(style.marginTop).toBeUndefined();
  expect(style.paddingVertical).toBeUndefined();
  expect(textStyles.footnote.lineHeight).toBeGreaterThan(0);
});
