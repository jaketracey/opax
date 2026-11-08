import { useSyncExternalStore } from 'react';
import type { FilterList } from '../../navigation/routes/filters';

export type FilterValue = string | number | boolean | null | undefined;
export type FilterValues = Record<string, FilterValue>;
export interface FilterChoice {
  value: string;
  label: string;
  count?: number;
}
export interface FilterRow<S> {
  key: string;
  title: string;
  kind: 'facet' | 'years';
  value: (state: S) => string;
  choices: (state: S) => readonly FilterChoice[];
  select: (state: S, value: string) => S;
  disabled?: boolean;
  disabledLabel?: string;
  /**
   * The choices are still loading (shell 10 states): the row reads "All"
   * and its pushed list draws a skeleton until the data arrives.
   */
  loading?: boolean;
  searchPlaceholder?: string;
  multiple?: boolean;
}
export interface FilterToggle<S> {
  key: string;
  label: string;
  value: (state: S) => boolean;
  select: (state: S, value: boolean) => S;
  group?: string;
}
export interface FilterToggleGroup {
  key: string;
  header?: string;
  footer?: string;
}
export interface FilterModel<S> {
  list: FilterList;
  initial: S;
  rows: FilterRow<S>[];
  toggles?: FilterToggle<S>[];
  toggleGroups?: FilterToggleGroup[];
  segments?: {
    key: string;
    label: string;
    options: readonly FilterChoice[];
    value: (state: S) => string;
    select: (state: S, value: string) => S;
  };
  years?: {
    options: readonly FilterChoice[];
    from: keyof S;
    to: keyof S;
    numeric?: boolean;
  };
  footer?: string;
  resultLine?: (state: S) => string;
  normalise?: (state: S) => S;
  isDefault: (state: S) => boolean;
  reset: (state: S) => S;
  summary: (state: S) => string;
}
/** Data-bound models are registered by each list after its catalogue loads. */
export function createFilterStore<S>(
  model: FilterModel<S>,
  value = model.initial,
  onChange?: (next: S) => void,
) {
  let currentModel = model;
  let state = model.normalise?.(value) ?? value;
  const listeners = new Set<() => void>();
  return {
    get model() {
      return currentModel;
    },
    get: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next: S) {
      state = currentModel.normalise?.(next) ?? next;
      onChange?.(state);
      listeners.forEach((listener) => listener());
    },
    configure(next: FilterModel<S>, value?: S, notify?: (next: S) => void) {
      currentModel = next;
      if (notify) onChange = notify;
      // A fresh snapshot also re-renders an open sheet when choices load.
      state = next.normalise?.(value ?? state) ?? value ?? { ...state };
      listeners.forEach((listener) => listener());
    },
  };
}
export type FilterStore<S> = ReturnType<typeof createFilterStore<S>>;
// The owner key isolates e.g. a bill list in Today from another in Ask.
const stores = new Map<string, FilterStore<FilterValues>>();
const keyFor = (list: FilterList, owner = '') => `${list}:${owner}`;
export function registerFilterModel<S extends object = FilterValues>(
  model: FilterModel<S>,
  options: {
    owner?: string;
    value?: S;
    onChange?: (next: S) => void;
  } = {},
) {
  const current = stores.get(keyFor(model.list, options.owner)) as unknown as
    | FilterStore<S>
    | undefined;
  if (current) {
    current.configure(model, options.value, options.onChange);
    return current;
  }
  const store = createFilterStore(model, options.value, options.onChange);
  stores.set(
    keyFor(model.list, options.owner),
    store as unknown as FilterStore<FilterValues>,
  );
  return store;
}
export function filterStore<S extends object = FilterValues>(
  list: FilterList,
  owner?: string,
) {
  return stores.get(keyFor(list, owner)) as unknown as
    | FilterStore<S>
    | undefined;
}
export function useFilterState<S extends object = FilterValues>(
  list: FilterList,
  owner?: string,
): [S, (next: S) => void] {
  const store = filterStore<S>(list, owner);
  if (!store)
    throw new Error(
      `Register the ${list} filter model before reading its state`,
    );
  return [
    useSyncExternalStore(store.subscribe, store.get, store.get),
    store.set,
  ];
}
/** Cancel is the only revert. Done and interactive dismissal require no writes. */
export function beginFilterSession<S>(store: FilterStore<S>) {
  const snapshot = store.get();
  return { snapshot, cancel: () => store.set(snapshot) };
}

export function facet(
  key: string,
  title: string,
  choices: readonly FilterChoice[],
  options: Partial<FilterRow<FilterValues>> = {},
): FilterRow<FilterValues> {
  return {
    key,
    title,
    kind: 'facet',
    value: (state) => String(state[key] ?? ''),
    choices: () => choices,
    select: (state, value) => ({ ...state, [key]: value }),
    ...options,
  };
}
export function toggle(
  key: string,
  label: string,
  stringValue = false,
): FilterToggle<FilterValues> {
  return {
    key,
    label,
    value: (state) => (stringValue ? state[key] === '1' : !!state[key]),
    select: (state, value) => ({
      ...state,
      [key]: stringValue ? (value ? '1' : '') : value,
    }),
  };
}
export function defineModel(
  input: Omit<FilterModel<FilterValues>, 'reset' | 'isDefault' | 'summary'> & {
    preserveOnReset?: string[];
  },
): FilterModel<FilterValues> {
  const { preserveOnReset = [], ...model } = input;
  const keys = [
    ...new Set([
      ...Object.keys(model.initial),
      ...model.rows.map((row) => row.key),
      ...(model.toggles ?? []).map((row) => row.key),
      ...(model.segments ? [model.segments.key] : []),
    ]),
  ].filter((key) => !preserveOnReset.includes(key));
  const same = (a: FilterValue, b: FilterValue) =>
    a === b ||
    ((a == null || a === '' || a === false) &&
      (b == null || b === '' || b === false));
  const active = (state: FilterValues) =>
    keys.filter(
      (key) => !same(state[key] ?? model.initial[key], model.initial[key]),
    );
  return {
    ...model,
    normalise: (state) => ({
      ...model.initial,
      ...Object.fromEntries(
        Object.entries(state).map(([key, value]) => [
          key,
          value ?? model.initial[key],
        ]),
      ),
    }),
    isDefault: (state) => active(state).length === 0,
    reset: (state) => ({
      ...state,
      ...Object.fromEntries(keys.map((key) => [key, model.initial[key]])),
    }),
    summary: (state) => {
      const count = new Set(
        active(state).map((key) =>
          model.years && (key === model.years.from || key === model.years.to)
            ? 'years'
            : key,
        ),
      ).size;
      return count ? `${count} ${count === 1 ? 'filter' : 'filters'}` : '';
    },
  };
}
