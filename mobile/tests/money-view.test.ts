import { pinned } from './pinned';
import { decodeMoneyGraph, moneyCatalogs } from '../src/features/money/data';
import {
  defaultMoneyFilters,
  moneyView,
  windowFigures,
  rankedDonors,
  moneyFlowType,
} from '../src/features/money/view';
import { cpiMultiplier } from '../src/features/money/ported/cpi';

const federal = decodeMoneyGraph(pinned('/graph/money.json'));
test('nominal all-years party figures stay the disclosed totals, including receipts outside the selected donor set', () => {
  const f = defaultMoneyFilters(federal),
    view = moneyView(federal, f);
  expect(view.nodes.find((n) => n.id === 'party:Labor')?.total).toBe(
    1120198704,
  );
  const year = moneyView(federal, { ...f, from: 2024, to: 2024 });
  expect(year.nodes.find((n) => n.id === 'party:Labor')?.total).toBe(69010542);
  expect(year.nodes.find((n) => n.id === 'party:Labor')?.count).toBe(3929);
  expect(federal.nodes.find((n) => n.id === 'party:Labor')?.total).toBe(
    1120198704,
  );
});
test('the Queensland year window retains undated gifts rather than silently dropping them', () => {
  const raw = decodeMoneyGraph(pinned('/graph/money.qld.json'));
  const node = raw.nodes.find((n) => n.id === 'party:LNP')!;
  expect(windowFigures(node, 2026, 2026)).toMatchObject({
    total: 1144545,
    count: 215,
    firstYear: 2026,
    lastYear: 2026,
  });
});
test('donations, grants and contracts are distinct layers and industry filters preserve only honest donor relationships', () => {
  const f = defaultMoneyFilters(federal),
    byId = new Map(federal.nodes.map((n) => [n.id, n]));
  for (const type of ['donations', 'grants', 'contracts'] as const) {
    const view = moneyView(federal, {
      ...f,
      donations: false,
      grants: false,
      contracts: false,
      [type]: true,
    });
    expect(view.edges.length).toBeGreaterThan(0);
    expect(view.edges.every((e) => moneyFlowType(e, byId) === type)).toBe(true);
  }
  const unions = moneyView(federal, { ...f, industry: 'unions' });
  expect(
    unions.nodes
      .filter((n) => n.kind === 'donor')
      .every((n) => n.group === 'unions' || n.industry === 'unions'),
  ).toBe(true);
  const labor = unions.nodes.find((n) => n.id === 'party:Labor')!;
  expect(labor.total).toBe(1120198704);
});
test.each(Object.values(moneyCatalogs))(
  'ranked list and empty windows remain bounded for $path',
  ({ path }) => {
    const raw = decodeMoneyGraph(pinned(path)),
      view = moneyView(raw, defaultMoneyFilters(raw)),
      ranked = rankedDonors(view);
    expect(ranked.every((n, i) => !i || ranked[i - 1]!.total >= n.total)).toBe(
      true,
    );
    expect(
      moneyView(raw, {
        ...defaultMoneyFilters(raw),
        donations: false,
        grants: false,
        contracts: false,
      }).nodes,
    ).toEqual([]);
  },
);
test('inflation uses the web CPI table for dated cells while undated money stays nominal', () => {
  const node = {
    total: 110,
    count: 2,
    firstYear: 1998,
    lastYear: 1998,
    byYear: { '1998': [100, 1] as [number, number] },
    undated: [10, 1] as [number, number],
  };
  expect(windowFigures(node, 1998, 1998, true).total).toBeCloseTo(
    100 * cpiMultiplier(1998) + 10,
  );
});
