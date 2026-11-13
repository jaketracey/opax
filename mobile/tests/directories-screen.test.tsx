import { withNavigationOptions } from './navigation-options';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { Text as NativeText, StyleSheet } from 'react-native';
import { Icon } from '../src/design/icon';
import { index } from './pinned';
import { router } from 'expo-router';
import DirectoryScreen from '../src/features/directories/DirectoryScreen';
import { ContentUnavailable, SourceLine } from '../src/design/primitives';
import { ApiError } from '../src/api/errors';
import {
  loadDirectory,
  type DirectoryRecord,
} from '../src/features/directories/data';
import { filterStore } from '../src/features/sheets/filter-model';
import { peopleScreens } from '../src/navigation/stack/people';
import { menuTitle } from '../src/design/menu-title';

const mockParams: Record<string, string> = { kind: 'person' };
const mockScreen: { options?: Record<string, unknown> } = {};
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const Link = ({ children }: { children: unknown }) =>
    React.createElement(React.Fragment, null, children);
  Link.Trigger = function Trigger({ children }: { children: unknown }) {
    return children;
  };
  Link.Preview = function Preview() {
    return null;
  };
  Link.Menu = function Menu() {
    return null;
  };
  Link.MenuAction = function MenuAction() {
    return null;
  };
  return {
    useLocalSearchParams: () => mockParams,
    router: { push: jest.fn(), setParams: jest.fn() },
    Stack: {
      Screen: ({ options }: { options: Record<string, unknown> }) => {
        mockScreen.options = options;
        return null;
      },
    },
    Link,
  };
});
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('../src/features/directories/data', () => ({
  loadDirectory: jest.fn(),
}));
jest.mock('../src/features/CachedPortrait', () => ({
  CachedPortrait: () => null,
}));
// The iPad detail pane draws the native record screens (and their data).
jest.mock('../src/features/split/RecordDetail', () => ({
  RecordDetail: () => null,
  RecordShare: () => null,
}));

const empty: DirectoryRecord = {
  people: [],
  parties: [],
  electorates: [],
  facets: [],
  stale: false,
  savedAt: 1,
  partial: false,
  sources: [{ label: 'OPAX parliamentary roster', asAt: '2026-09-04' }],
};
const party = (name: string) => ({
  key: name,
  name,
  speeches: 1,
  members: 2,
  money: {},
  total: 0,
});
const parties = { ...empty, parties: [party('Labor'), party('Greens')] };
async function search(text: string) {
  await act(async () =>
    (
      mockScreen.options!.headerSearchBarOptions as {
        onChangeText: (e: { nativeEvent: { text: string } }) => void;
      }
    ).onChangeText({ nativeEvent: { text } }),
  );
  // The query settles after a short debounce.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
}
const byID = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n) => n.props.testID === id && typeof n.type !== 'string');
const said = (node: TestRenderer.ReactTestInstance) =>
  node
    .findAllByType(NativeText)
    .map((n) => [n.props.children].flat(3).join(''))
    .join(' ');
async function open(kind: string, record: DirectoryRecord) {
  mockParams.kind = kind;
  jest.mocked(loadDirectory).mockResolvedValue(record);
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      withNavigationOptions(<DirectoryScreen />, (options) => {
        mockScreen.options = options;
      }),
    );
  });
  return renderer;
}
afterEach(() => {
  act(() => {
    for (const kind of ['person', 'party', 'electorate'])
      filterStore('directory', kind)?.set({});
  });
  for (const key of Object.keys(mockParams)) delete mockParams[key];
});

test('a directory-kind deep link starts a blank query and waits for that kind’s record', async () => {
  let resolveParty!: (record: DirectoryRecord) => void;
  jest.mocked(loadDirectory).mockImplementation((kind) =>
    kind === 'party'
      ? new Promise((resolve) => {
          resolveParty = resolve;
        })
      : Promise.resolve(empty),
  );
  mockParams.kind = 'person';
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      withNavigationOptions(<DirectoryScreen />, (options) => {
        mockScreen.options = options;
      }),
    );
  });
  expect(
    (mockScreen.options!.headerSearchBarOptions as { placeholder: string })
      .placeholder,
  ).toBe('Name, electorate or state');
  await search('Anthony Albanese');
  expect(byID(renderer, 'directory-filter-line')).not.toHaveLength(0);
  mockParams.kind = 'party';
  await act(async () =>
    renderer.update(
      withNavigationOptions(<DirectoryScreen />, (options) => {
        mockScreen.options = options;
      }),
    ),
  );
  expect(
    (mockScreen.options!.headerSearchBarOptions as { placeholder: string })
      .placeholder,
  ).toBe('Party name');
  // A fresh view: no query, no count, eight skeleton rows while loading.
  expect(byID(renderer, 'directory-filter-line')).toHaveLength(0);
  expect(byID(renderer, 'directory-count')).toHaveLength(0);
  expect(byID(renderer, 'directory-loading')).not.toHaveLength(0);
  await act(async () => resolveParty(parties));
  expect(byID(renderer, 'directory-party-labor').length).toBeGreaterThan(0);
  await act(async () => renderer.unmount());
});

test('nothing precedes the first row; source and count stay at the foot', async () => {
  const renderer = await open('party', parties);
  const list = renderer.root.find(
    (n) => n.props.testID === 'directory-party-screen' && n.props.sections,
  );
  expect(list.props.ListHeaderComponent).toBeNull();
  expect(byID(renderer, 'directory-title')).toHaveLength(0);
  expect(list.props.stickySectionHeadersEnabled).toBe(true);
  // Name order by default.
  expect(
    list.props.sections[0].data.map((p: { name: string }) => p.name),
  ).toEqual(['Greens', 'Labor']);
  expect(renderer.root.findByType(SourceLine).props.testID).toBe(
    'directory-source',
  );
  const count = renderer.root.find(
    (n) => n.props.testID === 'directory-count' && n.props.variant,
  );
  expect(count.props.variant).toBe('footnote');
  expect(count.props.wordSafe).toBe(true);
  expect(said(count)).toBe('2 parties');
  // Party rows label the sitting count explicitly.
  const row = byID(renderer, 'directory-party-labor')[0]!;
  expect(row.props.accessibilityLabel).toBe('Labor, 2 sitting members');
  expect(
    row.findAllByType(NativeText).filter((node) => node.props.children === ''),
  ).toHaveLength(0);
  const chevron = row
    .findAllByType(Icon)
    .find((icon) => icon.props.name === 'chevron.right')!;
  expect(StyleSheet.flatten(chevron.parent!.props.style).alignSelf).toBe(
    'flex-start',
  );
  await act(async () => renderer.unmount());
});

test.each([
  ['person', 'Parliamentarians', 'People'],
  ['party', 'Parties', 'Parties'],
  ['electorate', 'Electorates', 'Electorates'],
])(
  '%s shows %s as its route title and %s in the bar from first render',
  async (kind, title, headerTitle) => {
    mockParams.kind = kind;
    jest
      .mocked(loadDirectory)
      .mockReturnValue(new Promise<DirectoryRecord>(() => {}));
    const route = { key: 'directory', name: 'directory', params: { kind } };
    const navigation = {
      getState: () => ({
        index: 1,
        routes: [{ key: 'search', name: 'search' }, route],
      }),
      setOptions: (next: object) => {
        mockScreen.options = { ...mockScreen.options, ...next };
      },
      isFocused: () => true,
      addListener: () => () => {},
    };
    const registration = peopleScreens().find(
      (screen) => screen.props.name === 'directory',
    )!;
    mockScreen.options = registration.props.options({ route, navigation });
    expect(mockScreen.options).toMatchObject({
      headerBackTitle: 'Search',
      headerBackButtonDisplayMode: 'default',
      headerBackButtonMenuEnabled: true,
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={route}>
            <DirectoryScreen />
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    const list = renderer.root.find(
      (node) =>
        node.props.testID === `directory-${kind}-screen` && node.props.sections,
    );
    expect(mockScreen.options).toMatchObject({
      title,
      headerTitle,
      headerBackTitle: 'Search',
      headerBackButtonMenuEnabled: true,
      headerBackButtonDisplayMode: 'default',
    });
    expect(byID(renderer, 'directory-title')).toHaveLength(0);
    expect(list.props.ListHeaderComponent).toBeNull();
    expect(list.props.onScroll).toBeUndefined();
    await act(async () => renderer.unmount());
  },
);

test('the bar holds Filters and a menu with Sources, Share, Copy link and Open on opax.com.au', async () => {
  const renderer = await open('electorate', empty);
  const items = (
    mockScreen.options!.unstable_headerRightItems as () => {
      type: string;
      label: string;
      accessibilityLabel?: string;
      onPress?: () => void;
      menu?: { items: { label: string }[] };
    }[]
  )();
  expect(items.map((i) => i.label)).toEqual(['Filters', 'More']);
  items[0]!.onPress!();
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/filters/[list]',
    params: { list: 'directory', owner: 'electorate' },
  });
  expect(items[1]!.menu!.items.map((i) => i.label)).toEqual(
    expect.arrayContaining([
      'Sources',
      'Copy link',
      menuTitle('Open on opax.com.au'),
    ]),
  );
  await act(async () => renderer.unmount());
});

test('a search with no match says so, clears and searches all of OPAX', async () => {
  const renderer = await open('party', parties);
  await search('zzz');
  const empty = renderer.root.findByType(ContentUnavailable);
  expect(empty.props.title).toBe('No results');
  expect(empty.props.body).toBe('No party matches “zzz”.');
  expect(empty.props.action).toBeUndefined();
  await act(async () =>
    byID(renderer, 'directory-search-all')[0]!.props.onPress(),
  );
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/results/[kind]',
    params: { kind: 'all', q: 'zzz' },
  });
  // The filter line names the count and clears the search.
  expect(said(byID(renderer, 'directory-filter-line')[0]!)).toBe('0 parties');
  await act(async () =>
    byID(renderer, 'directory-filter-clear')[0]!.props.onPress(),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
  expect(byID(renderer, 'directory-filter-line')).toHaveLength(0);
  expect(byID(renderer, 'directory-party-greens').length).toBeGreaterThan(0);
  await act(async () => renderer.unmount());
});

test('a failed read is a whole-screen state with the plain reason and Try again', async () => {
  mockParams.kind = 'person';
  jest
    .mocked(loadDirectory)
    .mockRejectedValueOnce(
      new ApiError(
        'invalid-data',
        'The people records are out of step. Try again shortly.',
      ),
    )
    .mockResolvedValue(empty);
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      withNavigationOptions(<DirectoryScreen />, (options) => {
        mockScreen.options = options;
      }),
    );
  });
  const state = renderer.root.findByType(ContentUnavailable);
  expect(state.props.title).toBe("Couldn't load parliamentarians");
  expect(state.props.body).toBe(
    'The people records are out of step. Try again shortly.',
  );
  expect(state.props.action.label).toBe('Try again');
  await act(async () => state.props.action.onPress());
  expect(loadDirectory).toHaveBeenLastCalledWith(
    'person',
    false,
    expect.any(AbortSignal),
  );
  await act(async () => renderer.unmount());
});

test('unconfirmed members are explained once in the electorate directory footer', async () => {
  const unknown = { ...index.electorates[0]!, representatives: [] };
  const renderer = await open('electorate', {
    ...empty,
    electorates: [unknown],
  });
  const texts = renderer.root
    .findAllByType(NativeText)
    .map((node) => node.props.children);
  expect(
    texts.filter(
      (text) => text === 'Member not confirmed for some electorates.',
    ),
  ).toHaveLength(1);
  expect(texts).not.toContain('Member not confirmed');
  await act(async () => renderer.unmount());
});
