import { act } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { yourMpScreens } from '../src/navigation/stack/your-mp';
import { BarTitle, emptyBarTitle } from '../src/navigation/useTitleOnScroll';

// Build 82, the closed iPhone Duo: a profile opened a title band's height
// (58 pt) high on its skeleton and dropped when the loaded page installed its
// title. The band is now its final height from the first frame.

let mockBarEdge: 'unspecified' | 'leading' | 'trailing' = 'unspecified';
jest.mock('../modules/opax-root-bar', () => ({
  RootBar: null,
  useVerticalBarEdge: () => mockBarEdge,
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), setParams: jest.fn() },
  useNavigation: () => ({ setParams: jest.fn(), setOptions: jest.fn() }),
  useIsFocused: () => true,
  Stack: { Screen: () => null },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const window = (width: number) =>
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width, height: 678, scale: 3, fontScale: 1 });

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  window(466);
});
afterEach(() => {
  mockBarEdge = 'unspecified';
  jest.restoreAllMocks();
});

/** The line box UIKit sizes the rail's title band to. */
function lineBox(element: React.ReactElement, testID: string) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  const text = renderer.root.findAll(
    (node) => node.type === Text && node.props.testID === testID,
  )[0];
  const box = text && {
    lines: text.props.numberOfLines,
    cap: text.props.maxFontSizeMultiplier,
    fontSize: StyleSheet.flatten(text.props.style).fontSize,
    lineHeight: StyleSheet.flatten(text.props.style).lineHeight,
    fontFamily: StyleSheet.flatten(text.props.style).fontFamily,
  };
  act(() => renderer.unmount());
  return box;
}

describe('a page that opens before its title is known', () => {
  test('beside a vertical bar its empty title holds the same line as the title that follows, so the band does not grow', () => {
    mockBarEdge = 'trailing';
    const before = lineBox(emptyBarTitle(), 'bar-title-empty');
    const after = lineBox(
      <BarTitle title="Anthony Albanese" shown={false} />,
      'bar-title',
    );
    expect(before).toBeDefined();
    expect(before).toEqual(after);
  });

  test('the empty title draws nothing and is hidden from VoiceOver', () => {
    mockBarEdge = 'trailing';
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(emptyBarTitle());
    });
    const text = renderer.root.findByProps({ testID: 'bar-title-empty' });
    expect(StyleSheet.flatten(text.props.style).opacity).toBe(0);
    expect(text.props.accessibilityElementsHidden).toBe(true);
    expect(text.props.importantForAccessibility).toBe('no-hide-descendants');
    act(() => renderer.unmount());
  });

  test('on iPhone and iPad the empty title is still an empty view', () => {
    expect(lineBox(emptyBarTitle(), 'bar-title-empty')).toBeUndefined();
  });
});

// Members and Election name their bar once loaded, as a profile does.
test.each(['members', 'election'])(
  '%s opens with the empty title, which holds the band beside the rail',
  (name) => {
    const screen = yourMpScreens().find((s) => s.props.name === name)!;
    const routes = [
      { key: 'root', name: 'your-mp' },
      { key: 'page', name },
    ];
    const navigation = { getState: () => ({ index: 1, routes }) };
    const options =
      typeof screen.props.options === 'function'
        ? screen.props.options({ route: routes[1], navigation })
        : screen.props.options;
    expect(options.headerTitle).toBe(emptyBarTitle);
    mockBarEdge = 'trailing';
    expect(lineBox(options.headerTitle(), 'bar-title-empty')).toBeDefined();
  },
);
