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
