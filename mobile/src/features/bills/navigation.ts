import { router } from 'expo-router';
import { useSplitPane } from '../../design/primitives';
import { billRoute, billTextRoute } from '../../navigation/routes';

/** What the Bills split's detail pane shows: a bill, or its text. */
export interface BillEntry {
  kind: 'bill' | 'text';
  key: string;
  /** The bill's name, for the pane's Share and Back. */
  title?: string;
}

/**
 * Opening a bill or its text from a bill screen. Inside the Bills split's
 * detail pane (iPad, regular width) it stays in the pane: the text opens
 * above the bill with a Back to it, and another bill becomes the selection.
 * Everywhere else it pushes the route, exactly as before.
 */
export function useBillNavigation() {
  const pane = useSplitPane<BillEntry>();
  return {
    inPane: pane !== null,
    openText(key: string, title?: string) {
      if (pane) pane.push({ kind: 'text', key, title });
      else router.push(billTextRoute(key));
    },
    openBill(key: string, title?: string) {
      if (!pane) return router.push(billRoute(key));
      // From the bill's own text, Back is the way to its page.
      const below = pane.entries.at(-2);
      if (below?.kind === 'bill' && below.key === key) pane.back();
      else pane.select({ kind: 'bill', key, title });
    },
  };
}
