// In an iPad split pane the bill text has no navigation bar: its Version
// menu, Contents and ⋯ go in the pane's own bar (records.md 4.3). The
// embedded reader publishes them here by bill key; the pane bar
// (`split/RecordDetail.tsx`) draws them beside Share.
import { useSyncExternalStore } from 'react';
import type { RowMenuLeaf } from '../../design/row-link';

export interface BillTextPaneItems {
  /** The bar's Version label ("As passed") and its spoken form. */
  version: { label: string; accessibilityLabel: string } | null;
  versions: { id: string; label: string; current: boolean }[];
  choose: (id: string) => void;
  /** Opens Contents, when the version has two or more sections. */
  contents: (() => void) | null;
  /** The ⋯ menu: Bill page, Copy link, Share as text file, the original. */
  menu: RowMenuLeaf[];
  title: string;
  /** The bill page path, with the shown version when it isn't the default. */
  sharePath: string;
}
const panes = new Map<string, BillTextPaneItems>();
const listeners = new Set<() => void>();
export function setBillTextPane(key: string, items: BillTextPaneItems | null) {
  if (items) panes.set(key, items);
  else panes.delete(key);
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function useBillTextPane(key: string): BillTextPaneItems | null {
  return useSyncExternalStore(
    subscribe,
    () => panes.get(key) ?? null,
    () => panes.get(key) ?? null,
  );
}
