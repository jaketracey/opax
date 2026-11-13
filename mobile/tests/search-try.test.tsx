// Sweep 1 item 5: Search's "Try" group. Rows come by rule from what the
// device holds (saved seat, daily edition, bill index, topic list), never by
// popularity. Names here are invented.
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import type { BillIndex } from '../src/api/catalog-decoders';
import type { EditionView } from '../src/api/selectors';
import { tryRows, tryTopic, TRY_SHOWN } from '../src/features/search/try';
import { allTopics } from '../src/features/search/ranking';

jest.mock('../src/api/runtime', () => ({
  catalogs: { todayEdition: jest.fn() },
}));
jest.mock('expo-router', () => ({
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
  router: { push: jest.fn(), navigate: jest.fn() },
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
}));
const mockRecent: { items: { q: string; scope: 'all'; at: number }[] } = {
  items: [],
};
jest.mock('../src/features/search/recent', () => ({
  recentSearches: { clear: jest.fn(), remove: jest.fn() },
  useRecentSearches: () => ({ items: mockRecent.items, failed: false }),
}));

const { catalogs } = jest.requireMock('../src/api/runtime') as {
  catalogs: { todayEdition: jest.Mock };
};

const TODAY = '2026-11-13';
function edition(over: Partial<EditionView> = {}): EditionView {
  return {
    date: TODAY,
    kind: 'bill',
    kindLabel: 'Bill',
    kindShort: 'Bill',
    title: 'Placeholder Waterways Amendment Bill 2026',
    shortTitle: null,
    cardTitle: 'Placeholder Waterways Amendment Bill 2026',
    paragraphs: ['A bill about rivers and irrigation.'],
    path: '/bill/r9999',
    machineWritten: null,
    sourceRows: [],
    facts: {
      kicker: null,
      line: null,
      figures: [],
      bars: null,
      events: [],
      division: null,
    },
    ...over,
  };
}
const billRow = (key: string, title: string, introduced: string) => ({
  key,
  title,
  short_title: null,
  jurisdiction: 'federal',
  parliament: 48,
  introduced,
  originating_house: 'House of Representatives',
  status: 'before_parliament',
  status_as_of: introduced,
  portfolio: null,
  sponsor: null,
  sponsor_party: null,
});
const bills = {
  generated_at: '2026-11-12',
  bills: [
    billRow('r9001', 'Invented Older Bill 2026', '2026-10-01'),
    billRow('r9002', 'Invented Newest Bill 2026', '2026-11-11'),
  ],
} as unknown as BillIndex;
const member = { slug: 'sam-placeholder', name: 'Sam Placeholder' };

test('no seat, an edition and the bill index: edition, newest bill, topic', () => {
  const rows = tryRows({
    member: null,
    edition: edition(),
    bills,
    today: TODAY,
  });
  expect(rows.map((r) => [r.key, r.title, r.detail])).toEqual([
    ['edition', 'Placeholder Waterways Amendment Bill 2026', 'Daily edition'],
    ['bill', 'Invented Newest Bill 2026', 'Newest bill'],
    ['topic', expect.any(String), 'Topic'],
  ]);
  // The edition and the bill open their records.
  expect(rows[0]!.action).toEqual({
    href: expect.objectContaining({ pathname: '/bill/[key]' }),
  });
  expect(rows[1]!.action).toEqual({
    href: expect.objectContaining({
      pathname: '/bill/[key]',
      params: expect.objectContaining({ key: 'r9002' }),
    }),
  });
  // No row ever claims popularity.
  for (const row of rows)
    expect(`${row.title} ${row.detail}`).not.toMatch(/trend|popular|most/i);
});

test('a saved seat puts the member first; four rows at most, two beside Recent', () => {
  const rows = tryRows({ member, edition: edition(), bills, today: TODAY });
  expect(rows[0]).toMatchObject({
    key: 'member',
    title: 'Sam Placeholder',
    detail: 'Your member',
    action: {
      href: expect.objectContaining({
        pathname: '/person/[slug]',
        params: expect.objectContaining({ slug: 'sam-placeholder' }),
      }),
    },
  });
  expect(rows).toHaveLength(TRY_SHOWN);
  expect(
    tryRows({
      member,
      edition: edition(),
      bills,
      hasRecent: true,
      today: TODAY,
    }).map((r) => r.key),
  ).toEqual(['member', 'edition']);
});

test('the topic is one the edition names, else one by the edition date', () => {
  const gambling = edition({
    title: 'Invented Wagering Bill 2026',
    paragraphs: ['It changes the rules for betting advertising.'],
  });
  expect(tryTopic(gambling)?.slug).toBe('gambling');
  // Nothing named: the same topic for every reader on that date, and
  // another the next day.
  const plain = edition({ title: 'Invented Bill', paragraphs: [] });
  const first = tryTopic(plain)!;
  expect(allTopics).toContainEqual(first);
  expect(tryTopic(plain)).toEqual(first);
  expect(tryTopic({ ...plain, date: '2026-11-14' })).not.toEqual(first);
});

test('a topic edition is the subject row; a politician edition searches its name; an old edition is left out', () => {
  const topic = tryRows({
    member: null,
    edition: edition({
      kind: 'topic',
      title: 'Housing',
      path: '/topic/housing',
    }),
    bills: null,
    today: TODAY,
  });
  expect(topic.map((r) => [r.key, r.title])).toEqual([['edition', 'Housing']]);
  const person = tryRows({
    member: null,
    edition: edition({
      kind: 'politician',
      title: 'Alex Invented',
      cardTitle: 'Alex Invented',
      path: '/person/alex-invented',
    }),
    bills: null,
    today: TODAY,
  });
  expect(person[0]).toMatchObject({
    title: 'Alex Invented',
    action: { q: 'Alex Invented' },
  });
  // The member is the edition's subject: one row, not two.
  expect(
    tryRows({
      member: { slug: 'alex-invented', name: 'Alex Invented' },
      edition: edition({
        kind: 'politician',
        title: 'Alex Invented',
        cardTitle: 'Alex Invented',
      }),
      bills: null,
      today: TODAY,
    }).filter((r) => r.title === 'Alex Invented'),
  ).toHaveLength(1);
  expect(
    tryRows({
      member: null,
      edition: edition({ date: '2026-10-01' }),
      bills: null,
      today: TODAY,
    }),
  ).toEqual([]);
});

describe('SearchIdle', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { SearchIdle } = require('../src/features/search/SearchIdle');
  const {
    MyMemberContext,
  } = require('../src/features/your-mp/MyMemberContext');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const ids = (r: TestRenderer.ReactTestRenderer) =>
    r.root
      .findAll(
        (n) => typeof n.type === 'string' && typeof n.props.testID === 'string',
      )
      .map((n) => n.props.testID as string)
      .filter((id, i, all) => all.indexOf(id) === i);
  async function render(seat: typeof member | null, onTry = jest.fn()) {
    catalogs.todayEdition.mockResolvedValue({
      status: 'ready',
      data: edition({ date: new Date().toISOString().slice(0, 10) }),
    });
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(
        <MyMemberContext.Provider value={seat}>
          <SearchIdle onRecent={jest.fn()} onTry={onTry} bills={bills} />
        </MyMemberContext.Provider>,
      );
    });
    return r;
  }
  afterEach(() => {
    mockRecent.items = [];
  });

  test('a fresh install: Try sits above Browse with rows from the edition and the bill index', async () => {
    const r = await render(null);
    const order = ids(r).filter((id) =>
      /^search-(try|browse|recent)(-|$)/.test(id),
    );
    expect(order.indexOf('search-try')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('search-try')).toBeLessThan(
      order.indexOf('search-browse'),
    );
    expect(ids(r)).toEqual(
      expect.arrayContaining([
        'search-try-edition',
        'search-try-bill',
        'search-try-topic',
      ]),
    );
    expect(ids(r)).not.toContain('search-try-member');
    act(() => r.unmount());
  });

  test('with a seat the member leads; after a search Recent leads and Try keeps two', async () => {
    let r = await render(member);
    const tries = ids(r).filter((id) => /^search-try-/.test(id));
    expect(tries[0]).toBe('search-try-member');
    act(() => r.unmount());
    mockRecent.items = [{ q: 'water', scope: 'all', at: 1 }];
    r = await render(member);
    const all = ids(r);
    expect(all.indexOf('search-recent')).toBeLessThan(
      all.indexOf('search-try'),
    );
    expect(all.filter((id) => /^search-try-/.test(id))).toEqual([
      'search-try-member',
      'search-try-edition',
    ]);
    act(() => r.unmount());
  });
});
