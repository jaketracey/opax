import { formatFinancialYear } from '../src/design/format';
import { decodeMoneyGraph } from '../src/features/money/data';
import { normaliseOrganisation } from '../src/features/money/lookup';
import {
  buildModel,
  clusterLabel,
  type MapNode,
} from '../src/features/money/map/model';
import {
  focusFigureLine,
  focusFlowGroups,
  focusFlows,
  focusMetaLine,
  PUBLIC_MONEY_NOTE,
} from '../src/features/money/map/MoneyMapPanel';
import { searchModel } from '../src/features/money/map/MoneyMapSearch';
import { defaultMoneyFilters, moneyView } from '../src/features/money/view';
import { pinned } from './pinned';

const graph = decodeMoneyGraph(pinned('/graph/money.json'));
const model = buildModel(moneyView(graph, defaultMoneyFilters(graph)));

const base: MapNode = {
  index: 0,
  id: 'x',
  label: 'X',
  kind: 'donor',
  cluster: 'mining & energy',
  amount: 1e6,
  count: 1234,
  firstYear: 2019,
  lastYear: 2023,
  radius: 2,
  colour: '#000',
  ink: '#000',
};
const span = `${formatFinancialYear(2019)} to ${formatFinancialYear(2023)}`;

describe('focusFigureLine', () => {
  test('a donor reads as disclosed donations, its years and its count', () => {
    expect(focusFigureLine(base)).toBe(
      `disclosed donations · ${span} · 1,234 donations`,
    );
  });
  test('a party reads as disclosed receipts', () => {
    expect(focusFigureLine({ ...base, kind: 'party' })).toBe(
      `disclosed receipts · ${span} · 1,234 receipts`,
    );
  });
  test('a hub reads as grants or contracts to donors on the map, with no count', () => {
    expect(focusFigureLine({ ...base, kind: 'hub', flow: 'grants' })).toBe(
      `in grants to donors on the map · ${span}`,
    );
    expect(focusFigureLine({ ...base, kind: 'hub', flow: 'contracts' })).toBe(
      `in contracts to donors on the map · ${span}`,
    );
    // A hub without a recorded flow reads as grants.
    expect(focusFigureLine({ ...base, kind: 'hub' })).toBe(
      `in grants to donors on the map · ${span}`,
    );
  });
  test('a single year and an unrecorded year', () => {
    expect(focusFigureLine({ ...base, firstYear: 2021, lastYear: 2021 })).toBe(
      `disclosed donations · ${formatFinancialYear(2021)} · 1,234 donations`,
    );
    expect(focusFigureLine({ ...base, firstYear: null, lastYear: null })).toBe(
      'disclosed donations · Year not recorded · 1,234 donations',
    );
  });
});

test('focusMetaLine names the kind, and a donor its industry', () => {
  expect(focusMetaLine({ ...base, kind: 'party' })).toBe('Party');
  expect(focusMetaLine({ ...base, kind: 'hub' })).toBe('Public money');
  expect(focusMetaLine(base)).toBe('Donor · Mining and energy');
  expect(focusMetaLine(base)).toBe(`Donor · ${clusterLabel(base.cluster)}`);
});

describe('focusFlows', () => {
  const party = model.nodes
    .filter((n) => n.kind === 'party')
    .sort((a, b) => b.amount - a.amount)[0]!;

  test('lists the strongest 15 flows with the disc at the other end', () => {
    const flows = focusFlows(model, party.index);
    expect(model.flows[party.index]!.length).toBeGreaterThan(15);
    expect(flows).toHaveLength(15);
    flows.forEach(({ edge, other }, i) => {
      expect(edge).toBe(model.edges[model.flows[party.index]![i]!]);
      expect(edge.b).toBe(party.index);
      expect(other).toBe(model.nodes[edge.a]);
      if (i)
        expect(flows[i - 1]!.edge.amount).toBeGreaterThanOrEqual(edge.amount);
    });
  });

  test('from the source end, the other disc is the target', () => {
    const donor = model.nodes.find(
      (n) => n.kind === 'donor' && model.flows[n.index]!.length > 0,
    )!;
    const flows = focusFlows(model, donor.index);
    expect(flows.length).toBe(Math.min(15, model.flows[donor.index]!.length));
    for (const { edge, other } of flows) {
      const otherIndex = edge.a === donor.index ? edge.b : edge.a;
      expect(other).toBe(model.nodes[otherIndex]);
      expect(other.index).not.toBe(donor.index);
    }
  });

  test('a node out of range has no flows', () => {
    expect(focusFlows(model, 99999)).toEqual([]);
  });
});

describe('searchModel', () => {
  test('an empty query, or one that normalises to nothing, finds nothing', () => {
    expect(searchModel(model, '')).toEqual([]);
    expect(searchModel(model, '   ')).toEqual([]);
    expect(searchModel(model, 'Pty Ltd')).toEqual([]);
  });

  test('matches on the normalised organisation name, ignoring case, punctuation and company suffixes', () => {
    const target = model.nodes.find(
      (n) => n.kind === 'donor' && n.label.length > 6,
    )!;
    const words = normaliseOrganisation(target.label);
    const results = searchModel(model, `  ${words.toUpperCase()} Pty. Ltd.`);
    expect(results.map((n) => n.id)).toContain(target.id);
    for (const n of results)
      expect(normaliseOrganisation(n.label)).toContain(words);
  });

  test('finds a party by name', () => {
    const labor = model.nodes.find((n) => n.label === 'Labor')!;
    expect(searchModel(model, 'labor').map((n) => n.id)).toContain(labor.id);
  });

  test('returns at most 8, largest first', () => {
    const results = searchModel(model, 'a');
    const all = model.nodes.filter((n) =>
      normaliseOrganisation(n.label).includes('a'),
    );
    expect(all.length).toBeGreaterThan(8);
    expect(results).toHaveLength(8);
    for (let i = 1; i < results.length; i++)
      expect(results[i - 1]!.amount).toBeGreaterThanOrEqual(results[i]!.amount);
    // The eight are the largest eight matches.
    const largest = [...all].sort((a, b) => b.amount - a.amount).slice(0, 8);
    expect(results.map((n) => n.amount)).toEqual(largest.map((n) => n.amount));
  });

  test('a query that matches nothing returns an empty list', () => {
    expect(searchModel(model, 'zzqxj no such donor')).toEqual([]);
  });
});

describe('focusFlowGroups', () => {
  test("a donor's donations and the public money it received are never one list", () => {
    const donor = model.nodes.find(
      (n) =>
        n.kind === 'donor' &&
        focusFlows(model, n.index).some((f) => f.edge.type === 'donations') &&
        focusFlows(model, n.index).some((f) => f.edge.type !== 'donations'),
    )!;
    expect(donor).toBeDefined();
    const flows = focusFlows(model, donor.index);
    const groups = focusFlowGroups(donor, flows);
    expect(groups.map((g) => g.title)).toEqual([
      'Where it went',
      'Public money received',
    ]);
    const [went, received] = groups;
    for (const row of went!.rows) expect(row.edge.type).toBe('donations');
    for (const row of received!.rows)
      expect(row.edge.type).not.toBe('donations');
    expect(went!.note).toBeUndefined();
    expect(received!.note).toBe(PUBLIC_MONEY_NOTE);
    // Every flow is in exactly one group, keeping its strongest-first index.
    const indices = groups
      .flatMap((g) => g.rows.map((r) => r.index))
      .sort((a, b) => a - b);
    expect(indices).toEqual(flows.map((_, i) => i));
    for (const g of groups)
      for (const row of g.rows) expect(flows[row.index]!.edge).toBe(row.edge);
  });

  test('a donor with donations only has one section, without the note', () => {
    const donor = model.nodes.find(
      (n) =>
        n.kind === 'donor' &&
        focusFlows(model, n.index).length > 0 &&
        focusFlows(model, n.index).every((f) => f.edge.type === 'donations'),
    )!;
    const groups = focusFlowGroups(donor, focusFlows(model, donor.index));
    expect(groups).toHaveLength(1);
    expect(groups[0]!.title).toBe('Where it went');
    expect(groups[0]!.note).toBeUndefined();
  });

  test('a party lists its largest donors and a hub its largest recipients, in one section each', () => {
    const party = model.nodes.find((n) => n.kind === 'party')!;
    const hub = model.nodes.find((n) => n.kind === 'hub')!;
    const partyGroups = focusFlowGroups(party, focusFlows(model, party.index));
    const hubGroups = focusFlowGroups(hub, focusFlows(model, hub.index));
    expect(partyGroups.map((g) => g.title)).toEqual(['Largest donors']);
    expect(hubGroups.map((g) => g.title)).toEqual([
      'Largest recipients on the map',
    ]);
    expect(partyGroups[0]!.rows).toHaveLength(
      focusFlows(model, party.index).length,
    );
    expect(hubGroups[0]!.rows).toHaveLength(
      focusFlows(model, hub.index).length,
    );
  });
});
