import { useSyncExternalStore } from 'react';
import type { DirectoryKind, Facet, Filters } from './model';
interface State {
  filters: Filters;
  facets: Facet[];
}
let states: Record<DirectoryKind, State> = {
  person: { filters: {}, facets: [] },
  party: { filters: {}, facets: [] },
  electorate: { filters: {}, facets: [] },
};
const listeners = new Set<() => void>();
export const directoryStore = {
  get: (kind: DirectoryKind) => states[kind],
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  set: (kind: DirectoryKind, filters: Filters) => {
    states = { ...states, [kind]: { ...states[kind], filters } };
    listeners.forEach((l) => l());
  },
  facets: (kind: DirectoryKind, facets: Facet[]) => {
    if (states[kind].facets === facets) return;
    states = { ...states, [kind]: { ...states[kind], facets } };
    listeners.forEach((l) => l());
  },
};
export function useDirectoryState(kind: DirectoryKind) {
  return useSyncExternalStore(
    directoryStore.subscribe,
    () => directoryStore.get(kind),
    () => directoryStore.get(kind),
  );
}
export const directoryKind = (value: unknown): DirectoryKind =>
  value === 'party' || value === 'electorate' ? value : 'person';
