import { useEffect, useState, useSyncExternalStore } from 'react';
import { billEnding, billStatusLabel } from '../../api/bill-status';
import { billFoldText, billName } from '../../api/bill-transforms';
import type { billsFor } from '../../api/catalogs';
import { counted, formatCount } from '../../design/format';
import { CHAMBER_NOT_RECORDED, chamberName } from '../../design/parliament';
import {
  filterStore,
  registerFilterModel,
  type FilterChoice,
  type FilterModel,
  type FilterRow,
  type FilterValues,
} from '../sheets/filter-model';
import { billsFilterModel } from '../sheets/filter-models';
import { partyFromCode } from './party-codes';
import { rowDate, statusEventText } from './status-event';

export type BillListRow = NonNullable<
  ReturnType<typeof billsFor>['data']
>[number];

/** What the list shows before any filter: never a filter itself. */
export type BillScope = 'before' | 'passed' | 'all';
export const scopes: readonly { value: BillScope; label: string }[] = [
  { value: 'before', label: 'Before parliament' },
  { value: 'passed', label: 'Passed' },
  { value: 'all', label: 'All' },
];
export const isScope = (value: unknown): value is BillScope =>
  value === 'before' || value === 'passed' || value === 'all';

export type BillSort = 'newest' | 'oldest' | 'title' | 'divisions';
const isSort = (value: unknown): value is BillSort =>
  value === 'newest' ||
  value === 'oldest' ||
  value === 'title' ||
  value === 'divisions';
export const sortLabels: Record<BillSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  title: 'Name',
  divisions: 'Most recorded votes',
};

/**
 * The list's filters as the bills `FilterModel` holds them. Scope and sort
 * are not filters: they never count in "Filters, 2 on".
 */
export interface BillFilters {
  parliament?: number;
  status?: string;
  /** The originating house's chamber ID. */
  chamber?: string;
  portfolio?: string;
  divided?: boolean;
  sort?: BillSort;
}
export const FILTER_KEYS = [
  'parliament',
  'status',
  'chamber',
  'portfolio',
  'divided',
] as const;

export const parliamentLabel = (value: number) => {
  const lastTwo = value % 100;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? 'th'
      : value % 10 === 1
        ? 'st'
        : value % 10 === 2
          ? 'nd'
          : value % 10 === 3
            ? 'rd'
            : 'th';
  return `${value}${suffix} Parliament`;
};

/** "House of Representatives"; never a raw chamber ID. */
export const chamberLabel = (chamber: string) =>
  chamberName(chamber, 'federal') ?? CHAMBER_NOT_RECORDED;

/** The filters a state holds, from the model's loose values. */
export function billFilters(state: FilterValues): BillFilters {
  const out: BillFilters = {};
  if (typeof state.parliament === 'number') out.parliament = state.parliament;
  if (typeof state.status === 'string' && state.status)
    out.status = state.status;
  if (typeof state.chamber === 'string' && state.chamber)
    out.chamber = state.chamber;
  if (typeof state.portfolio === 'string' && state.portfolio)
    out.portfolio = state.portfolio;
  if (state.divided === true) out.divided = true;
  if (isSort(state.sort)) out.sort = state.sort;
  return out;
}
/** How many filters are on: scope and sort never count. */
export function activeFilterCount(filters: BillFilters, scope: BillScope) {
  return FILTER_KEYS.filter(
    (key) =>
      filters[key] !== undefined &&
      filters[key] !== false &&
      (key !== 'status' || scope === 'all'),
  ).length;
}

const inScope = (row: BillListRow, scope: BillScope) =>
  scope === 'all'
    ? true
    : scope === 'before'
      ? row.status === 'before_parliament'
      : row.status === 'passed';
type Dimension = (typeof FILTER_KEYS)[number];
function matches(
  row: BillListRow,
  filters: BillFilters,
  scope: BillScope,
  skip?: Dimension,
) {
  return (
    inScope(row, scope) &&
    (skip === 'parliament' ||
      filters.parliament === undefined ||
      row.parliament === filters.parliament) &&
    (skip === 'status' ||
      scope !== 'all' ||
      !filters.status ||
      row.status === filters.status) &&
    (skip === 'chamber' ||
      !filters.chamber ||
      row.originating_house === filters.chamber) &&
    (skip === 'portfolio' ||
      !filters.portfolio ||
      row.portfolio === filters.portfolio) &&
    (skip === 'divided' || !filters.divided || row.divisions > 0)
  );
}

const activity = (row: BillListRow) => row.status_as_of ?? row.introduced ?? '';
/**
 * The scope's rows, filtered and sorted. "Newest first" is the introduced
 * date for Before parliament and All, and the status date for Passed.
 */
export function billRows(
  rows: readonly BillListRow[],
  filters: BillFilters,
  scope: BillScope,
): BillListRow[] {
  const sort = filters.sort ?? 'newest';
  const date =
    scope === 'passed' ? activity : (r: BillListRow) => r.introduced ?? '';
  const name = (r: BillListRow) => billFoldText(billName(r));
  return rows
    .filter((row) => matches(row, filters, scope))
    .sort((a, b) =>
      sort === 'title'
        ? name(a).localeCompare(name(b))
        : sort === 'divisions'
          ? b.divisions - a.divisions || name(a).localeCompare(name(b))
          : sort === 'oldest'
            ? date(a).localeCompare(date(b)) || name(a).localeCompare(name(b))
            : date(b).localeCompare(date(a)) || name(a).localeCompare(name(b)),
    );
}
/** Rows in scope before any filter or search: the "of 1,793" total. */
export const scopeTotal = (rows: readonly BillListRow[], scope: BillScope) =>
  rows.filter((row) => inScope(row, scope)).length;

/**
 * Each choice's count with every other active filter applied, so a choice
 * that would empty the list says "0" before it is chosen.
 */
export function facetCounts(
  rows: readonly BillListRow[],
  filters: BillFilters,
  scope: BillScope,
  dimension: Dimension,
): Map<string, number> {
  const counts = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    if (!matches(row, filters, scope, dimension)) continue;
    total++;
    const value =
      dimension === 'parliament'
        ? row.parliament
        : dimension === 'status'
          ? row.status
          : dimension === 'chamber'
            ? row.originating_house
            : dimension === 'portfolio'
              ? row.portfolio
              : row.divisions > 0
                ? 'true'
                : '';
    if (value !== null && value !== undefined && value !== '')
      counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
  }
  counts.set('', total);
  return counts;
}

const STATUS_ORDER = [
  'before_parliament',
  'exposure_draft',
  'passed',
  'lapsed',
];
/**
 * "48th Parliament (2025 to now)": the years run from the first bill
 * introduced in it to the first introduced in the next.
 */
function parliamentChoices(rows: readonly BillListRow[]): FilterChoice[] {
  const starts = new Map<number, number>();
  for (const row of rows) {
    const year = Number(row.introduced?.slice(0, 4));
    if (row.parliament == null || !year) continue;
    const start = starts.get(row.parliament);
    if (start === undefined || year < start) starts.set(row.parliament, year);
  }
  const numbers = [...new Set(rows.map((r) => r.parliament))]
    .filter((n): n is number => typeof n === 'number')
    .sort((a, b) => b - a);
  return numbers.map((n) => {
    const start = starts.get(n);
    const end = starts.get(n + 1);
    return {
      value: String(n),
      label: start
        ? `${parliamentLabel(n)} (${start} to ${n === numbers[0] ? 'now' : (end ?? start)})`
        : parliamentLabel(n),
    };
  });
}

/**
 * The bills `FilterModel` (wave 3) bound to one list's rows and scope: the
 * choices the index holds, each counted with the other filters applied, and
 * the live result line.
 */
export function boundBillsModel(
  rows: readonly BillListRow[],
  scope: BillScope,
): FilterModel<FilterValues> {
  const statuses = [...new Set(rows.map((r) => r.status))]
    .sort(
      (a, b) =>
        (STATUS_ORDER.includes(a) ? STATUS_ORDER.indexOf(a) : 99) -
          (STATUS_ORDER.includes(b) ? STATUS_ORDER.indexOf(b) : 99) ||
        a.localeCompare(b),
    )
    .map((value) => ({
      value,
      label: billStatusLabel(value),
    }));
  const chambers = ['representatives', 'senate']
    .filter((c) => rows.some((r) => r.originating_house === c))
    .map((value) => ({ value, label: chamberLabel(value) }));
  const portfolios = [
    ...new Set(rows.map((r) => r.portfolio).filter((p): p is string => !!p)),
  ].map((value) => ({ value, label: value }));
  const base = billsFilterModel({
    scope,
    parliaments: parliamentChoices(rows),
    statuses,
    chambers,
    portfolios,
    resultCount: (state) => billRows(rows, billFilters(state), scope).length,
  });
  const counted = (row: FilterRow<FilterValues>): FilterRow<FilterValues> =>
    row.key === 'sort'
      ? row
      : {
          ...row,
          choices: (state) => {
            const counts = facetCounts(
              rows,
              billFilters(state),
              scope,
              row.key as Dimension,
            );
            return row.choices(state).map((choice) => ({
              ...choice,
              count: counts.get(choice.value) ?? 0,
            }));
          },
        };
  return { ...base, rows: base.rows.map(counted) };
}

// The Bills tab keeps its scope while the app runs, as its filters do; a
// pushed list owns its own copy, dropped when it pops.
const tabScope = { value: 'before' as BillScope };
const scopeListeners = new Set<() => void>();
export const billListScope = {
  get: () => tabScope.value,
  set(scope: BillScope) {
    tabScope.value = scope;
    scopeListeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    scopeListeners.add(listener);
    return () => {
      scopeListeners.delete(listener);
    };
  },
};

/**
 * One list's state: scope, filters and sort. `owner` 'tab' is the Bills
 * tab's state, kept while the app runs; any other owner (a pushed list's
 * route key) is created from its route params and edits only itself.
 */
export function useBillListState(
  owner: string,
  initial: { scope?: BillScope; sort?: BillSort } = {},
) {
  const tab = owner === 'tab';
  const tabValue = useSyncExternalStore(
    billListScope.subscribe,
    billListScope.get,
    billListScope.get,
  );
  const [ownScope, setOwnScope] = useState<BillScope>(
    initial.scope ?? 'before',
  );
  const scope = tab ? tabValue : ownScope;
  const setScope = tab ? billListScope.set : setOwnScope;
  const [store] = useState(
    () =>
      filterStore('bills', owner) ??
      registerFilterModel(billsFilterModel({ scope }), {
        owner,
        ...(initial.sort ? { value: { sort: initial.sort } } : {}),
      }),
  );
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  return {
    scope,
    setScope,
    filters: billFilters(state),
    state,
    store,
  };
}

/** Binds the model to the loaded rows once they arrive (and per scope). */
export function useBoundBillsModel(
  owner: string,
  rows: readonly BillListRow[] | null,
  scope: BillScope,
) {
  useEffect(() => {
    if (!rows) return;
    registerFilterModel(boundBillsModel(rows, scope), { owner });
  }, [owner, rows, scope]);
}

const bills = (n: number) => `${counted(n, 'bill', 'bills')}`;
/** "119 bills", or "27 of 1,793 bills" once a filter narrows the scope. */
export function countLine(
  shown: number,
  total: number,
  filtered = shown !== total,
) {
  return filtered ? `${formatCount(shown)} of ${bills(total)}` : bills(shown);
}

/**
 * What a bill row says: name, status (spoken even when the capsule is
 * hidden), the dated event, and the sponsor with their recorded party or
 * else the portfolio. Never the chamber.
 */
export function billRowText(
  bill: BillListRow & { status_stage?: string | null },
) {
  const name = billName(bill);
  const status = billStatusLabel(bill.status, billEnding(bill));
  const event = rowDate(bill);
  const sponsor = bill.sponsor || null;
  const party = sponsor ? partyFromCode(bill.sponsor_party) : null;
  const meta:
    | { sponsor: string; party: string | null }
    | { portfolio: string }
    | undefined = sponsor
    ? { sponsor, party: party ?? null }
    : bill.portfolio
      ? { portfolio: `${bill.portfolio} portfolio` }
      : undefined;
  return {
    name,
    status,
    date: event ? statusEventText(event) : null,
    meta,
    label: `${[
      name,
      [status, event ? statusEventText(event, 'long') : null]
        .filter(Boolean)
        .join(', '),
      sponsor
        ? [sponsor, party].filter(Boolean).join(', ')
        : bill.portfolio
          ? `${bill.portfolio} portfolio`
          : null,
    ]
      .filter(Boolean)
      .join('. ')}.`,
  };
}

/** Sort words for the Filters button's value: "sorted by name". */
export function sortValue(sort: BillSort | undefined, scope: BillScope) {
  void scope;
  return sort && sort !== 'newest'
    ? `sorted by ${sortLabels[sort].toLocaleLowerCase('en-AU')}`
    : null;
}
