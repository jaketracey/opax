import { useSyncExternalStore } from 'react';
import type { TabSegment } from '../../navigation/chrome';

/** A tab other than Ask that an arrival left. */
export type SourceTab = Exclude<TabSegment, '(ask)'>;

/**
 * The way back from Ask after an arrival from another tab's page
 * (journeys/ask.md 4.2): which tab holds that page, and the name the back
 * item reads ("Back to {name}"). The page itself stays on its tab's stack,
 * so switching back to the tab returns to it as it was.
 */
export type AskReturn = { tab: SourceTab; name: string };

/** The tab bar's own names, for a page that gives no name of its own. */
export const sourceTabNames: Readonly<Record<SourceTab, string>> = {
  '(today)': 'Today',
  '(your-mp)': 'Your MP',
  '(bills)': 'Bills',
  '(search)': 'Search',
};

export function sourceTab(segment: string | undefined): SourceTab | null {
  return segment && segment in sourceTabNames ? (segment as SourceTab) : null;
}

let current: AskReturn | null = null;
const listeners = new Set<() => void>();

export function setAskReturn(next: AskReturn | null) {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}
export const askReturnSnapshot = () => current;
export function subscribeAskReturn(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useAskReturn() {
  return useSyncExternalStore(
    subscribeAskReturn,
    askReturnSnapshot,
    askReturnSnapshot,
  );
}

/**
 * Called with every selected tab (the tab layout). Leaving the Ask tab by
 * any route, the back item included, ends the way back: the reader is on
 * another tab's page now, and coming back to Ask by its tab is an ordinary
 * visit. Sheets and other screens outside the tabs (Account, Talk) keep it.
 */
export function noteSelectedTab(segment: string | undefined) {
  if (current && sourceTab(segment)) setAskReturn(null);
}
