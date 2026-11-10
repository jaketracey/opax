import { decodeMoneyGraph } from '../src/features/money/data';
import {
  MIN_FLOW_CHOICES,
  moneyFilterParams,
  moneyFiltersModel,
  moneyFilterValues,
} from '../src/features/money/MoneyFilters';
import {
  filtersFromParams,
  moneyWindowParams,
} from '../src/features/money/records';
import {
  defaultMoneyFilters,
  moneyView,
  yearExtent,
} from '../src/features/money/view';
import { pinned } from './pinned';

const federal = decodeMoneyGraph(pinned('/graph/money.json'));
const defaults = defaultMoneyFilters(federal);

describe('moneyView with a minimum flow', () => {
  test('the default filters have no minimum and keep every flow', () => {
    expect(defaults.min).toBe(0);
    const all = moneyView(federal, defaults);
    expect(moneyView(federal, { ...defaults, min: 0 })).toEqual(all);
  });

  test('drops every edge under the minimum and keeps every edge at or over it', () => {
    const all = moneyView(federal, defaults);
    for (const min of [10_000, 1_000_000, 100_000_000]) {
      const view = moneyView(federal, { ...defaults, min });
      expect(view.edges).toEqual(all.edges.filter((e) => e.total >= min));
      for (const e of view.edges) expect(e.total).toBeGreaterThanOrEqual(min);
      expect(view.edges.length).toBeLessThan(all.edges.length);
    }
  });

  test('an edge exactly at the minimum stays', () => {
    const all = moneyView(federal, defaults);
    const edge = all.edges[0]!;
    const view = moneyView(federal, { ...defaults, min: edge.total });
    expect(view.edges).toContainEqual(edge);
  });

  test('keeps exactly the nodes at the ends of the remaining edges, so nodes those small flows alone kept are dropped', () => {
    const all = moneyView(federal, defaults);
    const min = 1_000_000;
    const view = moneyView(federal, { ...defaults, min });
    const ends = new Set(view.edges.flatMap((e) => [e.source, e.target]));
    expect(new Set(view.nodes.map((n) => n.id))).toEqual(ends);
    const dropped = all.nodes.filter((n) => !ends.has(n.id));
    expect(dropped.length).toBeGreaterThan(0);
    // Every dropped node had flows, all of them under the minimum.
    for (const node of dropped) {
      const own = all.edges.filter(
        (e) => e.source === node.id || e.target === node.id,
      );
      expect(own.length).toBeGreaterThan(0);
      for (const e of own) expect(e.total).toBeLessThan(min);
    }
    expect(view.meta).toBe(federal.meta);
  });

  test('the minimum applies to the windowed figure, not the all-years one', () => {
    const extent = yearExtent(federal);
    const year = { ...defaults, from: extent.to - 1, to: extent.to - 1 };
    const windowed = moneyView(federal, year);
    const min = 500_000;
    const view = moneyView(federal, { ...year, min });
    expect(view.edges).toEqual(windowed.edges.filter((e) => e.total >= min));
  });

  test('a minimum over every flow leaves an empty map', () => {
    const view = moneyView(federal, { ...defaults, min: 1e15 });
    expect(view.edges).toEqual([]);
    expect(view.nodes).toEqual([]);
  });
});

describe('filtersFromParams reads `min`', () => {
  const read = (min: string | string[] | undefined) =>
    filtersFromParams(federal, min === undefined ? {} : { min }).min;

  test('a positive whole number is the minimum', () => {
    expect(read('250000')).toBe(250000);
    expect(read('1e6')).toBe(1_000_000);
    expect(read(['5000', '7'])).toBe(5000);
  });
  test('missing, empty, invalid, zero or negative gives 0', () => {
    expect(read(undefined)).toBe(0);
    expect(read('')).toBe(0);
    expect(read('abc')).toBe(0);
    expect(read('0')).toBe(0);
    expect(read('-5000')).toBe(0);
    expect(read('Infinity')).toBe(0);
    expect(read('NaN')).toBe(0);
  });
  test('decimals are floored', () => {
    expect(read('1500.7')).toBe(1500);
    expect(read('0.5')).toBe(0);
  });
});

describe('moneyWindowParams writes `min`', () => {
  test("writes '' at 0 and the figure otherwise", () => {
    expect(moneyWindowParams(defaults).min).toBe('');
    expect(moneyWindowParams({ ...defaults, min: 100000 }).min).toBe('100000');
  });
  test('round-trips through filtersFromParams', () => {
    for (const min of [0, 10_000, 2_500_000]) {
      const f = { ...defaults, min };
      expect(filtersFromParams(federal, moneyWindowParams(f))).toEqual(f);
    }
  });
});

describe('the filter sheet carries `min`', () => {
  test('moneyFilterValues reads min from the route, with and without a graph', () => {
    expect(moneyFilterValues(federal, {}).min).toBe(0);
    expect(moneyFilterValues(federal, { min: '100000' }).min).toBe(100000);
    expect(moneyFilterValues(federal, { min: '-1' }).min).toBe(0);
    expect(moneyFilterValues(null, {}).min).toBe(0);
    expect(moneyFilterValues(null, { min: '100000' }).min).toBe(100000);
    expect(moneyFilterValues(null, { min: 'abc' }).min).toBe(0);
  });

  test('moneyFilterParams writes min only when it is over 0', () => {
    const values = moneyFilterValues(federal, {});
    expect(moneyFilterParams(federal, values).min).toBeUndefined();
    expect(moneyFilterParams(federal, { ...values, min: 0 }).min).toBe(
      undefined,
    );
    expect(moneyFilterParams(federal, { ...values, min: 1e6 }).min).toBe(
      '1000000',
    );
    expect(moneyFilterParams(null, { min: 10000 }).min).toBe('10000');
  });

  test('values and params round-trip through the route', () => {
    const params = { min: '10000000', industry: 'finance' };
    const values = moneyFilterValues(federal, params);
    expect(moneyFilterParams(federal, values)).toMatchObject(params);
  });
});

describe('moneyFiltersModel has a Minimum flow row', () => {
  const model = moneyFiltersModel(federal);
  const row = model.rows.find((r) => r.key === 'min')!;
  const initial = model.initial;

  test('the row offers MIN_FLOW_CHOICES, Any amount first', () => {
    expect(row).toBeDefined();
    expect(row.title).toBe('Minimum flow');
    expect(row.choices(initial)).toBe(MIN_FLOW_CHOICES);
    expect(MIN_FLOW_CHOICES[0]).toEqual({ value: '', label: 'Any amount' });
    // Thresholds rise, each ten times the last.
    const values = MIN_FLOW_CHOICES.slice(1).map((c) => Number(c.value));
    for (let i = 1; i < values.length; i++)
      expect(values[i]).toBe(values[i - 1]! * 10);
    expect(model.rows.at(-1)!.key).toBe('min');
  });

  test('the row reads and writes a number', () => {
    expect(initial.min).toBe(0);
    expect(row.value(initial)).toBe('');
    expect(row.value({ ...initial, min: 100000 })).toBe('100000');
    expect(row.select(initial, '1000000').min).toBe(1000000);
    expect(row.select({ ...initial, min: 1000000 }, '').min).toBe(0);
  });

  test('an active minimum counts as a filter, and Reset clears it', () => {
    expect(model.isDefault(initial)).toBe(true);
    expect(model.summary(initial)).toBe('');
    const withMin = row.select(initial, '100000');
    expect(model.isDefault(withMin)).toBe(false);
    expect(model.summary(withMin)).toBe('1 filter');
    const both = { ...withMin, industry: 'finance' };
    expect(model.summary(both)).toBe('2 filters');
    const reset = model.reset(both);
    expect(reset.min).toBe(0);
    expect(reset.industry).toBe('');
    expect(model.isDefault(reset)).toBe(true);
  });

  test('the sheet values for a route with min are not the default', () => {
    expect(model.isDefault(moneyFilterValues(federal, {}))).toBe(true);
    expect(model.isDefault(moneyFilterValues(federal, { min: '10000' }))).toBe(
      false,
    );
  });
});
