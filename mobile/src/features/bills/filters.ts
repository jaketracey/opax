import { useSyncExternalStore } from 'react';
import { billSentenceCase, billName } from '../../api/bill-transforms';
import type { billFacetsFor, billsFor } from '../../api/catalogs';
import { formatCount, formatDate } from '../../design/format';
import { CHAMBER_NOT_RECORDED, chamberName } from '../../design/parliament';

export type BillListRow = NonNullable<
  ReturnType<typeof billsFor>['data']
>[number];
export type BillFacets = NonNullable<ReturnType<typeof billFacetsFor>['data']>;

/** The bill list's filters. The search text stays with the list screen. */
export interface BillFilters {
  status?: string;
  /** The originating house's chamber ID. */
  chamber?: string;
  year?: number;
  parliament?: number;
  divided?: boolean;
  sort?: 'newest' | 'oldest' | 'title' | 'divisions';
}
export type BillFilterKey = keyof BillFilters;
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
  return `${value}${suffix} parliament`;
};

// One store shared by the list and its filter sheet, so routes carry no
// filter state. The list publishes the facets once its index loads.
interface State {
  filters: BillFilters;
  facets: BillFacets | null;
}
let state: State = { filters: {}, facets: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
export const billFilterStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  setFilters(filters: BillFilters) {
    state = { ...state, filters: cleaned(filters) };
    emit();
  },
  setFacets(facets: BillFacets | null) {
    if (facets === state.facets) return;
    state = { ...state, facets };
    emit();
  },
  /** For tests: back to no filters and no facets. */
  reset() {
    state = { filters: {}, facets: null };
    emit();
  },
};
export function useBillFilterState(): State {
  return useSyncExternalStore(
    billFilterStore.subscribe,
    billFilterStore.get,
    billFilterStore.get,
  );
}
function cleaned(filters: BillFilters): BillFilters {
  const out: BillFilters = {};
  if (filters.status) out.status = filters.status;
  if (filters.chamber) out.chamber = filters.chamber;
  if (filters.year !== undefined) out.year = filters.year;
  if (filters.parliament !== undefined) out.parliament = filters.parliament;
  if (filters.divided) out.divided = true;
  if (filters.sort) out.sort = filters.sort;
  return out;
}

/** "House of Representatives"; never a raw chamber ID. */
export const chamberLabel = (chamber: string) =>
  chamberName(chamber, 'federal') ?? CHAMBER_NOT_RECORDED;

/** Applied filters as chips: the filter's name in a sentence and its value. */
export function appliedFilters(filters: BillFilters) {
  const chips: { key: BillFilterKey; filter: string; value: string }[] = [];
  if (filters.status)
    chips.push({
      key: 'status',
      filter: 'status',
      value: billSentenceCase(filters.status),
    });
  if (filters.chamber)
    chips.push({
      key: 'chamber',
      filter: 'chamber',
      value: chamberLabel(filters.chamber),
    });
  if (filters.year !== undefined)
    chips.push({ key: 'year', filter: 'year', value: String(filters.year) });
  if (filters.parliament !== undefined)
    chips.push({
      key: 'parliament',
      filter: 'parliament',
      value: parliamentLabel(filters.parliament),
    });
  if (filters.divided)
    chips.push({ key: 'divided', filter: 'divided on', value: 'Yes' });
  return chips;
}
export function withoutFilter(
  filters: BillFilters,
  key: BillFilterKey,
): BillFilters {
  const next = { ...filters };
  delete next[key];
  return next;
}

const bills = (n: number) => `${formatCount(n)} ${n === 1 ? 'bill' : 'bills'}`;
/** "2,989 bills", or "119 of 2,989 bills" once anything narrows the list. */
export function countLine(shown: number, total: number) {
  return shown === total
    ? bills(total)
    : `${formatCount(shown)} of ${bills(total)}`;
}

/**
 * What a bill row says, as the selectors render it: name, dated status,
 * chamber and introduced (or released) date, then sponsor, party and
 * portfolio. `label` is the one VoiceOver element for the row.
 */
export function billRowText(bill: BillListRow) {
  const name = billName(bill);
  const status = billSentenceCase(bill.status) || 'Status not recorded';
  const chamber = bill.originating_house
    ? chamberLabel(bill.originating_house)
    : null;
  // On screen a date never breaks across lines ("25 Jun / 2026"); VoiceOver
  // reads the long form with ordinary spaces.
  const date = (value: string, style: 'short' | 'long') =>
    style === 'short'
      ? formatDate(value, style).replace(/ /g, '\u00A0')
      : formatDate(value, style);
  const introduced = (style: 'short' | 'long') =>
    bill.introduced
      ? `${bill.introducedLabel} ${date(bill.introduced, style)}`
      : null;
  const asAt = (style: 'short' | 'long') =>
    bill.status_as_of ? `as at ${date(bill.status_as_of, style)}` : null;
  const people =
    [bill.sponsor, bill.sponsor_party, bill.portfolio]
      .filter(Boolean)
      .join(' · ') || null;
  return {
    name,
    status,
    asAt: asAt('short'),
    where: [chamber, introduced('short')].filter(Boolean).join(' · ') || null,
    people,
    label: [
      name,
      [status, asAt('long')].filter(Boolean).join(', '),
      chamber,
      introduced('long'),
      bill.sponsor,
      bill.sponsor_party,
      bill.portfolio,
    ]
      .filter(Boolean)
      .join(', '),
  };
}

export const billSorts = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'By name' },
  { value: 'divisions', label: 'Most division records' },
] as const;
