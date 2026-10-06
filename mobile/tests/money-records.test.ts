import { decodeMoneyGraph, moneyCatalogs } from '../src/features/money/data';
import {
  filtersFromParams,
  moneyCaveats,
  moneyFocusRoute,
  moneyJurisdiction,
  moneyProfile,
  moneySource,
  publicMoneySource,
} from '../src/features/money/records';
import { moneyView } from '../src/features/money/view';
import { pinned } from './pinned';

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
      'totals are a floor',
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
test('only an explicit native person path opens a native profile; party pages remain on the website', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  const party = graph.nodes.find((n) => n.id === 'party:Labor')!;
  expect(moneyProfile(party)).toEqual({
    path: '/subject/party/Labor',
    native: null,
  });
  expect(
    moneyProfile({ ...party, profileUrl: '/subject/person/anthony-albanese' })
      .native?.pathname,
  ).toBe('/person/[slug]');
});
