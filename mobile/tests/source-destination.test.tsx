import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';
import { act } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
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
      <SourceDestination
        url={url}
        citation="Register of Senators’ Interests"
        dismiss={dismiss}
      />,
    );
  });
  expect(
    renderer.root.findByType(SafeAreaView).props.accessibilityViewIsModal,
  ).toBe(true);
  expect(
    StyleSheet.flatten(renderer.root.findByType(ScrollView).props.style).flex,
  ).toBe(1);
  expect(
    renderer.root
      .findAllByType(Text)
      .some(
        (node) =>
          node.props.children ===
          'Source record: Register of Senators’ Interests',
      ),
  ).toBe(true);
  const destination = renderer.root
    .findAllByType(Text)
    .find((node) => node.props.testID === 'source-destination-url')!;
  expect(destination.props.children).toBe(url);
  expect(destination.props.accessibilityLabel).toBe(url);
  expect(destination.props.numberOfLines).toBeUndefined();
  expect(destination.props.ellipsizeMode).toBeUndefined();
  // Selectable, so the exact destination can be copied, not only read.
  expect(destination.props.selectable).toBe(true);
  act(() => renderer.root.findByType(Button).props.onPress());
  expect(dismiss).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

const representatives =
  'https://raw.githubusercontent.com/openaustralia/openaustralia-parser/master/data/representatives.csv';
const citation = 'OpenAustralia parliamentary service records';

/** openSource and the page's store, from a fresh registry with this build. */
function load(build: { isE2E: boolean; hasSourcePreview: boolean }) {
  const openBrowserAsync = jest.fn(async () => ({ type: 'opened' }));
  let external!: typeof import('../src/navigation/external');
  let store!: typeof import('../src/navigation/source-destination');
  jest.isolateModules(() => {
    jest.doMock('../src/design/environment', () => ({
      ...jest.requireActual('../src/design/environment'),
      ...build,
      variant: build.isE2E ? 'e2e' : 'production',
      isProduction: !build.isE2E,
    }));
    jest.doMock('expo-web-browser', () => ({
      openBrowserAsync,
      WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
    }));
    // The real modules, wired to the mocks above.
    external = jest.requireActual<typeof import('../src/navigation/external')>(
      '../src/navigation/external',
    );
    store = jest.requireActual<
      typeof import('../src/navigation/source-destination')
    >('../src/navigation/source-destination');
  });
  return { ...external, ...store, openBrowserAsync };
}

describe('opening a source link', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => alert.mockRestore());

  test('e2e hands the source page the checked URL and its citation', async () => {
    const { openSource, sourceDestination, openBrowserAsync } = load({
      isE2E: true,
      hasSourcePreview: true,
    });
    await openSource(representatives, citation);
    // No native alert: it ends an over-long word with an ellipsis.
    expect(alert).not.toHaveBeenCalled();
    expect(openBrowserAsync).not.toHaveBeenCalled();
    expect(sourceDestination()).toEqual({ url: representatives, citation });
  });
  test('an unsafe URL still says it could not be opened, and presents nothing', async () => {
    const { openSource, sourceDestination, openBrowserAsync } = load({
      isE2E: true,
      hasSourcePreview: true,
    });
    await openSource('http://example.com/', citation);
    expect(alert).toHaveBeenCalledWith(
      'Source record',
      'This source link could not be opened.',
    );
    expect(sourceDestination()).toBeNull();
    expect(openBrowserAsync).not.toHaveBeenCalled();
  });
  test('shipping builds open the in-app browser and never present the page', async () => {
    const { openSource, sourceDestination, openBrowserAsync } = load({
      isE2E: false,
      hasSourcePreview: false,
    });
    await openSource(representatives, citation);
    expect(openBrowserAsync).toHaveBeenCalledWith(
      representatives,
      expect.objectContaining({ presentationStyle: 'pageSheet' }),
    );
    expect(sourceDestination()).toBeNull();
    expect(alert).not.toHaveBeenCalled();
  });
});
