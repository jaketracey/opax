// Lane ad-wide-search (15 Nov): Today on regular width (iPad, the unfolded
// iPhone Duo) carries a search field at the masthead's top trailing corner,
// under the large title, with the website's quick-search dropdown under it. A phone's Today
// is unchanged. The dropdown is the Search tab's own sources, ranking,
// routes and recents: nothing new is read, ranked, stored or sent.
import { act } from 'react';
import { AccessibilityInfo, StyleSheet, TextInput, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { memberSuggestionRoster } from '../src/api/catalog-search';
import { catalogs } from '../src/api/runtime';
import { sizeClassFor } from '../src/design/adaptive';
import { dispatchKeyCommand } from '../src/design/keyboard';
import { colors, hairline } from '../src/design/tokens';
import {
  flatItems,
  matchItem,
  quickSections,
  suggestionAnnouncement,
} from '../src/features/quick-search/items';
import {
  WideSearch,
  WideSearchBar,
  barSearchWidth,
  wideFieldRoomEstimate,
  widePlaceholder,
} from '../src/features/quick-search/WideSearch';
import { quickSearch } from '../src/features/quick-search/store';
import { openSuggestedPerson } from '../src/features/search/navigation';
import {
  allTopics,
  suggestionList,
  type Match,
} from '../src/features/search/ranking';
import { recentSearches } from '../src/features/search/recent';
import { MatchRow } from '../src/features/search/rows';
import { Masthead } from '../src/features/today/Masthead';
import { bills, index, manifest, people, roster, slugs } from './pinned';

// An 11-inch iPad in portrait: regular width, and no room in the bar row,
// so the field is the masthead's. 1032 (13-inch) has room for the bar item.
let mockWidth = 834;
let mockHeight = 1376;
let mockFontScale = 1;
let mockScheme: 'light' | 'dark' = 'light';
// useIsDark reads the system through Appearance, as the Android hooks do.
beforeEach(() => {
  jest
    .spyOn(
      jest.requireActual<typeof import('react-native')>('react-native')
        .Appearance,
      'getColorScheme',
    )
    .mockImplementation(() => mockScheme);
});
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: { value: { ...actual.Platform, OS: 'ios', isPad: true } },
    useColorScheme: { value: () => mockScheme },
    useWindowDimensions: {
      value: () => ({
        width: mockWidth,
        height: mockHeight,
        scale: 2,
        fontScale: mockFontScale,
      }),
    },
  });
});
// The input's own frame, as the host reads it before paint; null where the
// host has no synchronous read, and the estimate stands.
let mockFrame: { width: number; height: number } | null = null;
jest.mock('../src/features/money/map/measure', () => ({
  frameOf: () => mockFrame,
}));
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));
jest.mock('../src/api/runtime', () => ({
  recordSearch: { search: jest.fn(), summary: jest.fn() },
  catalogs: {
    search: jest.fn(),
    suggestionSources: jest.fn(),
    suggestionSourcesOnFocus: jest.fn(),
  },
}));
jest.mock('../src/features/your-mp/useSetAsMyElectorate', () => ({
  useSetAsMyElectorate: () => ({ visible: false, label: '', run: jest.fn() }),
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const Link = Object.assign(
    ({ children }: { children: unknown }) => children,
    {
      Trigger: ({ children }: { children: unknown }) => children,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    },
  );
  return {
    Link,
    router: { push: jest.fn(), navigate: jest.fn() },
    useSegments: () => [],
    useLocalSearchParams: () => ({}),
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
let mockBarOptions: { unstable_headerRightItems?: () => any[] } | undefined;
jest.mock('../src/navigation/preview', () => ({
  RouteOptions: ({ options }: { options: typeof mockBarOptions }) => {
    mockBarOptions = options;
    return null;
  },
}));
jest.mock('../src/features/account/store', () => ({
  useAccount: () => ({ status: { signedIn: false } }),
  accountSnapshot: () => ({ status: { signedIn: false } }),
}));
const mockOpenAsk = jest.fn();
const mockAskNow = jest.fn();
jest.mock('../src/features/ask/open', () => ({
  useOpenAsk: () => mockOpenAsk,
  useAskNow: () => mockAskNow,
}));
let mockReports: unknown = null;
jest.mock('../src/features/search/ReportResults', () => ({
  useReportSearch: () => mockReports,
}));
jest.mock('../src/features/search/navigation', () => ({
  ...jest.requireActual('../src/features/search/navigation'),
  openSuggestedPerson: jest.fn(async () => undefined),
}));

const { router } = jest.requireMock('expo-router') as {
  router: { push: jest.Mock; navigate: jest.Mock };
};
const sources = {
  roster: memberSuggestionRoster(roster, { roster, manifest, slugs, people }),
  electorates: index,
  bills,
  people,
  topics: allTopics,
  provenance: {} as never,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockWidth = 834;
  mockHeight = 1376;
  mockFontScale = 1;
  mockFrame = null;
  mockBarOptions = undefined;
  quickSearch.reset();
  mockReports = null;
  recentSearches.clear();
  jest
    .mocked(catalogs.suggestionSourcesOnFocus)
    .mockResolvedValue({ ...sources, manifest, slugs } as never);
});

const ids = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAll((node) => typeof node.props?.testID === 'string')
    .map((node) => node.props.testID as string);
const input = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root.findByType(TextInput);
// A pressable is several nested components with the same props: the
// outermost of each row, in drawn order.
const rows = (renderer: TestRenderer.ReactTestRenderer) => {
  const seen = new Set<string>();
  return renderer.root
    .findAll(
      (node) =>
        typeof node.type !== 'string' &&
        typeof node.props?.testID === 'string' &&
        node.props.testID.startsWith('today-wide-search-row-') &&
        typeof node.props.onPress === 'function' &&
        node.props.accessibilityRole === 'button',
    )
    .filter((node) => {
      if (seen.has(node.props.testID)) return false;
      seen.add(node.props.testID);
      return true;
    });
};
const row = (renderer: TestRenderer.ReactTestRenderer, key: string) =>
  rows(renderer).find(
    (node) => node.props.testID === `today-wide-search-row-${key}`,
  )!;
const selected = (renderer: TestRenderer.ReactTestRenderer) =>
  rows(renderer)
    .filter((node) => node.props.accessibilityState?.selected)
    .map((node) => node.props.testID as string);

async function mount() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<WideSearch />);
  });
  return renderer;
}
async function focus(renderer: TestRenderer.ReactTestRenderer) {
  await act(async () => input(renderer).props.onFocus());
}
async function type(renderer: TestRenderer.ReactTestRenderer, text: string) {
  await act(async () => input(renderer).props.onChangeText(text));
}

describe('where the field is drawn', () => {
  test('a compact window draws nothing, and reads nothing', async () => {
    mockWidth = 600;
    const renderer = await mount();
    expect(renderer.toJSON()).toBeNull();
    expect(catalogs.suggestionSourcesOnFocus).not.toHaveBeenCalled();
    // A phone is compact at any width: the rule, not the window, decides.
    expect(sizeClassFor(1032, 'phone')).toBe('compact');
    await act(async () => renderer.unmount());
  });

  test('regular width draws it on the masthead top edge, on the column trailing edge, before anything is read', async () => {
    const renderer = await mount();
    const place = renderer.root.findByProps({ testID: 'today-wide-search' });
    // Absolute: it takes no room in the masthead's flow. Not above the
    // masthead: the navigation bar takes every touch in the title's band.
    expect(StyleSheet.flatten(place.props.style)).toEqual({
      position: 'absolute',
      top: 0,
      right: 0,
    });
    expect(input(renderer).props.accessibilityLabel).toBe('Search');
    // An overlay of fixed size: no panel, no read, until it is used.
    expect(ids(renderer)).not.toContain('today-wide-search-panel');
    expect(catalogs.suggestionSourcesOnFocus).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  test('the masthead lays out its lines the same with the field in its slot', async () => {
    const now = new Date('2026-11-15T01:00:00Z');
    const lines = (renderer: TestRenderer.ReactTestRenderer) =>
      ids(renderer).filter((id) => !id.startsWith('today-wide-search'));
    let plain!: TestRenderer.ReactTestRenderer;
    let wide!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      plain = TestRenderer.create(<Masthead now={now} />);
      wide = TestRenderer.create(
        <Masthead now={now} search={<WideSearch />} />,
      );
    });
    expect(ids(wide)).toContain('today-wide-search-input');
    expect(lines(wide)).toEqual(lines(plain));
    mockWidth = 600;
    await act(async () =>
      wide.update(<Masthead now={now} search={<WideSearch />} />),
    );
    expect(ids(wide)).not.toContain('today-wide-search-input');
    await act(async () => {
      plain.unmount();
      wide.unmount();
    });
  });
});

describe('the panel on dark', () => {
  afterEach(() => {
    mockScheme = 'light';
  });
  const panel = (renderer: TestRenderer.ReactTestRenderer) =>
    StyleSheet.flatten(
      renderer.root.find(
        (node) =>
          typeof node.type === 'string' &&
          node.props.testID === 'today-wide-search-panel',
      ).props.style,
    );
  test('light keeps its shadow; dark draws none (ink is pale there) and takes the raised outline', async () => {
    const renderer = await mount();
    await focus(renderer);
    await type(renderer, 'housing');
    expect(panel(renderer)).toMatchObject({
      shadowOpacity: 0.16,
      shadowRadius: 24,
      outlineColor: colors.raisedOutline,
      outlineWidth: hairline,
      outlineOffset: -hairline,
    });
    mockScheme = 'dark';
    await type(renderer, 'housing a');
    expect(panel(renderer)).toMatchObject({
      shadowOpacity: 0,
      outlineColor: colors.raisedOutline,
    });
    await act(async () => renderer.unmount());
  });
});

describe('the dropdown mirrors the website groups from the Search tab data', () => {
  test('typing: a Search row leads, then groups, then Ask; each row names its type', async () => {
    const renderer = await mount();
    await focus(renderer);
    expect(catalogs.suggestionSourcesOnFocus).toHaveBeenCalledTimes(1);
    // Focused and empty with no recents: nothing to show, no panel.
    expect(ids(renderer)).not.toContain('today-wide-search-panel');
    await type(renderer, 'grayndler');
    const expected = quickSections({ q: 'grayndler', sources, recents: [] });
    expect(rows(renderer).map((node) => node.props.testID)).toEqual(
      flatItems(expected).map((item) => `today-wide-search-row-${item.key}`),
    );
    const labels = rows(renderer).map(
      (node) => node.props.accessibilityLabel as string,
    );
    expect(labels[0]).toMatch(/^Grayndler, .*Electorate$/);
    expect(labels[1]).toBe('Search for “grayndler”, Search');
    expect(labels.at(-1)).toBe('Ask OPAX about “grayndler”, Ask');
    await act(async () => renderer.unmount());
  });

  test('reports join once the Search tab report typeahead has answered', () => {
    const sections = quickSections({
      q: 'audit',
      sources,
      recents: [],
      reports: [{ slug: 'r-1', title: 'Audit of grants' }] as never,
    });
    const reports = sections.find((section) => section.key === 'reports');
    expect(reports?.items[0]).toMatchObject({
      title: 'Audit of grants',
      type: 'Report',
      action: {
        kind: 'route',
        route: {
          pathname: '/report/[slug]',
          params: { slug: 'r-1', name: 'Audit of grants' },
        },
      },
    });
    expect(sections.at(-1)?.key).toBe('ask');
  });

  test('at AX3 and above a group shows one row, as in the Search tab', async () => {
    mockFontScale = 2.643;
    const renderer = await mount();
    await focus(renderer);
    await type(renderer, 'smith');
    const people = renderer.root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.testID === 'today-wide-search-group-people',
    );
    expect(people).toHaveLength(1);
    expect(
      rows(renderer).filter((node) =>
        (node.props.accessibilityLabel as string).endsWith(', Person'),
      ).length,
    ).toBeLessThanOrEqual(2);
    await act(async () => renderer.unmount());
  });
});

describe('route parity with the Search tab', () => {
  const tabRoute = (match: Match) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MatchRow match={match} q="x" sources={sources} variant="suggestion" />,
      );
    });
    // The tab's row component (SuggestionRow or PersonRow) takes `href`.
    const found = renderer.root.findAll(
      (node) => typeof node.type !== 'string' && 'href' in node.props,
    )[0]!;
    const href = found.props.href;
    act(() => renderer.unmount());
    return href;
  };
  test.each(['albanese', 'grayndler', 'qantas', 'housing', 'liberal', 'smith'])(
    'every row for "%s" pushes the route the Search tab row pushes',
    (q) => {
      const list = suggestionList(q, sources);
      const matches = [
        ...(list.top ? [list.top] : []),
        ...list.groups.flatMap((group) => group.rows),
      ];
      expect(matches.length).toBeGreaterThan(0);
      for (const match of matches) {
        const href = tabRoute(match);
        const { action } = matchItem(match, sources);
        if (href) expect(action).toEqual({ kind: 'route', route: href });
        // No route on the tab's row: a person it resolves on press.
        else expect(action.kind).toBe('person');
      }
    },
  );

  test('choosing a row pushes its route, clears the field and closes the panel', async () => {
    const renderer = await mount();
    await focus(renderer);
    await type(renderer, 'grayndler');
    const top = suggestionList('grayndler', sources).top!;
    const item = matchItem(top, sources);
    await act(async () => row(renderer, item.key).props.onPress());
    expect(router.push).toHaveBeenCalledWith(
      (item.action as { route: unknown }).route,
    );
    expect(input(renderer).props.value).toBe('');
    await act(async () => input(renderer).props.onBlur());
    expect(ids(renderer)).not.toContain('today-wide-search-panel');
    await act(async () => renderer.unmount());
  });

  test('a person the catalogue has not joined goes through the Search resolver', async () => {
    const renderer = await mount();
    await focus(renderer);
    await type(renderer, 'smith');
    const items = flatItems(
      quickSections({ q: 'smith', sources, recents: [] }),
    );
    const unresolved = items.find((item) => item.action.kind === 'person');
    if (unresolved) {
      await act(async () => row(renderer, unresolved.key).props.onPress());
      expect(openSuggestedPerson).toHaveBeenCalledWith(unresolved.title);
    }
    await act(async () => renderer.unmount());
  });

  test('free text opens the Search tab with the words submitted as typed; a question goes to Ask', async () => {
    const renderer = await mount();
    await focus(renderer);
    await type(renderer, '  water buybacks ');
    await act(async () => input(renderer).props.onSubmitEditing());
    expect(router.navigate).toHaveBeenCalledWith({
      pathname: '/search',
      params: { q: 'water buybacks', scope: 'all', typed: '1' },
    });
    await focus(renderer);
    await type(renderer, 'water');
    await act(async () => row(renderer, 'ask').props.onPress());
    expect(mockOpenAsk).toHaveBeenCalledWith({
      question: 'What has parliament said about water?',
    });
    await focus(renderer);
    await type(renderer, 'Who funds the major parties?');
    await act(async () => row(renderer, 'ask').props.onPress());
    expect(mockAskNow).toHaveBeenCalledWith({
      question: 'Who funds the major parties?',
    });
    await act(async () => renderer.unmount());
  });
});

describe('hardware keyboard', () => {
  test('arrows move through every row and wrap, Return opens the selection, Escape closes', async () => {
    const renderer = await mount();
    await focus(renderer);
    await type(renderer, 'grayndler');
    const keys = rows(renderer).map((node) => node.props.testID as string);
    expect(selected(renderer)).toEqual([]);
    await act(async () => void dispatchKeyCommand('list-down'));
    expect(selected(renderer)).toEqual([keys[0]]);
    await act(async () => void dispatchKeyCommand('list-down'));
    expect(selected(renderer)).toEqual([keys[1]]);
    await act(async () => void dispatchKeyCommand('list-up'));
    await act(async () => void dispatchKeyCommand('list-up'));
    expect(selected(renderer)).toEqual([keys.at(-1)]);
    await act(async () => void dispatchKeyCommand('list-down'));
    expect(selected(renderer)).toEqual([keys[0]]);
    // Return on the selection, not the typed words.
    await act(async () => input(renderer).props.onSubmitEditing());
    const top = matchItem(suggestionList('grayndler', sources).top!, sources);
    expect(router.push).toHaveBeenCalledWith(
      (top.action as { route: unknown }).route,
    );
    expect(router.navigate).not.toHaveBeenCalled();

    await focus(renderer);
    await type(renderer, 'housing');
    expect(ids(renderer)).toContain('today-wide-search-panel');
    await act(async () => void dispatchKeyCommand('list-escape'));
    expect(ids(renderer)).not.toContain('today-wide-search-panel');
    // The words stay; typing opens the suggestions again.
    expect(input(renderer).props.value).toBe('housing');
    await type(renderer, 'housing a');
    expect(ids(renderer)).toContain('today-wide-search-panel');
    await act(async () => renderer.unmount());
  });

  test('the arrows are left to the app while the panel is closed', async () => {
    const renderer = await mount();
    await focus(renderer);
    // No panel: no handler of the field's takes an arrow.
    expect(dispatchKeyCommand('list-down')).toBe(false);
    await act(async () => renderer.unmount());
  });

  test('Cmd-F focuses the field while Today is on screen', async () => {
    const focusField = jest
      .spyOn(TextInput.prototype, 'focus')
      .mockImplementation(() => undefined);
    const renderer = await mount();
    let handled = false;
    await act(async () => {
      handled = dispatchKeyCommand('find');
    });
    expect(handled).toBe(true);
    expect(focusField).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
    // Off Today nothing of the field's is left listening.
    expect(dispatchKeyCommand('find')).toBe(false);
    focusField.mockRestore();
  });

  test('a tap outside closes the panel', async () => {
    const renderer = await mount();
    await focus(renderer);
    await type(renderer, 'housing');
    const backdrop = renderer.root
      .findAllByProps({ testID: 'today-wide-search-backdrop' })
      .find((node) => typeof node.props.onPress === 'function')!;
    await act(async () => backdrop.props.onPress());
    expect(ids(renderer)).not.toContain('today-wide-search-panel');
    await act(async () => renderer.unmount());
  });
});

describe("the field as Today's bar item (iPad, where the bar has room)", () => {
  test('room: a 13-inch iPad, the same width in both orientations; never an 11-inch, a narrow window or an iPhone', () => {
    expect(barSearchWidth(1032, 1376, true)).toBe(206);
    // One width in both orientations: the bar's items never change size
    // on a rotation (UIKit collapsed them into its overflow button).
    expect(barSearchWidth(1376, 1032, true)).toBe(206);
    expect(barSearchWidth(834, 1194, true)).toBe(0);
    expect(barSearchWidth(1194, 834, true)).toBe(0);
    expect(barSearchWidth(600, 1376, true)).toBe(0);
    // The unfolded Duo is an iPhone: its bar items sit on the rail.
    expect(barSearchWidth(951, 880, false)).toBe(0);
  });

  async function mountBar() {
    let page!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      page = TestRenderer.create(
        <>
          <WideSearch />
          <WideSearchBar />
        </>,
      );
    });
    const items = mockBarOptions!.unstable_headerRightItems!();
    let bar!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      bar = TestRenderer.create(items[0].element);
    });
    return { page, bar, items };
  }

  test('with room the field is the first bar item, before Account, and the masthead draws none', async () => {
    mockWidth = 1032;
    const { page, bar, items } = await mountBar();
    expect(items[0]).toMatchObject({
      type: 'custom',
      hidesSharedBackground: true,
    });
    expect(items.at(-1)).toMatchObject({ label: 'Account' });
    expect(ids(bar)).toContain('today-wide-search-input');
    expect(ids(page)).not.toContain('today-wide-search');
    expect(ids(page)).not.toContain('today-wide-search-input');
    expect(catalogs.suggestionSourcesOnFocus).not.toHaveBeenCalled();
    await act(async () => {
      bar.unmount();
      page.unmount();
    });
  });

  const FULL = 'Search people, bills, topics';
  test('the placeholder is the longest form that fits the field: the 13-inch bar field draws short words, the masthead the full ones', () => {
    // The bar field on a 13-inch iPad: 206 pt, about 160 pt for words.
    const bar = wideFieldRoomEstimate(barSearchWidth(1032, 1376, true), 1);
    expect(bar).toBeGreaterThan(150);
    expect(bar).toBeLessThan(170);
    expect(widePlaceholder({ room: bar, fontScale: 1 })).toBe('Search OPAX');
    expect(widePlaceholder({ room: bar, fontScale: 1, bold: true })).toBe(
      'Search OPAX',
    );
    // At the accessibility sizes the type stops at 1.5 times and the
    // symbol grows: only the one word fits.
    for (const fontScale of [1.786, 2.643, 3.571]) {
      const room = wideFieldRoomEstimate(206, fontScale);
      expect(widePlaceholder({ room, fontScale })).toBe('Search');
      expect(widePlaceholder({ room, fontScale, bold: true })).toBe('Search');
    }
    // The masthead's 340 pt field holds the full words, also in Bold Text,
    // and not at the accessibility sizes.
    const masthead = wideFieldRoomEstimate(340, 1);
    expect(widePlaceholder({ room: masthead, fontScale: 1 })).toBe(FULL);
    expect(widePlaceholder({ room: masthead, fontScale: 1, bold: true })).toBe(
      FULL,
    );
    expect(
      widePlaceholder({
        room: wideFieldRoomEstimate(340, 2.643),
        fontScale: 2.643,
      }),
    ).toBe('Search OPAX');
    // Bold Text runs wider: a room the regular words just fit is too small.
    expect(widePlaceholder({ room: 232, fontScale: 1 })).toBe(FULL);
    expect(widePlaceholder({ room: 232, fontScale: 1, bold: true })).toBe(
      'Search OPAX',
    );
    // Nothing fits: the shortest is still drawn.
    expect(widePlaceholder({ room: 10, fontScale: 1 })).toBe('Search');
  });

  test('the bar field draws the short words and a screen reader still hears the full ones; the measured width decides', async () => {
    mockWidth = 1032;
    const first = await mountBar();
    expect(input(first.bar).props.placeholder).toBe('Search OPAX');
    expect(input(first.bar).props.accessibilityLabel).toBe(FULL);
    await act(async () => {
      first.bar.unmount();
      first.page.unmount();
    });
    // AX3: one word, and the label is still the full words.
    mockFontScale = 2.643;
    const large = await mountBar();
    expect(input(large.bar).props.placeholder).toBe('Search');
    expect(input(large.bar).props.accessibilityLabel).toBe(FULL);
    await act(async () => {
      large.bar.unmount();
      large.page.unmount();
    });
    // The input's own width, read before paint, is what decides: one with
    // room draws the full words, which are then the placeholder it speaks.
    mockFontScale = 1;
    mockFrame = { width: 260, height: 44 };
    const roomy = await mountBar();
    expect(input(roomy.bar).props.placeholder).toBe(FULL);
    expect(input(roomy.bar).props.accessibilityLabel).toBe('Search');
    await act(async () => {
      roomy.bar.unmount();
      roomy.page.unmount();
    });
    // And one narrower than the estimate draws less.
    mockFrame = { width: 80, height: 44 };
    const tight = await mountBar();
    expect(input(tight.bar).props.placeholder).toBe('Search');
    await act(async () => {
      tight.bar.unmount();
      tight.page.unmount();
    });
  });

  test('the masthead field keeps the full words', async () => {
    const renderer = await mount();
    expect(input(renderer).props.placeholder).toBe(FULL);
    expect(input(renderer).props.accessibilityLabel).toBe('Search');
    await act(async () => renderer.unmount());
  });

  test('without room Today keeps its root items and the masthead field', async () => {
    let page!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      page = TestRenderer.create(
        <>
          <WideSearch />
          <WideSearchBar />
        </>,
      );
    });
    const items = mockBarOptions!.unstable_headerRightItems!();
    expect(items.map((item) => item.type)).not.toContain('custom');
    expect(items.at(-1)).toMatchObject({ label: 'Account' });
    expect(ids(page)).toContain('today-wide-search-input');
    await act(async () => page.unmount());
  });

  test('the dropdown opens over the page for the bar field: rows, arrows, Return and Cmd-F', async () => {
    mockWidth = 1032;
    const focusField = jest
      .spyOn(TextInput.prototype, 'focus')
      .mockImplementation(() => undefined);
    const { page, bar } = await mountBar();
    await act(async () => void dispatchKeyCommand('find'));
    expect(focusField).toHaveBeenCalledTimes(1);
    await focus(bar);
    await type(bar, 'grayndler');
    // The panel is on the page, not in the bar.
    expect(ids(bar)).not.toContain('today-wide-search-panel');
    expect(ids(page)).toContain('today-wide-search-panel');
    const expected = quickSections({ q: 'grayndler', sources, recents: [] });
    expect(rows(page).map((node) => node.props.testID)).toEqual(
      flatItems(expected).map((item) => `today-wide-search-row-${item.key}`),
    );
    await act(async () => void dispatchKeyCommand('list-down'));
    await act(async () => input(bar).props.onSubmitEditing());
    const top = matchItem(suggestionList('grayndler', sources).top!, sources);
    expect(router.push).toHaveBeenCalledWith(
      (top.action as { route: unknown }).route,
    );
    expect(input(bar).props.value).toBe('');
    focusField.mockRestore();
    await act(async () => {
      bar.unmount();
      page.unmount();
    });
  });
});

describe('the placement switches while Today is open (review of 9dc926978)', () => {
  // A new element each time: the same object would not render again.
  const both = () => (
    <>
      <WideSearch />
      <WideSearchBar />
    </>
  );
  async function mountBarPage() {
    mockWidth = 1032;
    let page!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      page = TestRenderer.create(both());
    });
    let bar!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      bar = TestRenderer.create(
        mockBarOptions!.unstable_headerRightItems!()[0].element,
      );
    });
    return { page, bar };
  }

  test('bar field to masthead field: the masthead field is the live one, unfocused, and Cmd-F reaches it', async () => {
    const focusField = jest
      .spyOn(TextInput.prototype, 'focus')
      .mockImplementation(() => undefined);
    const { page, bar } = await mountBarPage();
    await focus(bar);
    await type(bar, 'grayndler');
    expect(ids(page)).toContain('today-wide-search-panel');
    // The window narrows: the masthead field mounts, then the navigator
    // drops the bar item.
    mockWidth = 834;
    await act(async () => page.update(both()));
    await act(async () => bar.unmount());
    expect(ids(page)).toContain('today-wide-search-input');
    // No field has focus, so no dropdown is drawn under the new one.
    expect(quickSearch.snapshot().focused).toBe(false);
    expect(ids(page)).not.toContain('today-wide-search-panel');
    expect(quickSearch.input.current).not.toBeNull();
    await act(async () => void dispatchKeyCommand('find'));
    expect(focusField).toHaveBeenCalledTimes(1);
    // The masthead field works on: focus, the words kept, a row opens.
    await focus(page);
    expect(ids(page)).toContain('today-wide-search-panel');
    const top = matchItem(suggestionList('grayndler', sources).top!, sources);
    await act(async () => row(page, top.key).props.onPress());
    expect(router.push).toHaveBeenCalledWith(
      (top.action as { route: unknown }).route,
    );
    focusField.mockRestore();
    await act(async () => page.unmount());
  });

  test('a rotation with the bar dropdown open closes it; the next focus measures its place again', async () => {
    let fieldAt = { x: 800, y: 30, w: 206, h: 44 };
    const measure = jest
      .spyOn(View.prototype, 'measureInWindow')
      .mockImplementation(function (this: View, callback) {
        const props = (this as unknown as { props: { testID?: string } }).props;
        if (props.testID === 'today-bar-search-host') callback(32, 142, 968, 1);
        else callback(fieldAt.x, fieldAt.y, fieldAt.w, fieldAt.h);
      });
    const blur = jest
      .spyOn(TextInput.prototype, 'blur')
      .mockImplementation(() => undefined);
    const { page, bar } = await mountBarPage();
    const panelStyle = () =>
      StyleSheet.flatten(
        page.root.findAll(
          (node) =>
            typeof node.type === 'string' &&
            node.props.testID === 'today-wide-search-panel',
        )[0]!.props.style,
      );
    await focus(bar);
    await type(bar, 'grayndler');
    // Under the field: its bottom edge plus the gap, once; trailing edges
    // together.
    expect(panelStyle()).toMatchObject({
      top: 30 + 44 + 6 - 142,
      left: 800 + 206 - 420 - 32,
      marginTop: 0,
    });
    // Landscape: the field is elsewhere in a wider bar.
    mockWidth = 1376;
    mockHeight = 1032;
    fieldAt = { x: 1104, y: 30, w: 206, h: 44 };
    await act(async () => page.update(both()));
    await act(async () =>
      bar.update(mockBarOptions!.unstable_headerRightItems!()[0].element),
    );
    expect(ids(page)).not.toContain('today-wide-search-panel');
    expect(blur).toHaveBeenCalled();
    await act(async () => input(bar).props.onBlur());
    await focus(bar);
    expect(panelStyle()).toMatchObject({
      top: 30 + 44 + 6 - 142,
      left: 1104 + 206 - 420 - 32,
    });
    measure.mockRestore();
    blur.mockRestore();
    await act(async () => {
      bar.unmount();
      page.unmount();
    });
  });
});

test('Today leaving the screen tree clears the field (review of 9dc926978)', async () => {
  const renderer = await mount();
  await focus(renderer);
  await type(renderer, 'housing');
  expect(quickSearch.snapshot()).toMatchObject({
    text: 'housing',
    armed: true,
  });
  await act(async () => renderer.unmount());
  expect(quickSearch.snapshot()).toEqual({
    text: '',
    focused: false,
    armed: false,
    dismissed: false,
  });
});

describe('VoiceOver', () => {
  test('the count and the groups are announced; groups are headers; the field says whether it is expanded', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    const renderer = await mount();
    expect(input(renderer).props.accessibilityState).toEqual({
      expanded: false,
    });
    await focus(renderer);
    await type(renderer, 'smith');
    const sections = quickSections({ q: 'smith', sources, recents: [] });
    const said = suggestionAnnouncement(sections);
    expect(said).toMatch(/^\d+ suggestions: .*People/);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect(announce).toHaveBeenCalledWith(said);
    expect(input(renderer).props.accessibilityState).toEqual({
      expanded: true,
    });
    const headers = renderer.root
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityRole === 'header',
      )
      .map((node) => node.props.children);
    expect(headers.flat().join(' ')).toContain('People');
    for (const node of rows(renderer))
      expect(node.props.accessibilityLabel).toMatch(
        /, (Person|Electorate|Bill|Topic|Party|Report|Search|Ask)$/,
      );
    expect(suggestionAnnouncement([])).toBe('No suggestions');
    announce.mockRestore();
    await act(async () => renderer.unmount());
  });
});

describe('recent searches stay on the device', () => {
  test('the existing store answers; the field writes nothing to it and asks the network for nothing', async () => {
    await act(async () => {
      recentSearches.add('water', 'all');
      recentSearches.add('housing', 'speeches');
    });
    const add = jest.spyOn(recentSearches, 'add');
    const setScope = jest.spyOn(recentSearches, 'setScope');
    const remove = jest.spyOn(recentSearches, 'remove');
    const clear = jest.spyOn(recentSearches, 'clear');
    const fetched = jest.fn();
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetched as never;
    const renderer = await mount();
    await focus(renderer);
    const labels = rows(renderer).map(
      (node) => node.props.accessibilityLabel as string,
    );
    expect(labels).toEqual(['housing, Speeches, Recent', 'water, Recent']);
    // A recent runs again in the Search tab, in the scope it was saved with.
    await act(async () => row(renderer, 'recent:housing').props.onPress());
    expect(router.navigate).toHaveBeenCalledWith({
      pathname: '/search',
      params: { q: 'housing', scope: 'speeches', typed: '1' },
    });
    await focus(renderer);
    await type(renderer, 'grayndler');
    await act(async () => input(renderer).props.onSubmitEditing());
    for (const spy of [add, setScope, remove, clear])
      expect(spy).not.toHaveBeenCalled();
    expect(fetched).not.toHaveBeenCalled();
    expect(jest.mocked(catalogs.search)).not.toHaveBeenCalled();
    globalThis.fetch = realFetch;
    for (const spy of [add, setScope, remove, clear]) spy.mockRestore();
    await act(async () => renderer.unmount());
  });
});
