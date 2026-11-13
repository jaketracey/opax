import { useEffect, useMemo, useState } from 'react';
import {
  registerFilterModel,
  type FilterModel,
  type FilterValues,
} from '../../design/filter-sheet';
import { filtersRoute } from '../../navigation/routes/filters';
import { defineModel, facet } from '../sheets/filter-model';
import { moneyFilterModel } from '../sheets/filter-models';
import type { MoneyGraph } from './data';
import { CPI_REFERENCE_YEAR } from './ported/cpi';
import {
  filtersFromParams,
  industryLabel,
  latestCompleteYear,
  param,
  partiesFigureWords,
  type MoneyParams,
} from './records';
import { yearExtent } from './view';

/** The map's filters as the sheet holds them. */
export type MoneyFilterValues = FilterValues & {
  from?: number;
  to?: number;
  industry: string;
  donations: boolean;
  grants: boolean;
  contracts: boolean;
  inflation: boolean;
  /** The smallest flow shown, in dollars, as the `min` route param. */
  min?: number;
};

/** The "Minimum flow" choices: any amount, then round thresholds. */
export const MIN_FLOW_CHOICES = [
  { value: '', label: 'Any amount' },
  { value: '10000', label: '$10,000 and over' },
  { value: '100000', label: '$100,000 and over' },
  { value: '1000000', label: '$1 million and over' },
  { value: '10000000', label: '$10 million and over' },
  { value: '100000000', label: '$100 million and over' },
] as const;

const number = (value: string | string[] | undefined) => {
  const n = Number(param(value));
  return Number.isInteger(n) && param(value) ? n : undefined;
};
/** A minimum flow as `filtersFromParams` reads it: whole dollars, never negative. */
const minimumFlow = (value: string | string[] | undefined) => {
  const n = Number(param(value));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** The sheet's values from the map's route params (the one source of truth). */
export function moneyFilterValues(
  graph: MoneyGraph | null,
  params: MoneyParams,
): MoneyFilterValues {
  if (graph) {
    const f = filtersFromParams(graph, params);
    return {
      from: f.from,
      to: f.to,
      industry: f.industry ?? '',
      donations: f.donations,
      grants: f.grants,
      contracts: f.contracts,
      inflation: f.inflation,
      min: f.min,
    };
  }
  const layers = param(params.layers)?.split(',');
  return {
    from: number(params.from),
    to: number(params.to),
    industry: param(params.industry) ?? '',
    donations: layers ? layers.includes('donations') : true,
    grants: layers ? layers.includes('grants') : true,
    contracts: layers ? layers.includes('contracts') : true,
    inflation: param(params.inflation) === '1',
    min: minimumFlow(params.min),
  };
}

/**
 * Route params for the sheet's values. A value at its default is cleared,
 * so a shared link carries only what the reader changed.
 */
export function moneyFilterParams(
  graph: MoneyGraph | null,
  values: Partial<MoneyFilterValues>,
): Record<string, string | undefined> {
  const extent = graph ? yearExtent(graph) : null;
  const layers = (['donations', 'grants', 'contracts'] as const).filter(
    (key) => values[key] !== false,
  );
  const from = typeof values.from === 'number' ? values.from : undefined;
  const to = typeof values.to === 'number' ? values.to : undefined;
  const allYears =
    !extent ||
    from === undefined ||
    to === undefined ||
    (from <= extent.from && to >= extent.to);
  return {
    from: allYears || from === undefined ? undefined : String(from),
    to: allYears || to === undefined ? undefined : String(to),
    industry: values.industry ? String(values.industry) : undefined,
    layers: layers.length === 3 ? undefined : layers.join(','),
    inflation: values.inflation ? '1' : undefined,
    min:
      typeof values.min === 'number' && values.min > 0
        ? String(values.min)
        : undefined,
  };
}

/**
 * The money filter model (w3's `moneyFilterModel`) bound to a loaded graph:
 * its financial years, the latest complete year and the donor industries,
 * named as the map names them ("Mining and energy"). Before the graph
 * loads, the data rows read "Loads with the map" and only the switches work.
 */
export function moneyFiltersModel(
  graph: MoneyGraph | null,
): FilterModel<FilterValues> {
  // The map's own row: the smallest flow drawn and listed. A `facet`
  // stores a string; the map reads a number, so select converts.
  const minimum = facet('min', 'Minimum flow', MIN_FLOW_CHOICES, {
    value: (state) => (Number(state.min) > 0 ? String(state.min) : ''),
    select: (state, value) => ({ ...state, min: value ? Number(value) : 0 }),
  });
  if (!graph) {
    const model = moneyFilterModel({
      loaded: false,
      dollarsYear: CPI_REFERENCE_YEAR,
    });
    return defineModel({
      ...model,
      initial: { ...model.initial, min: 0 },
      rows: [...model.rows, minimum],
    });
  }
  const extent = yearExtent(graph);
  const years = Array.from(
    { length: Math.max(0, extent.to - extent.from + 1) },
    (_, i) => extent.from + i,
  );
  const latest = latestCompleteYear(graph);
  const industries = [
    ...new Set(
      graph.nodes.filter((n) => n.kind === 'donor').map((n) => n.group),
    ),
  ];
  const model = moneyFilterModel({
    loaded: true,
    years,
    annualReturnYears: latest === null ? [] : [latest],
    industries,
    dollarsYear: CPI_REFERENCE_YEAR,
    donationsLabel: partiesFigureWords(graph).title,
  });
  // defineModel again, so Reset, "N filters" and isDefault know `min`.
  return defineModel({
    ...model,
    initial: { ...model.initial, min: 0 },
    rows: [
      ...model.rows.map((row) =>
        row.key === 'industry'
          ? {
              ...row,
              multiple: true,
              select: (state: FilterValues, value: string) => {
                const values = new Set(
                  String(state.industry ?? '')
                    .split(',')
                    .filter(Boolean),
                );
                if (!value) values.clear();
                else if (values.has(value)) values.delete(value);
                else values.add(value);
                return { ...state, industry: [...values].join(',') };
              },
              choices: (state: FilterValues) => {
                const [all, ...rest] = row.choices(state);
                return [
                  all!,
                  ...rest
                    .map((choice) => ({
                      ...choice,
                      label: industryLabel(choice.value),
                    }))
                    .sort((a, b) => a.label.localeCompare(b.label, 'en-AU')),
                ];
              },
            }
          : row,
      ),
      minimum,
    ],
  });
}

let owners = 0;
/**
 * The map's half of `/filters/money`: registers the model under this
 * screen's own owner key (two maps in two tabs never share a sheet), keeps
 * the sheet in step with the route params, and writes each change straight
 * back to the map's params, so the map behind the sheet updates live.
 * Cancel restores the opening values through the same path.
 */
export function useMoneyFilters(
  graph: MoneyGraph | null,
  params: MoneyParams,
  write: (params: Record<string, string | undefined>) => void,
) {
  const [owner] = useState(() => `money-${++owners}`);
  const model = useMemo(() => moneyFiltersModel(graph), [graph]);
  const value = useMemo(
    () => moneyFilterValues(graph, params),
    [graph, params],
  );
  // Registered at first render so the sheet can open at once; the effect
  // keeps its model, value and writer in step with the route.
  useState(() => registerFilterModel(model, { owner, value }));
  useEffect(() => {
    registerFilterModel(model, {
      owner,
      value,
      onChange: (next) => write(moneyFilterParams(graph, next)),
    });
  }, [owner, model, value, write, graph]);
  return {
    owner,
    href: filtersRoute('money', owner),
    active: !model.isDefault(value),
  };
}
