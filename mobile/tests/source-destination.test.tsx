import { act } from 'react';
import { Alert, Text as NativeText } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SourceLink } from '../src/design/primitives';

const url =
  'https://raw.githubusercontent.com/openaustralia/openaustralia-parser/master/data/representatives.csv';
const label = 'OpenAustralia parliamentary service records';

// As in app/_layout.tsx: the page's own provider starts from these insets.
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const hosts = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
const press = (root: ReactTestInstance, testID: string) =>
  root
    .findAll(
      (node) =>
        node.props.testID === testID &&
        typeof node.props.onPress === 'function',
    )[0]!
    .props.onPress();
const text = (node: ReactTestInstance) =>
  node
    .findAllByType(NativeText)
    .map((child) => child.props.children)
    .flat()
    .filter((child) => typeof child === 'string')
    .join('');

describe('source links in e2e builds', () => {
  test('draw the whole checked URL on their own page, closed by OK', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <SourceLink
            citation={label}
            url={url}
            kind="record"
            testID="person-source"
          />
        </SafeAreaProvider>,
      );
    });
    expect(hosts(renderer.root, 'source-destination')).toHaveLength(0);
    await act(async () => {
      await press(renderer.root, 'person-source');
    });
    // No native alert: it ends an over-long word with an ellipsis.
    expect(alert).not.toHaveBeenCalled();
    const [shown] = renderer.root.findAll(
      (node) =>
        node.type === NativeText &&
        node.props.testID === 'source-destination-url',
    );
    expect(shown!.props.children).toBe(url);
    expect(shown!.props.selectable).toBe(true);
    expect(shown!.props.numberOfLines).toBeUndefined();
    expect(shown!.props.ellipsizeMode).toBeUndefined();
    const [page] = hosts(renderer.root, 'source-destination');
    expect(text(page!)).toContain(`Source record: ${label}`);
    await act(async () => {
      press(renderer.root, 'source-destination-ok');
    });
    expect(hosts(renderer.root, 'source-destination')).toHaveLength(0);
    alert.mockRestore();
  });
  test('an unsafe URL still says it could not be opened', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SourceLink
          citation={label}
          url="http://example.com/"
          kind="record"
          testID="person-source"
        />,
      );
    });
    await act(async () => {
      await press(renderer.root, 'person-source');
    });
    expect(alert).toHaveBeenCalledWith(
      'Source record',
      'This source link could not be opened.',
    );
    expect(hosts(renderer.root, 'source-destination')).toHaveLength(0);
    alert.mockRestore();
  });
});

describe('source links in shipping builds', () => {
  test('open the in-app browser and never draw the e2e page', async () => {
    const openBrowserAsync = jest.fn(async () => ({ type: 'opened' }));
    const show = jest.fn();
    let openSource!: typeof import('../src/navigation/external').openSource;
    jest.isolateModules(() => {
      jest.doMock('../src/design/environment', () => ({
        ...jest.requireActual('../src/design/environment'),
        variant: 'production',
        isE2E: false,
        isProduction: true,
      }));
      jest.doMock('expo-web-browser', () => ({
        openBrowserAsync,
        WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
      }));
      // The real module, wired to the mocks above.
      ({ openSource } = jest.requireActual<
        typeof import('../src/navigation/external')
      >('../src/navigation/external'));
    });
    await openSource(url, label, show);
    expect(show).not.toHaveBeenCalled();
    expect(openBrowserAsync).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ presentationStyle: 'pageSheet' }),
    );
  });
});
