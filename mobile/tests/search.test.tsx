// Search (journeys/search.md 3 and 4.5): the on-device tier rule, scopes
// and link mapping, Recent, the filter line, every empty and error state's
// way on, money destinations, leads and the seat menu.
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { memberSuggestionRoster } from '../src/api/catalog-search';
import {
  allTopics,
  fold,
  matchAll,
  matchTier,
  orderGroups,
  suggestionList,
  topHits,
  type Match,
} from '../src/features/search/ranking';
import {
  capQuery,
  resultsTarget,
  targetForWebKind,
  webSearchPath,
} from '../src/features/search/scopes';
import {
  defaultSpeechFilters,
  filtersFromParams,
  filtersLine,
  filtersToParams,
  hasFilters,
  registerSearchFilters,
  searchFilterStore,
} from '../src/features/search/filters';
import {
  emptyRecovery,
  failureRecovery,
  withoutQuotes,
} from '../src/features/search/recovery';
import { createRecentStore } from '../src/features/search/recent';
import { isLead, moneyDestination } from '../src/features/search/GroupResults';
import { searchPhase } from '../src/features/search/SearchScreen';
import { MatchRow } from '../src/features/search/rows';
import { matchItem } from '../src/features/quick-search/items';
import { placeLine as askPlaceLine } from '../src/features/ask/people';
import { allLocal } from '../src/features/search/AllResults';
import { EmptyResults } from '../src/features/search/EmptyResults';
import { ApiError } from '../src/api/errors';
import { bills, index, manifest, people, roster, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  recordSearch: { search: jest.fn(), summary: jest.fn() },
  catalogs: {
    search: jest.fn(),
    suggestionSources: jest.fn(),
    suggestionSourcesOnFocus: jest.fn(),
  },
}));
const mockSeat = { visible: true };
jest.mock('../src/features/your-mp/useSetAsMyElectorate', () => ({
  useSetAsMyElectorate: (seat: { name: string }) => ({
    visible: mockSeat.visible,
    label: `Set ${seat.name} as my electorate`,
    run: jest.fn(),
  }),
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
    router: { push: jest.fn() },
    useSegments: () => [],
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});

const sources = {
  roster: memberSuggestionRoster(roster, { roster, manifest, slugs, people }),
  electorates: index,
  bills,
  people,
  topics: allTopics,
};
const label = (m: Match | null | undefined) =>
  !m
    ? null
    : m.kind === 'bills'
      ? m.item.short_title || m.item.title
      : m.kind === 'parties'
        ? m.item.name
        : m.kind === 'topics'
          ? m.item.title
          : m.item.name;

describe('the tier rule (3.3, the worked cases)', () => {
  test('tiers: exact, prefix, then a word inside a name; accents and case fold', () => {
    expect(matchTier(['Anthony Albanese', 'Albanese'], 'albanese')).toBe(0);
    expect(matchTier(['Anthony Albanese', 'Albanese'], 'alban')).toBe(1);
    expect(matchTier(['Vaping Reforms Bill'], 'reforms')).toBe(2);
    expect(matchTier(['Grayndler'], 'qantas')).toBeNull();
    expect(fold('  Ōtautahi  ')).toBe('otautahi');
  });
  test.each([
    ['albanese', 'Anthony Albanese', 'people'],
    ['alban', 'Anthony Albanese', 'people'],
    ['housing', 'Housing', 'topics'],
    ['grayndler', 'Grayndler', 'electorates'],
    ['liberal', 'Liberal', 'parties'],
  ])('"%s" leads with a Top suggestion: %s', (q, name, kind) => {
    const list = suggestionList(q, sources);
    expect(list.top?.kind).toBe(kind);
    expect(label(list.top)).toBe(name);
    // The Top suggestion is not repeated in its group.
    for (const g of list.groups) expect(g.rows).not.toContain(list.top);
  });
  test('"vaping" (only word matches) leads with "Search speeches for", bills first', () => {
    const list = suggestionList('vaping', sources);
    expect(list.top).toBeNull();
    expect(list.groups[0]?.kind).toBe('bills');
    expect(list.groups[0]?.rows[0]?.tier).toBe(2);
  });
  test('"qantas" leads with the Qantas bill by prefix; a query matching nothing leaves the two fixed rows', () => {
    expect(label(suggestionList('qantas', sources).top)).toBe(
      'Qantas Sale Amendment Bill 2014',
    );
    expect(suggestionList('zzqxv', sources)).toEqual({ top: null, groups: [] });
  });
  test('"smith": sitting members before former, three rows a group, at most four groups', () => {
    const list = suggestionList('smith', sources);
    expect(list.top?.kind).toBe('people');
    expect(list.groups.length).toBeLessThanOrEqual(4);
    for (const g of list.groups) expect(g.rows.length).toBeLessThanOrEqual(3);
    const smiths = matchAll('smith', sources).people.filter(
      (m) => m.tier === 0,
    );
    const firstFormer = smiths.findIndex((m) => m.item.current === false);
    if (firstFormer >= 0)
      expect(
        smiths.slice(firstFormer).every((m) => m.item.current === false),
      ).toBe(true);
  });
  test('"grayndler": people whose seat is Grayndler are not name matches', () => {
    expect(matchAll('grayndler', sources).people).toEqual([]);
  });
  test('people are one row per person, and one letter matches nothing', () => {
    const names = matchAll('albanese', sources).people.map((m) => m.item.name);
    expect(new Set(names).size).toBe(names.length);
    expect(Object.values(matchAll('a', sources)).flat()).toEqual([]);
  });
  test("All's Top hits are the first row of up to three groups, not repeated below", () => {
    const groups = orderGroups(matchAll('housing', sources));
    const top = topHits(groups);
    expect(top.length).toBeLessThanOrEqual(3);
    expect(top[0]).toBe(groups[0]!.rows[0]);
    const local = allLocal('housing', sources);
    for (const g of local.groups)
      for (const row of g.rows) expect(local.top).not.toContain(row);
  });
});

describe('scopes, results routes and links (4.3, 4.5)', () => {
  test('a /results kind or group resolves to a scope or a list', () => {
    expect(resultsTarget('speech')).toEqual({ scope: 'speeches' });
    expect(resultsTarget('all')).toEqual({ scope: 'all' });
    expect(resultsTarget('person')).toEqual({ scope: 'people' });
    expect(resultsTarget('speeches', 'interests')).toEqual({
      group: 'interests',
    });
    expect(resultsTarget('money')).toEqual({ group: 'grants' });
    expect(resultsTarget('nonsense')).toBeNull();
  });
  test('web kinds map to scopes; money kinds to their list', () => {
    expect(targetForWebKind('all')).toEqual({ scope: 'all' });
    for (const kind of ['person', 'interest', 'pay', 'expense'])
      expect(targetForWebKind(kind)).toEqual({ scope: 'people' });
    expect(targetForWebKind('bill')).toEqual({ scope: 'bills' });
    expect(targetForWebKind('speech')).toEqual({ scope: 'speeches' });
    expect(targetForWebKind('press_release')).toEqual({ scope: 'speeches' });
    expect(targetForWebKind(null, 'Glenn Sterle')).toEqual({
      scope: 'speeches',
    });
    expect(targetForWebKind('grant')).toEqual({ group: 'grants' });
    expect(targetForWebKind('donor')).toEqual({ scope: 'all' });
  });
  test('a link query is capped at 100 characters on a whole word', () => {
    const long = 'housing '.repeat(30);
    const cut = capQuery(long);
    expect(cut.length).toBeLessThanOrEqual(100);
    expect(cut.endsWith('housing')).toBe(true);
    expect(capQuery('  a   b ')).toBe('a b');
  });
  test('Share sends the opax.com.au search for the query, scope and filters', () => {
    expect(webSearchPath('housing', { scope: 'all' })).toBe(
      '/ask?view=search&q=housing&kind=all',
    );
    expect(
      webSearchPath('housing', { scope: 'speeches' }, { party: 'Labor' }),
    ).toBe('/ask?view=search&q=housing&kind=speech&party=Labor');
    expect(webSearchPath('x', { group: 'grants' })).toContain('kind=grant');
  });
});

describe('filters (3.5)', () => {
  test('Speeches defaults to speeches; Type "All records" widens it', () => {
    expect(defaultSpeechFilters.kind).toBe('speech');
    expect(filtersFromParams({ type: 'all' }).kind).toBe('all');
    expect(hasFilters(defaultSpeechFilters)).toBe(false);
  });
  test('the filter line follows the sheet order, years as "2024 to 2026"', () => {
    const f = filtersFromParams({ party: 'Labor', from: '2024', to: '2026' });
    expect(filtersLine(f)).toBe('Labor · 2024 to 2026');
    expect(filtersToParams(f)).toMatchObject({ party: 'Labor', from: '2024' });
  });
  test('the sheet names the speaker row "Person" and writes back to its owner', () => {
    const changed = jest.fn();
    registerSearchFilters('test-owner', defaultSpeechFilters, changed, []);
    const store = searchFilterStore('test-owner')!;
    const row = store.model.rows.find((r) => r.key === 'speaker');
    expect(row?.title).toBe('Person');
    store.set({ ...store.get(), party: 'Greens' });
    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({ party: 'Greens' }),
    );
  });
});

describe('every empty and error state has a way on (3.9)', () => {
  const ways = ['ask', 'all', 'retry', 'web'];
  test('All finds nothing: "No results" with Ask OPAX about this', () => {
    const r = emptyRecovery({ where: 'all', q: 'qantas', filtersOn: false });
    expect(r.title).toBe('No results');
    expect(r.body).toBe('Check the spelling or try a new search.');
    expect(r.actions.map((a) => a.label)).toEqual(['Ask OPAX about this']);
    // Empty titles never repeat the query.
    expect(JSON.stringify(r)).not.toContain('qantas');
  });
  test.each(['speeches', 'people', 'bills', 'interests', 'grants'] as const)(
    '%s finds nothing: "Show all results" and Ask remain',
    (where) => {
      const r = emptyRecovery({ where, q: 'x', filtersOn: false });
      expect(r.actions.map((a) => a.action)).toEqual(
        expect.arrayContaining(['all', 'ask']),
      );
    },
  );
  test('filters on and a quoted query add "Clear filters" and "Try without the quotes"', () => {
    const r = emptyRecovery({
      where: 'speeches',
      q: '"fair go"',
      filtersOn: true,
    });
    expect(r.title).toBe('No speeches');
    expect(r.actions.map((a) => a.label)).toEqual(
      expect.arrayContaining([
        'Clear filters',
        'Try without the quotes',
        'Show all results',
      ]),
    );
    expect(withoutQuotes('"fair go"')).toBe('fair go');
  });
  test('All emptied by speech filters offers Clear filters before Ask', () => {
    const recover = {
      onAsk: jest.fn(),
      onAll: jest.fn(),
      onClearFilters: jest.fn(),
      onUnquote: jest.fn(),
      onSpeeches: jest.fn(),
    };
    const filters = { ...defaultSpeechFilters, party: 'Labor' };
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <EmptyResults
          where="all"
          q={'"fair go"'}
          filters={filters}
          recover={recover}
        />,
      );
    });
    const actions = r.root
      .findAll(
        (n) =>
          typeof n.props.testID === 'string' &&
          n.props.testID.startsWith('search-empty-') &&
          typeof n.props.onPress === 'function',
      )
      .map((n) => n.props.testID as string);
    expect([...new Set(actions)]).toEqual([
      'search-empty-unquote',
      'search-empty-clear',
      'search-empty-ask',
    ]);
    const clear = r.root.find(
      (n) =>
        n.props.testID === 'search-empty-clear' &&
        typeof n.props.onPress === 'function',
    );
    act(() => clear.props.onPress());
    expect(recover.onClearFilters).toHaveBeenCalledTimes(1);
    act(() => r.unmount());
  });
  test.each([
    [new ApiError('rate-limited', 'x'), 'Search is busy right now.'],
    [new ApiError('offline', 'x'), 'Speeches need a connection.'],
    [new Error('boom'), 'Speeches couldn’t load.'],
  ])('a failure offers Try again: %s', (error, sentence) => {
    const r = failureRecovery(error, 'speeches');
    expect(r.sentence).toBe(sentence);
    expect(r.actions.some((a) => ways.includes(a.action))).toBe(true);
  });
  test('money offline and a row that could not open', () => {
    expect(
      failureRecovery(new ApiError('offline', 'x'), 'grants').sentence,
    ).toBe('Money records need a connection.');
    const open = failureRecovery(new Error('x'), 'open');
    expect(open.actions.map((a) => a.action)).toEqual(['retry', 'web']);
  });
});

describe('Recent (3.2)', () => {
  const disk = () => {
    let saved: unknown = null;
    return {
      read: async () => saved as never,
      save: async (items: unknown) => {
        saved = items;
      },
    };
  };
  test('newest first, deduped by folded text, ten kept, scope kept', async () => {
    const store = createRecentStore(disk(), () => 1);
    await store.load();
    for (let i = 0; i < 12; i++) store.add(`query ${i}`, 'all');
    store.add('QUERY 3', 'speeches');
    const items = store.snapshot().items;
    expect(items).toHaveLength(10);
    expect(items[0]).toMatchObject({ q: 'QUERY 3', scope: 'speeches' });
    expect(items.filter((i) => fold(i.q) === 'query 3')).toHaveLength(1);
    store.remove('QUERY 3');
    expect(store.snapshot().items[0]?.q).toBe('query 11');
    store.clear();
    expect(store.snapshot().items).toEqual([]);
  });
  test('a storage failure hides the group rather than failing Search', async () => {
    const store = createRecentStore(
      {
        read: async () => {
          throw new Error('disk');
        },
        save: async () => {
          throw new Error('disk');
        },
      },
      () => 1,
    );
    await store.load();
    expect(store.snapshot()).toMatchObject({ items: [], failed: true });
  });
});

describe('money rows and leads (3.4)', () => {
  test('an organisation opens money-record; an award opens money-item', () => {
    const org = moneyDestination({
      kind: 'agency',
      title: 'Department of Health',
      slug: 'x',
      href: '/money/recipient/abc?jur=federal',
    } as never);
    expect(org).toMatchObject({ params: { rid: 'abc', jur: 'federal' } });
    const award = moneyDestination({
      kind: 'grant_award',
      title: 'GA1',
      slug: 'GA1',
      href: '/money/grant?award=GA1',
    } as never);
    expect(award).toMatchObject({ params: { kind: 'grant', id: 'GA1' } });
  });
  test('leads are never results', () => {
    expect(isLead({ kind: 'lead' })).toBe(true);
    expect(isLead({ kind: 'grant', href: '/money/leads/x' })).toBe(true);
    expect(isLead({ kind: 'grant', href: '/money/grant/x' })).toBe(false);
  });
});

describe('the field', () => {
  test('editing overlays suggestions; a cleared field shows idle; Cancel keeps results', () => {
    expect(searchPhase('', false, false)).toBe('idle');
    expect(searchPhase('hous', true, false)).toBe('typing');
    expect(searchPhase('housing', false, true)).toBe('results');
    expect(searchPhase('housin', true, true)).toBe('typing');
    expect(searchPhase('', true, true)).toBe('idle');
  });
});

describe('the seat menu', () => {
  const seat = index.electorates.find(
    (s) =>
      s.name === 'Grayndler' &&
      s.jurisdiction === 'federal' &&
      s.status !== 'historical',
  )!;
  const menuOf = (visible: boolean) => {
    mockSeat.visible = visible;
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <MatchRow
          match={{
            kind: 'electorates',
            key: seat.electorate_id,
            tier: 0,
            item: seat,
          }}
          q="grayndler"
          sources={sources}
          variant="result"
          testID="row"
        />,
      );
    });
    const row = r.root.find(
      (n) => n.props.testID === 'row' && Array.isArray(n.props.menu),
    );
    return (row.props.menu as { title: string }[]).map((m) => m.title);
  };
  test('offers "Set Grayndler as my electorate" unless it is already the reader\'s seat', () => {
    expect(menuOf(true)).toContain('Set Grayndler as my electorate');
    expect(menuOf(false)).not.toContain('Set Grayndler as my electorate');
  });
});

/**
 * A person's row says "Member for" or "Senator for" only of someone the
 * record says sits now. The roster's `current` flag is absent for most
 * people, so its absence is not "sitting": the dated seats decide where
 * they can, and otherwise the row names the seat alone.
 */
describe('a person’s place line claims only what the record says', () => {
  const template = people.people.find((p) =>
    p.electorates.some(
      (e) =>
        !e.current &&
        e.jurisdiction === 'federal' &&
        e.chamber === 'representatives',
    ),
  )!;
  const ended = template.electorates.find((e) => !e.current)!;
  type Seat = (typeof template.electorates)[number];
  /** A roster row and the people catalogue it is joined to by its ID. */
  const person = (
    row: {
      name: string;
      current?: boolean;
      chamber?: string;
      electorate?: string;
      state?: string;
      states?: string[];
    },
    seats: Seat[],
  ) => {
    const pid = `pid-${row.name}`;
    const item = {
      name: row.name,
      pid,
      party: 'Labor',
      speeches: 1,
      states: row.states ?? ['federal'],
      chambers: [row.chamber ?? 'representatives'],
      ...(row.current === undefined ? {} : { current: row.current }),
      representation: [
        {
          jurisdiction: 'federal',
          chamber: row.chamber ?? 'representatives',
          electorate: row.electorate ?? 'Watson',
          state: row.state ?? 'NSW',
          basis: 'Recorded parliamentary roster',
        },
      ],
    } as unknown as NonNullable<(typeof sources)['roster']>['people'][number];
    const catalogue = {
      ...people,
      people: [
        {
          ...template,
          person_id: `person_${row.name}`,
          name: row.name,
          aliases: [],
          legacy_person_id: pid,
          electorates: seats,
        },
      ],
    } as typeof people;
    return { item, sources: { ...sources, people: catalogue } };
  };
  const rowOf = ({ item, sources: from }: ReturnType<typeof person>) => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <MatchRow
          match={{ kind: 'people', key: item.name, tier: 0, item }}
          q={item.name}
          sources={from}
          variant="suggestion"
          testID="row"
        />,
      );
    });
    const props = r.root.find(
      (n) => n.props.testID === 'row' && 'place' in n.props,
    ).props as { place: string | null; partyStatus: string };
    const quick = matchItem(
      { kind: 'people', key: item.name, tier: 0, item },
      from,
    ).secondary;
    act(() => r.unmount());
    return { place: props.place, partyStatus: props.partyStatus, quick };
  };
  const watson = (current: boolean): Seat => ({
    ...ended,
    name: 'Watson',
    current,
    periods: current
      ? [{ start: '2022-05-21', end: null }]
      : [{ start: '1979-06-23', end: '2004-10-09' }],
  });

  describe('someone the roster flags current for a seat in a state parliament', () => {
    // The roster's `current` covers every parliament it records. A former
    // federal member who now sits in a state upper house is flagged
    // current, and read "Member for" their old federal seat.
    const stateSeat = (current: boolean): Seat =>
      ({
        ...ended,
        name: 'New South Wales',
        jurisdiction: 'nsw',
        chamber: 'nsw_lc',
        current,
        periods: [{ start: '2019-03-23', end: current ? null : '2023-03-25' }],
      }) as Seat;
    const moved = {
      name: 'Invented Mover',
      current: true,
      states: ['federal', 'nsw'],
    };

    test('Search: the ended federal seat is a former one, whatever the flag says', () => {
      const row = rowOf(person(moved, [watson(false), stateSeat(true)]));
      expect(row.place).toBe('Former member for Watson, New South Wales');
      expect(row.place).not.toMatch(/^Member for/);
      expect(row.quick).toBe('Former member for Watson, New South Wales');
    });

    test('Search: with no dated federal seat the row names the seat alone', () => {
      for (const seats of [[], [stateSeat(true)]]) {
        const row = rowOf(person(moved, seats));
        expect(row.place).toBe('Watson, New South Wales');
        expect(row.quick).toBe('Watson, New South Wales');
      }
      const senator = rowOf(
        person(
          {
            ...moved,
            name: 'Invented Senator',
            chamber: 'senate',
            electorate: 'South Australia',
            state: 'SA',
            states: ['federal', 'sa'],
          },
          [],
        ),
      );
      expect(senator.place).toBe('Senate, South Australia');
    });

    test('Search: a sitting federal member with an earlier state seat still reads "Member for", from the dated federal seat', () => {
      const row = rowOf(person(moved, [watson(true), stateSeat(false)]));
      expect(row.place).toBe('Member for Watson, New South Wales');
    });

    test('Ask: the roster alone cannot say which seat is current, so it names the federal seat alone', () => {
      const { item } = person(moved, []);
      expect(askPlaceLine(item)).toBe('Watson, New South Wales');
      expect(askPlaceLine(item)).not.toMatch(/Member for/);
      const { item: senator } = person(
        {
          ...moved,
          name: 'Invented Senator',
          chamber: 'senate',
          electorate: 'South Australia',
          state: 'SA',
          states: ['federal', 'sa'],
        },
        [],
      );
      expect(askPlaceLine(senator)).toBe('Senate, South Australia');
      // The state seat recorded beside the federal one, with no states list.
      const beside = {
        ...item,
        states: undefined,
        representation: [
          ...item.representation!,
          {
            jurisdiction: 'nsw',
            chamber: 'nsw_lc',
            electorate: '',
            state: 'NSW',
          },
        ],
      } as typeof item;
      expect(askPlaceLine(beside)).toBe('Watson, New South Wales');
    });

    test('Ask: federal-only rows read as before, and a flagged former member is still former', () => {
      expect(
        askPlaceLine(
          person({ name: 'Invented Sitting', current: true }, []).item,
        ),
      ).toBe('Member for Watson, New South Wales');
      expect(
        askPlaceLine(
          person({ ...moved, name: 'Invented Left', current: false }, []).item,
        ),
      ).toBe('Former member for Watson, New South Wales');
    });
  });

  test('a former member, whom the roster does not flag, is a former member: the seat ended in the dated record', () => {
    const row = rowOf(person({ name: 'Leo McLeay' }, [watson(false)]));
    expect(row.place).toBe('Former member for Watson, New South Wales');
    expect(row.place).not.toMatch(/^Member for/);
    expect(row.partyStatus).toBe('former');
    // The wide quick search draws the same line.
    expect(row.quick).toBe('Former member for Watson, New South Wales');
    // The roster saying so is enough, with no dated seat at all.
    expect(
      rowOf(person({ name: 'Flagged Former', current: false }, [])).place,
    ).toBe('Former member for Watson, New South Wales');
    expect(
      rowOf(
        person(
          {
            name: 'Former Senator',
            current: false,
            chamber: 'senate',
            electorate: 'Tasmania',
            state: 'TAS',
          },
          [],
        ),
      ).place,
    ).toBe('Former senator for Tasmania');
  });

  test('a current member’s row is unchanged: the roster’s flag, or a seat held now in the dated record', () => {
    const flagged = rowOf(
      person({ name: 'Sitting Member', current: true }, []),
    );
    expect(flagged.place).toBe('Member for Watson, New South Wales');
    expect(flagged.quick).toBe('Member for Watson, New South Wales');
    const dated = rowOf(person({ name: 'Dated Member' }, [watson(true)]));
    expect(dated.place).toBe('Member for Watson, New South Wales');
    expect(dated.partyStatus).toBe('current');
    expect(
      rowOf(
        person(
          {
            name: 'Sitting Senator',
            current: true,
            chamber: 'senate',
            electorate: 'Tasmania',
            state: 'TAS',
          },
          [],
        ),
      ).place,
    ).toBe('Senator for Tasmania');
  });

  test('where the record does not say, the row names the seat alone and claims nothing', () => {
    // No flag and no dated seat.
    const bare = rowOf(person({ name: 'Undated Person' }, []));
    expect(bare.place).toBe('Watson, New South Wales');
    expect(bare.partyStatus).toBe('unknown');
    expect(bare.quick).toBe('Watson, New South Wales');
    // An ended federal seat says nothing about a state parliament the
    // roster also records, which no dated record covers.
    const elsewhere = rowOf(
      person({ name: 'Also State', states: ['federal', 'nsw'] }, [
        watson(false),
      ]),
    );
    expect(elsewhere.place).toBe('Watson, New South Wales');
    expect(
      rowOf(
        person(
          {
            name: 'Undated Senator',
            chamber: 'senate',
            electorate: 'Tasmania',
            state: 'TAS',
          },
          [],
        ),
      ).place,
    ).toBe('Senate, Tasmania');
    for (const line of [bare.place, elsewhere.place])
      expect(line).not.toMatch(/member|senator/i);
  });

  test('Ask’s people rows, from the roster alone, say the same three things', () => {
    const row = (current?: boolean, senate = false) =>
      askPlaceLine({
        name: 'A Person',
        ...(current === undefined ? {} : { current }),
        representation: [
          {
            jurisdiction: 'federal',
            chamber: senate ? 'senate' : 'representatives',
            electorate: senate ? 'Tasmania' : 'Watson',
            state: senate ? 'TAS' : 'NSW',
          },
        ],
      } as never);
    expect(row(true)).toBe('Member for Watson, New South Wales');
    expect(row(false)).toBe('Former member for Watson, New South Wales');
    expect(row()).toBe('Watson, New South Wales');
    expect(row(true, true)).toBe('Senator for Tasmania');
    expect(row(false, true)).toBe('Former senator for Tasmania');
    expect(row(undefined, true)).toBe('Senate, Tasmania');
  });

  describe('while the Victorian Parliament’s term has ended for an election', () => {
    // The live index: every Assembly row carries the election day, or null
    // once the result is loaded; Council rows carry nothing.
    const withIndex = (value: string | null) => ({
      ...sources,
      people,
      electorates: {
        ...index,
        electorates: index.electorates.map((s) =>
          s.chamber === 'vic_la' ? { ...s, dissolved_for: value } : s,
        ),
      },
    });
    // The pinned roster's rows whose place line names a Victorian state seat.
    const victorian = roster.people.filter((p) => {
      const seat =
        (p.representation ?? []).find(
          (r) =>
            r.jurisdiction === 'federal' && r.chamber !== 'senate_committee',
        ) ?? p.representation?.[0];
      return seat?.jurisdiction === 'vic';
    });
    const lines = (from: ReturnType<typeof withIndex>) =>
      victorian.map((item) => {
        const row = rowOf({ item, sources: from } as never);
        return { name: item.name, place: row.place, quick: row.quick };
      });

    test('Search and quick search call nobody the member for a Victorian state seat', () => {
      expect(victorian.length).toBeGreaterThan(100);
      const dated = lines(withIndex('2026-11-28'));
      for (const row of dated) {
        expect(`${row.name}: ${row.place}`).not.toMatch(/: Member for /);
        expect(`${row.name}: ${row.quick}`).not.toMatch(/: Member for /);
      }
      // The roster's surname row for a sitting senator records a Victorian
      // district: the one line that said "Member for" (it still does with
      // no ended term, as in 1.1.5).
      expect(dated.find((r) => r.name === 'Watt')).toMatchObject({
        place: 'Burwood, Victoria',
      });
      const loaded = lines(withIndex(null));
      expect(loaded.find((r) => r.name === 'Watt')).toMatchObject({
        place: 'Member for Burwood, Victoria',
      });
      // The people the index lists for their seat held it when the term
      // ended: "Last member for", in Search and in quick search. The rows
      // Search suggests carry the ID that joins them to the catalogue.
      const suggested = (from: ReturnType<typeof withIndex>) =>
        from.roster.people
          .filter((p) => victorian.some((v) => v.name === p.name))
          .map((item) => {
            const row = rowOf({ item, sources: from } as never);
            return { name: item.name, place: row.place, quick: row.quick };
          });
      const last = /^Last member for .+, Victoria$/;
      const then = suggested(withIndex('2026-11-28'));
      expect(
        then.filter((r) => last.test(r.place ?? '')).length,
      ).toBeGreaterThan(50);
      expect(
        then.filter((r) => last.test(r.quick ?? '')).length,
      ).toBeGreaterThan(50);
      expect(then.find((r) => r.name === 'Jacinta Allan')).toMatchObject({
        place: 'Last member for Bendigo East, Victoria',
        quick: 'Last member for Bendigo East, Victoria',
      });
      for (const row of then) {
        expect(`${row.name}: ${row.place}`).not.toMatch(/: Member for /);
        expect(`${row.name}: ${row.quick}`).not.toMatch(/: Member for /);
      }
      // Once the result is loaded they read as before.
      const after = suggested(withIndex(null));
      expect(after.find((r) => r.name === 'Jacinta Allan')).toMatchObject({
        place: 'Member for Bendigo East, Victoria',
        quick: 'Member for Bendigo East, Victoria',
      });
      expect(
        after.some((r) => last.test(r.place ?? '') || last.test(r.quick ?? '')),
      ).toBe(false);
      // The stub is not the person the index lists for Burwood.
      expect(
        String(then.find((r) => r.name === 'Watt')?.place ?? ''),
      ).not.toMatch(/Last member|Member for/);
      // Nothing else moves between the two indexes.
      const seatAlone = (line: string | null | undefined) =>
        typeof line === 'string' ? line.replace(/^Last member for /, '') : line;
      expect(
        dated
          .filter((r) => r.name !== 'Watt')
          .map((r) => ({
            ...r,
            place: seatAlone(r.place),
            quick: seatAlone(r.quick),
          })),
      ).toEqual(loaded.filter((r) => r.name !== 'Watt'));
    });
  });
});
