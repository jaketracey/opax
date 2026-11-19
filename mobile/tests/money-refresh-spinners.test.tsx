// Pull to refresh on the public money pages (build 92 follow-up to the dark
// mode review of Money). Four controls never set a tint, so iOS drew its own
// grey spinner in light. Dark mode gave them the shared refresh colours,
// which turned that spinner navy. They take only the Android arrow and disc
// now: iOS light is as it was, and its spinner follows dark by itself.
import { act, isValidElement, type ReactElement } from 'react';
import {
  Appearance,
  Platform,
  RefreshControl,
  type RefreshControlProps,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { dark, light } from '../src/design/palette';
import { colors } from '../src/design/tokens';
import Connection from '../src/features/money-public/Connection';
import FundingBySeatType from '../src/features/money-public/FundingBySeatType';
import MoneyItem from '../src/features/money-public/MoneyItem';
import {
  MoneyList,
  useRefreshColours,
  useRefreshDiscColours,
} from '../src/features/money-public/parts';

const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  const Wrap = (props: object) => React.createElement(View, props);
  return {
    Link: Object.assign(Wrap, {
      Trigger: Wrap,
      Preview: () => null,
      Menu: Wrap,
      MenuAction: Wrap,
    }),
    Redirect: () => null,
    useRouter: () => ({ push: jest.fn() }),
    useNavigation: () => ({ setParams: jest.fn() }),
    useSegments: () => [],
    useLocalSearchParams: () => mockParams,
    router: { push: jest.fn(), setParams: jest.fn(), dismissTo: jest.fn() },
    Stack: { Screen: () => null },
  };
});
jest.mock('@shopify/react-native-skia', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Canvas: require('react-native').View,
  Rect: () => null,
}));
// No read settles: each page stays in its loading state, which already
// carries its pull to refresh.
const mockPending = () => new Promise(() => {});
jest.mock('../src/api/runtime', () => ({
  catalogs: { discovery: () => mockPending(), directory: () => mockPending() },
  apiClient: { get: () => mockPending() },
}));
jest.mock('../src/features/money-public/runtime', () => ({
  money: new Proxy({}, { get: () => () => mockPending() }),
}));
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));

const os = Platform.OS;
function system(platform: 'ios' | 'android', scheme: 'light' | 'dark') {
  Platform.OS = platform;
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(scheme);
}
afterEach(() => {
  jest.restoreAllMocks();
  Platform.OS = os;
  Object.keys(mockParams).forEach((key) => delete mockParams[key]);
});

const pages: [string, () => ReactElement, Record<string, string>][] = [
  ['a connection', () => <Connection />, { id: 'fixture-connection' }],
  ['Funding by seat type', () => <FundingBySeatType />, {}],
  [
    'a money item',
    () => <MoneyItem />,
    { kind: 'grant', jur: 'federal', program: 'go3141', id: 'fixture-grant' },
  ],
  [
    'a money list',
    () => (
      <MoneyList
        rows={[]}
        rowKey={(row: string) => row}
        render={() => null}
        header={null}
        refreshing={false}
        refresh={() => undefined}
        id="fixture-list"
        loaded={false}
      />
    ),
    {},
  ],
];

/** The props of each pull to refresh on the page, as the page wrote them. */
async function refreshProps(
  page: () => ReactElement,
  params: Record<string, string>,
) {
  Object.assign(mockParams, params);
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(page());
  });
  const controls = tree.root
    .findAll((node) => isValidElement(node.props.refreshControl))
    .map((node) => node.props.refreshControl as ReactElement)
    .filter((control) => control.type === RefreshControl);
  expect(controls.length).toBeGreaterThan(0);
  const props = controls.map((control) => control.props as RefreshControlProps);
  await act(async () => tree.unmount());
  return props;
}

describe.each(pages)('pull to refresh on %s', (_name, page, params) => {
  test.each(['light', 'dark'] as const)(
    'iOS in %s sets no tint, so the system draws its own spinner',
    async (scheme) => {
      system('ios', scheme);
      for (const props of await refreshProps(page, params)) {
        expect('tintColor' in props).toBe(false);
        expect(typeof props.onRefresh).toBe('function');
      }
    },
  );

  test.each([
    ['light', light],
    ['dark', dark],
  ] as const)(
    'Android in %s keeps the navy arrow on the raised disc',
    async (scheme, palette) => {
      system('android', scheme);
      for (const props of await refreshProps(page, params)) {
        expect(props.colors).toEqual([palette.navy]);
        expect(props.progressBackgroundColor).toBe(palette.raised);
        expect('tintColor' in props).toBe(false);
      }
    },
  );
});

test('the two hooks: one tints the iOS spinner navy, the other leaves it alone', () => {
  // The donations screens (the money record, the Money tab) were navy before
  // dark mode and still are.
  system('ios', 'light');
  const seen: Record<string, unknown>[] = [];
  function Probe() {
    seen.push(useRefreshColours(), useRefreshDiscColours());
    return null;
  }
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<Probe />);
  });
  expect(seen[0]).toEqual({
    tintColor: colors.navy,
    colors: [colors.navy],
    progressBackgroundColor: colors.raised,
  });
  expect(seen[1]).toEqual({
    colors: [colors.navy],
    progressBackgroundColor: colors.raised,
  });
  act(() => tree.unmount());
});
