import { useSyncExternalStore } from 'react';
import type { TextInput, View } from 'react-native';

/**
 * The wide Today search field's state. It lives outside React because the
 * field can be drawn in the navigation bar (a bar item is rendered by the
 * navigator, not by Today) while its dropdown is drawn over Today's page.
 * One Today, one field: only one placement draws at a time.
 */
export interface QuickSearchState {
  text: string;
  focused: boolean;
  /** The field has been used: the dropdown's sources may be read. */
  armed: boolean;
  /** Escape or a tap outside closed the panel; typing opens it again. */
  dismissed: boolean;
}
const initial: QuickSearchState = {
  text: '',
  focused: false,
  armed: false,
  dismissed: false,
};
let state = initial;
const listeners = new Set<() => void>();

export const quickSearch = {
  snapshot: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  set(next: Partial<QuickSearchState>) {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  },
  /** Test isolation, and Today leaving the screen tree. */
  reset() {
    quickSearch.set(initial);
  },
  /** The drawn field, for Cmd-F, blur and the dropdown's anchor. */
  input: { current: null as TextInput | null },
  anchor: { current: null as View | null },
  /** The field's Return key: the dropdown's selection, else the words. */
  submit: { current: () => undefined as void },
};

export function useQuickSearch(): QuickSearchState {
  return useSyncExternalStore(
    quickSearch.subscribe,
    quickSearch.snapshot,
    quickSearch.snapshot,
  );
}
