import { withNavigationOptions } from './navigation-options';
import { allowsReportsPath } from '../src/api/reports-policy';
/* eslint-disable @typescript-eslint/no-require-imports -- Native navigation is an inert host in component tests. */
import { router } from 'expo-router';
import { act, type ReactElement } from 'react';
import { Dimensions, Platform, ScrollView } from 'react-native';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
} from 'react-native-safe-area-context';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { reports } from '../src/api/runtime';
import { rhythm } from '../src/design/tokens';
import {
  arcPath,
  chosenDecade,
  decodeIndustryMoney,
  normaliseTopicFilters,
  topicFiltersLine,
} from '../src/features/reports/model';
import TopicPage, { topicQuestion } from '../src/features/reports/TopicPage';
import TopicsIndex from '../src/features/reports/TopicsIndex';
import { ValueRow, LinkRow } from '../src/design/rows';
import { partyRoute } from '../src/navigation/routes/people';
import { topicRoute } from '../src/navigation/routes/search';

let mockParams: Record<string, string> = {};
const mockScreens: { options?: Record<string, unknown> }[] = [];
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    Link: Object.assign((props: object) => React.createElement('Link', props), {
      Trigger: (props: object) => React.createElement('LinkTrigger', props),
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
    Stack: {
      Screen: (props: { options?: Record<string, unknown> }) => {
        mockScreens.push(props);
        return null;
      },
    },
    useLocalSearchParams: () => mockParams,
    useSegments: () => ['(tabs)', '(search)'],
    router: {
      push: jest.fn(),
      navigate: jest.fn(),
      dismissTo: jest.fn(),
      setParams: jest.fn(),
    },
  };
});
jest.mock('../src/api/runtime', () => ({
  reports: {
    topics: jest.fn(),
    tide: jest.fn(),
    topic: jest.fn(),
    speeches: jest.fn(),
    money: jest.fn(),
  },
}));
jest.mock('../src/navigation/share', () => ({
  canShare: true,
  shareRecord: jest.fn(),
  shareHeaderItem: jest.fn(() => ({ type: 'button', label: 'Share' })),
  copyRecordLink: jest.fn(),
}));
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openOnWeb: jest.fn(),
}));
jest.mock('../src/navigation/useTitleOnScroll', () => ({
  useTitleOnScroll: () => ({ onScroll: jest.fn(), onTitleLayout: jest.fn() }),
  TitleAnchorContext: require('react').createContext(null),
}));
const mockOpenAsk = jest.fn();
jest.mock('../src/features/ask/open', () => ({
  useOpenAsk: () => mockOpenAsk,
}));

const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 0,
  asOf: '2026-11-01',
});
const topic = {
  slug: 'gambling',
  count: 1234,
  labelled: 200000,
  parties: [
    ['Liberal', 400],
    ['Labor', 500],
    ['LNP', 20],
  ],
  states: [
    ['federal', 900, 0.01],
    ['nsw', 100, 0.002],
  ],
};
const tide = {
  scope: 'federal',
  decades: [
    { slug: '1990s', label: '1993–99', from: 1993, to: 1999 },
    { slug: '2000s', label: '2000s', from: 2000, to: 2009 },
    { slug: '2010s', label: '2010s', from: 2010, to: 2019 },
    { slug: '2020s', label: '2020–26', from: 2020, to: 2026 },
  ].map((d) => ({ ...d, total: 1000, labelled: 800, coverage: 0.8 })),
  topics: {
    gambling: [
      { decade: '1990s', count: 10, share: 0.01 },
      { decade: '2010s', count: 40, share: 0.04 },
    ],
  },
};
const speeches = {
  results: [
    {
      slug: 'speech-1',
      title: 'Andrew Wilkie — Gambling Reform — 2024-03-01',
      date: '2024-03-01',
      speaker: 'Andrew Wilkie',
      party: 'IND',
      state: 'federal',
      snippet: 'Poker machines',
    },
  ],
};
const money = decodeIndustryMoney({
  meta: {
    generated: '2026-10-01',
    source: 'AEC',
    coverage: 'financial years 1998-99 to 2025-26',
    methodology: 'Disclosed donations summed by party.',
    exclusions: [],
  },
  nodes: [
    {
      id: 'donor:tabcorp',
      label: 'Tabcorp Holdings Limited',
      kind: 'donor',
      industry: 'gambling',
      total: 1000000,
      count: 3,
    },
  ],
  edges: [
    { source: 'donor:tabcorp', target: 'party:Labor', total: 600000, count: 2 },
    {
      source: 'donor:tabcorp',
      target: 'party:Liberal',
      total: 400000,
      count: 1,
    },
  ],
});

let mounted: TestRenderer.ReactTestRenderer[] = [];
async function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <SafeAreaInsetsContext.Provider
        value={{ top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <SafeAreaFrameContext.Provider
          value={{ x: 0, y: 0, width: 390, height: 844 }}
        >
          {withNavigationOptions(element, (options) => {
            mockScreens.push({ options });
          })}
        </SafeAreaFrameContext.Provider>
      </SafeAreaInsetsContext.Provider>,
    );
  });
  mounted.push(renderer);
  return renderer;
}
const host = (root: ReactTestInstance, id: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === id,
  );
const press = async (root: ReactTestInstance, id: string) => {
  const target = root
    .findAllByProps({ testID: id })
    .find((node) => typeof node.props.onPress === 'function')!;
  await act(async () => target.props.onPress());
};
const words = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAll((node) => typeof node.type === 'string')
    .flatMap((node) =>
      node.children.filter(
        (child): child is string => typeof child === 'string',
      ),
    )
    .join('\n');
const lastParams = () =>
  jest.mocked(router.setParams).mock.calls.at(-1)?.[0] as Record<
    string,
    string | undefined
  >;

beforeEach(() => {
  jest.clearAllMocks();
  mockScreens.length = 0;
  mockParams = { slug: 'gambling' };
  Platform.OS = 'android';
  Dimensions.set({
    window: { width: 390, height: 844, scale: 3, fontScale: 1 },
    screen: { width: 390, height: 844, scale: 3, fontScale: 1 },
  });
  jest.mocked(reports.topic).mockResolvedValue(result(topic) as never);
  jest.mocked(reports.tide).mockResolvedValue(result(tide) as never);
  jest.mocked(reports.speeches).mockResolvedValue(result(speeches) as never);
  jest.mocked(reports.money).mockResolvedValue(result(money) as never);
  jest.mocked(reports.topics).mockResolvedValue(
    result({
      labelled: 200000,
      topics: [{ slug: 'gambling', count: 1234 }],
    }) as never,
  );
});
afterEach(() => {
  for (const renderer of mounted) act(() => renderer.unmount());
  mounted = [];
});

describe('topic arrivals (specs/search.md 5.2.1)', () => {
  it.each([
    [
      'decade-aligned years choose the decade',
      { from: '2010', to: '2019' },
      { from: '2010', to: '2019' },
      '2010s',
    ],
    [
      'non-aligned dates become plain years',
      { from: '1998-01-01', to: '2004-12-31' },
      { from: '1998', to: '2004' },
      'From 1998 to 2004',
    ],
    [
      'a debate is kept as words',
      { debate: 'Gambling Reform' },
      { debate: 'Gambling Reform' },
      '“Gambling Reform”',
    ],
    [
      'years outside the record are both dropped',
      { from: '1950', to: '2004' },
      {},
      '',
    ],
    ['from after to drops both', { from: '2010', to: '2005' }, {}, ''],
    ['an unknown parliament is dropped', { state: 'mars' }, {}, ''],
    [
      'a party by full name is kept',
      { party: 'Labor' },
      { party: 'Labor' },
      'Labor',
    ],
    [
      'a known party code is kept',
      { party: 'IND' },
      { party: 'IND' },
      'Independent',
    ],
    ['a crossbench code is kept', { party: 'SFF' }, { party: 'SFF' }, 'SFF'],
    ['ALP is kept as its code', { party: 'ALP' }, { party: 'ALP' }, 'Labor'],
    ['free text is dropped', { party: 'labor party; drop table' }, {}, ''],
    ['a long string is dropped', { party: 'A'.repeat(200) }, {}, ''],
  ])('%s', (_name, params, filters, line) => {
    const out = normaliseTopicFilters(params);
    expect(out).toEqual(filters);
    expect(topicFiltersLine(out)).toBe(line);
  });
  it("keeps a Who row's party code unchanged", () => {
    for (const [code] of topic.parties)
      expect(normaliseTopicFilters({ party: code as string })).toEqual({
        party: code,
      });
  });
  it('matches a decade only on its exact years', () => {
    expect(chosenDecade({ from: '2010', to: '2019' })?.slug).toBe('2010s');
    expect(chosenDecade({ from: '2010', to: '2018' })).toBeNull();
  });
});

describe('Topic page', () => {
  it('says an unknown topic is not in OPAX and reads nothing', async () => {
    mockParams = { slug: 'not-a-topic' };
    const page = await render(<TopicPage />);
    expect(host(page.root, 'topic-unknown')).toHaveLength(1);
    expect(words(page)).toContain('Topic not found');
    expect(words(page)).toContain("This topic isn't in OPAX.");
    for (const read of Object.values(reports))
      expect(jest.mocked(read)).not.toHaveBeenCalled();
  });

  it('counts speeches about the topic and says the count is a floor', async () => {
    const page = await render(<TopicPage />);
    const text = words(page);
    expect(text).toContain('1,234');
    expect(text).toContain('speeches about gambling');
    expect(text).toContain(
      'Not every speech is labelled yet, so this is a floor.',
    );
    expect(text).not.toContain('carry this label');
    expect(text).not.toContain('so far');
  });

  it('filters Speeches in place and never pushes a route', async () => {
    const page = await render(<TopicPage />);
    await press(page.root, 'topic-state-row-federal');
    expect(router.push).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(lastParams()).toMatchObject({ state: 'federal' });
    expect(reports.speeches).toHaveBeenLastCalledWith(
      'gambling',
      expect.objectContaining({ state: 'federal' }),
      false,
      expect.any(AbortSignal),
    );
    expect(host(page.root, 'topic-filters-line')).toHaveLength(1);
    expect(words(page)).toContain('Federal Parliament');
    await press(page.root, 'topic-tide-bar-1');
    expect(router.push).not.toHaveBeenCalled();
    expect(lastParams()).toMatchObject({
      state: 'federal',
      from: '2010',
      to: '2019',
    });
    await press(page.root, 'topic-filters-clear');
    expect(host(page.root, 'topic-filters-line')).toHaveLength(0);
    expect(lastParams()).toEqual({
      party: undefined,
      state: undefined,
      from: undefined,
      to: undefined,
      debate: undefined,
    });
  });

  it('removes a filter when its chosen Who row is tapped again', async () => {
    const page = await render(<TopicPage />);
    await press(page.root, 'topic-party-row-Labor');
    expect(lastParams()).toMatchObject({ party: 'Labor' });
    const row = page.root.findByProps({ testID: 'topic-party-row-Labor' });
    expect(row.props.selected).toBe(true);
    await press(page.root, 'topic-party-row-Labor');
    expect(lastParams()).toMatchObject({ party: undefined });
    expect(
      page.root.findByProps({ testID: 'topic-party-row-Labor' }).props.selected,
    ).toBe(false);
    expect(host(page.root, 'topic-filters-line')).toHaveLength(0);
  });

  it('draws Who rows as buttons without a chevron, parties in the neutral order', async () => {
    const page = await render(<TopicPage />);
    const who = host(page.root, 'topic-who')[0]!;
    expect(
      who.findAll((node) => node.props.name === 'chevron.right'),
    ).toHaveLength(0);
    const rows = who
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          /^topic-party-row-/.test(node.props.testID ?? ''),
      )
      .map((node) => node.props.testID);
    expect(rows).toEqual([
      'topic-party-row-Labor',
      'topic-party-row-Liberal',
      'topic-party-row-LNP',
    ]);
    for (const id of rows)
      expect(host(page.root, id)[0]!.props.accessibilityRole).toBe('button');
  });

  it('shows donations as a comparison, sourced to AEC and OPAX', async () => {
    const page = await render(<TopicPage />);
    expect(host(page.root, 'topic-money-section')).toHaveLength(1);
    const text = words(page);
    expect(text).toContain('Donations from the gambling industry');
    expect(text).toContain(
      'Shown beside the debate for comparison, not as a cause.',
    );
    expect(text).toContain('AEC and OPAX');
    expect(text).toContain('$1m');
  });

  it('offers All speeches on the topic, pushing results with the topic', async () => {
    const page = await render(<TopicPage />);
    expect(host(page.root, 'topic-speeches-more')).toHaveLength(1);
    expect(words(page)).toContain('All speeches on gambling');
    await press(page.root, 'topic-party-row-Labor');
    await press(page.root, 'topic-speeches-more');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/results/[kind]',
      params: {
        kind: 'speeches',
        topic: 'gambling',
        q: 'Gambling',
        party: 'Labor',
      },
    });
  });

  it('keeps All speeches while the speeches load', async () => {
    jest.mocked(reports.speeches).mockReturnValue(new Promise(() => {}));
    const page = await render(<TopicPage />);
    expect(host(page.root, 'topic-speeches-loading')).toHaveLength(1);
    expect(host(page.root, 'topic-speeches-more')).toHaveLength(1);
  });

  it('drafts a question in Ask from the ⋯ menu', async () => {
    await render(<TopicPage />);
    const options = mockScreens.at(-1)!.options as {
      unstable_headerRightItems: () => {
        type: string;
        menu?: { items: { label: string; onPress: () => void }[] };
      }[];
    };
    const more = options
      .unstable_headerRightItems()
      .find((item) => item.type === 'menu')!;
    const labels = more.menu!.items.map((item) => item.label);
    expect(labels).toEqual([
      'Ask about gambling',
      'Copy link',
      'Open on opax.com.au',
    ]);
    act(() => more.menu!.items[0]!.onPress());
    // The page's own name goes with it, for Ask's way back.
    expect(mockOpenAsk).toHaveBeenCalledWith(
      {
        question: 'What has parliament said about gambling this year?',
        topic: 'gambling',
      },
      'Gambling',
    );
    expect(topicQuestion('gambling')).toBe(
      'What has parliament said about gambling this year?',
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('reads the arrival filters once, normalised', async () => {
    mockParams = { slug: 'gambling', from: '1998-01-01', to: '2004-12-31' };
    const page = await render(<TopicPage />);
    expect(reports.speeches).toHaveBeenCalledWith(
      'gambling',
      { from: '1998', to: '2004' },
      false,
      expect.any(AbortSignal),
    );
    expect(words(page)).toContain('From 1998 to 2004');
  });

  const scrollSpy = (page: TestRenderer.ReactTestRenderer) => {
    const view = page.root.findAllByType(ScrollView)[0]!.instance as {
      scrollTo: (options: { y: number; animated?: boolean }) => void;
    };
    const spy = jest.fn();
    view.scrollTo = spy;
    return spy;
  };
  const layout = async (
    page: TestRenderer.ReactTestRenderer,
    id: string,
    y: number,
    height = 0,
  ) => {
    const node = page.root
      .findAll((n) => n.props.testID === id || n.props.onLayout)
      .find((n) =>
        id === 'topic-speeches-anchor'
          ? n.props.testID === id
          : n.findAll((c) => c.props.testID === id).length > 0 &&
            n.props.onLayout &&
            n.props.testID === undefined,
      )!;
    await act(async () =>
      node.props.onLayout({
        nativeEvent: { layout: { x: 0, y, width: 390, height } },
      }),
    );
  };

  it('a filtered arrival opens scrolled to Speeches', async () => {
    mockParams = {
      slug: 'gambling',
      from: '2010',
      to: '2019',
      state: 'federal',
    };
    const page = await render(<TopicPage />);
    const scrollTo = scrollSpy(page);
    await layout(page, 'topic-speeches-anchor', 1200);
    expect(scrollTo).toHaveBeenCalledWith({
      y: 1200 - rhythm.heading,
      animated: true,
    });
    // Once there, a later layout doesn't pull the reader back.
    scrollTo.mockClear();
    await layout(page, 'topic-speeches-anchor', 1250);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('an unfiltered arrival stays at the top', async () => {
    const page = await render(<TopicPage />);
    const scrollTo = scrollSpy(page);
    await layout(page, 'topic-speeches-anchor', 1200);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('a Who row or a decade bar filters Speeches and scrolls to it', async () => {
    const page = await render(<TopicPage />);
    const scrollTo = scrollSpy(page);
    await layout(page, 'topic-speeches-anchor', 900);
    await press(page.root, 'topic-party-row-Labor');
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: 900 - rhythm.heading,
      animated: true,
    });
    scrollTo.mockClear();
    await press(page.root, 'topic-tide-bar-1');
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('draws 30 speeches, then the next 30 as the reader nears the end; no pill', async () => {
    const many = {
      results: Array.from({ length: 75 }, (_, i) => ({
        ...speeches.results[0]!,
        slug: `speech-${i}`,
        date: `2024-03-${String((i % 28) + 1).padStart(2, '0')}`,
      })),
    };
    jest.mocked(reports.speeches).mockResolvedValue(result(many) as never);
    const page = await render(<TopicPage />);
    const rows = () =>
      host(page.root, 'topic-speeches-list')[0]!.findAll(
        (n) =>
          typeof n.type === 'string' &&
          /^topic-speech-\d+$/.test(n.props.testID ?? ''),
      ).length;
    expect(rows()).toBe(30);
    expect(host(page.root, 'topic-speeches-show-more')).toHaveLength(0);
    await layout(page, 'topic-speeches-anchor', 1000);
    await layout(page, 'topic-speeches-list', 100, 3000);
    const scroll = (y: number) =>
      act(async () =>
        page.root.findAllByType(ScrollView)[0]!.props.onScroll({
          nativeEvent: { contentOffset: { x: 0, y } },
        }),
      );
    // Far from the end: nothing is appended.
    await scroll(500);
    expect(rows()).toBe(30);
    // Within two rows of the end (1000 + 3100 - 844): the next 30.
    await scroll(4100 - 844 - 100);
    expect(rows()).toBe(60);
    // The same end again appends nothing more.
    await scroll(4100 - 844);
    expect(rows()).toBe(60);
    await layout(page, 'topic-speeches-list', 100, 6000);
    await scroll(7100 - 844);
    expect(rows()).toBe(75);
    // All speeches stays at the foot.
    expect(host(page.root, 'topic-speeches-more')).toHaveLength(1);
    expect(reports.speeches).toHaveBeenCalledTimes(1);
  });
});

describe('Topics index', () => {
  it('a topic with zero speeches still opens its existing topic screen', async () => {
    const page = await render(<TopicsIndex />);
    const row = page.root
      .findAllByType(LinkRow)
      .find((node) => node.props.testID === 'topic-unlabelled-housing')!;
    expect(row.props.href).toEqual(topicRoute('housing'));
  });

  it('donations by party open each named party record', async () => {
    mockParams.slug = 'gambling';
    const page = await render(<TopicPage />);
    const rows = page.root
      .findAllByType(ValueRow)
      .filter((node) => /^topic-money-party-/.test(node.props.testID ?? ''));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows)
      expect(row.props.href).toEqual(partyRoute(row.props.label));
  });
  it('lists topics with counts, an order picker and no-label topics apart', async () => {
    const page = await render(<TopicsIndex />);
    expect(host(page.root, 'topics-screen')).toHaveLength(1);
    expect(
      page.root.findAllByProps({ testID: 'topics-order' }).length,
    ).toBeGreaterThan(0);
    expect(host(page.root, 'topic-open-gambling')).toHaveLength(1);
    expect(words(page)).toContain('1,234 speeches');
    expect(host(page.root, 'topics-unlabelled')).toHaveLength(1);
    expect(host(page.root, 'topic-unlabelled-housing')).toHaveLength(1);
    expect(host(page.root, 'topics-stats')).toHaveLength(1);
    expect(host(page.root, 'topics-methods')).toHaveLength(1);
    expect(words(page)).not.toContain(' & ');
  });
});

test('topic arc policy accepts oldest sorting while rejecting duplicate and unsupported sorts', () => {
  const path = arcPath('housing');
  expect(allowsReportsPath(path)).toBe(true);
  expect(allowsReportsPath(path.replace('sort=newest', 'sort=oldest'))).toBe(
    true,
  );
  expect(allowsReportsPath(path + '&sort=oldest')).toBe(false);
  expect(allowsReportsPath(path.replace('sort=newest', 'sort=random'))).toBe(
    false,
  );
});

test('one speech is singular for a parliament and a party', async () => {
  jest.mocked(reports.topic).mockResolvedValue(
    result({
      ...topic,
      parties: [['Labor', 1]],
      states: [['sa', 1, 0.01]],
    }) as never,
  );
  const page = await render(<TopicPage />);
  expect(words(page)).toContain('1 speech');
  expect(words(page)).not.toMatch(/\b1 speeches\b/);
});
