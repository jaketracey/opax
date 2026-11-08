import { decodeMoneyGraph, moneyCatalogs } from '../src/features/money/data';
import {
  filtersFromParams,
  moneyCaveats,
  moneyFocusRoute,
  moneyJurisdiction,
  moneyProfile,
  moneySource,
  publicMoneySource,
  moneyWindowYears,
  latestCompleteYear,
  partyDonationsTotal,
  industryDonors,
  industryLabel,
} from '../src/features/money/records';
import { moneyRoute } from '../src/navigation/routes';
import { pinned } from './pinned';
import {
  moneyView,
  defaultMoneyFilters,
  donationRanks,
  rankedDonors,
  moneyWindowNodes,
} from '../src/features/money/view';
import { formatDisclosureYear } from '../src/design/format';

test('empty recorded windows are distinct from undated-only returns, and years are financial years', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  const filters = { ...defaultMoneyFilters(graph), from: 2020, to: 2020 };
  const empty = { total: 0, count: 0, firstYear: null, lastYear: null };
  expect(moneyWindowYears(empty, filters)).toBe('nothing disclosed in 2020–21');
  expect(moneyWindowYears(empty, filters, true)).toBe(
    'nothing awarded in 2020–21',
  );
  expect(moneyWindowYears({ ...empty, total: 5, count: 1 }, filters)).toBe(
    'Year not recorded',
  );
  expect(formatDisclosureYear(2025)).toBe('2025');
  expect(moneyWindowNodes(graph, filters)).toHaveLength(graph.nodes.length);
});
test('public money is explicitly scoped and public-money donors have no donation rank', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  const hubs = graph.nodes.filter((n) => n.kind === 'grantor');
  expect(hubs.map((n) => n.label).sort()).toEqual([
    'Commonwealth contracts',
    'Commonwealth grants',
  ]);
  const donors = rankedDonors(graph),
    ranks = donationRanks(donors);
  expect(donors.some((n) => n.via === 'public_money')).toBe(true);
  for (const node of donors.filter((n) => n.via === 'public_money'))
    expect(ranks.has(node.id)).toBe(false);
  expect([...ranks.values()]).toEqual(
    Array.from({ length: ranks.size }, (_, i) => i + 1),
  );
  for (const { path } of Object.values(moneyCatalogs)) {
    const caveat = moneyCaveats(decodeMoneyGraph(pinned(path))).join(' ');
    expect(caveat).toContain('Donor totals exclude');
    expect(caveat).toContain('Party receipts exclude');
    expect(caveat).toContain('include internal party transfers');
  }
});

test('a focus route preserves the selected year, industry and separate layers', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  const filters = filtersFromParams(graph, {
    from: '2024',
    to: '2024',
    industry: 'unions',
    layers: 'donations',
    inflation: '0',
  });
  const route = moneyFocusRoute('party:Labor', 'federal', filters);
  const restored = filtersFromParams(graph, route.params);
  const labor = moneyView(graph, restored).nodes.find(
    (n) => n.id === 'party:Labor',
  );
  expect(labor?.total).toBe(69010542);
  expect(labor?.count).toBe(3929);
  expect(restored).toEqual(filters);
  expect(moneyJurisdiction('wa')).toBe('federal');
  expect(
    filtersFromParams(graph, {
      from: 'Infinity',
      to: 'not-a-year',
      industry: 'not-an-industry',
    }).industry,
  ).toBeNull();
});
test.each(Object.values(moneyCatalogs))(
  'attribution and caveats come from $label held records',
  ({ path }) => {
    const graph = decodeMoneyGraph(pinned(path));
    const source = moneySource(graph);
    expect(source.url.startsWith('https://')).toBe(true);
    expect(moneyCaveats(graph).join(' ').toLowerCase()).toContain(
      'totals are a minimum',
    );
    if (graph.meta.jurisdiction) {
      expect(source.licence).toBe(graph.meta.licence);
      expect(moneyCaveats(graph)).toContain(graph.meta.threshold);
      expect(moneyCaveats(graph)).toContain(graph.meta.not_summed);
    } else {
      expect(source.citation).toBe(
        'AEC disclosure returns as aggregated in the money map',
      );
      expect(source.licence).toBe('CC BY 4.0');
    }
  },
);
test('Queensland awards link to their own register, separate from Commonwealth awards', () => {
  const qld = decodeMoneyGraph(pinned('/graph/money.qld.json'));
  const federal = decodeMoneyGraph(pinned('/graph/money.json'));
  expect(publicMoneySource(qld, 'grants').url).toContain('data.qld.gov.au');
  expect(publicMoneySource(qld, 'contracts').url).toContain('data.qld.gov.au');
  expect(publicMoneySource(federal, 'grants').label).toBe('GrantConnect');
  expect(publicMoneySource(federal, 'contracts').label).toBe('AusTender');
});
test('published party, person and money record paths open natively', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  const party = graph.nodes.find((n) => n.id === 'party:Labor')!;
  expect(moneyProfile(party)).toEqual({
    path: '/subject/party/Labor',
    native: {
      pathname: '/party/[slug]',
      params: { slug: 'labor', name: 'Labor' },
    },
  });
  expect(
    moneyProfile({ ...party, profileUrl: '/subject/person/anthony-albanese' })
      .native?.pathname,
  ).toBe('/person/[slug]');
  expect(
    moneyProfile({
      ...party,
      kind: 'donor',
      label: 'Fixture donor',
      profileUrl: undefined,
    }).native,
  ).toMatchObject({
    pathname: '/money-record',
    params: { rid: 'Fixture donor' },
  });
});

test('state representatives enter their supported jurisdiction, with federal fallback for unavailable states', () => {
  expect(moneyRoute('Labor', 'au-vic')).toEqual({
    pathname: '/money',
    params: { focus: 'party:Labor', jurisdiction: 'vic' },
  });
  expect(moneyRoute('LNP', 'au-qld').params?.jurisdiction).toBe('qld');
  expect(moneyRoute('Labor', 'au-tas').params?.jurisdiction).toBe('tas');
  expect(moneyRoute('Labor', 'au-nsw').params).toEqual({
    focus: 'party:Labor',
  });
});

test('the latest complete year follows the returns calendar, and party totals follow the window', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  // Annual returns for a financial year are published the February after
  // it ends: on 21 September 2026 the latest complete year is 2024–25.
  expect(graph.meta.generated).toBe('2026-09-21');
  expect(latestCompleteYear(graph)).toBe(2024);
  expect(
    latestCompleteYear({
      ...graph,
      meta: { ...graph.meta, latestCompleteYear: 2023 },
    }),
  ).toBe(2023);
  const all = defaultMoneyFilters(graph);
  const parties = graph.nodes.filter((n) => n.kind === 'party');
  // The window sums whole-dollar years: within a few dollars of the totals.
  expect(
    Math.abs(
      partyDonationsTotal(graph, all).total -
        parties.reduce((sum, n) => sum + n.total, 0),
    ),
  ).toBeLessThan(parties.length);
  const year = { ...all, from: 2024, to: 2024 };
  const one = partyDonationsTotal(graph, year);
  expect(one.total).toBeGreaterThan(0);
  expect(one.total).toBeLessThan(partyDonationsTotal(graph, all).total);
  // With an industry, only that industry's donors to parties count.
  const group = graph.nodes.find((n) => n.kind === 'donor')!.group;
  const industry = partyDonationsTotal(graph, { ...all, industry: group });
  expect(industry.total).toBeLessThan(partyDonationsTotal(graph, all).total);
  expect(industryLabel('mining & energy')).toBe('Mining and energy');
  // In a sentence the donors read naturally; the Filters labels stay.
  expect(industryLabel('unions')).toBe('Unions');
  expect(industryDonors('unions')).toBe('union donors');
  expect(industryDonors('individuals')).toBe('individual donors');
  expect(industryDonors('mining & energy')).toBe('mining and energy donors');
  expect(industryDonors('finance')).toBe('finance donors');
});
