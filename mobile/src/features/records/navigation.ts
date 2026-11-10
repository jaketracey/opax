import { useRecordPush } from '../../navigation/record-link';
import { useSplitPane } from '../../design/primitives';
import {
  billRoute,
  billTextRoute,
  docRoute,
  personRoute,
} from '../../navigation/routes';
import type { RecordEntry } from '../split/entry';

/**
 * Opening a record, a bill, its text or a person from a reader. In an iPad
 * split's detail pane it stays in the pane (`pane.push`), with Back to the
 * reader; everywhere else it pushes the route (records.md section 1).
 */
export function useRecordNavigation() {
  const push = useRecordPush();
  const pane = useSplitPane<RecordEntry>();
  return {
    inPane: pane !== null,
    openDoc(slug: string, title?: string) {
      if (pane) pane.push({ kind: 'doc', key: slug, title });
      else push(docRoute(slug));
    },
    openBill(key: string, title?: string) {
      if (pane) pane.push({ kind: 'bill', key, title });
      else push(billRoute(key));
    },
    openText(key: string, version?: string, title?: string) {
      if (pane) pane.push({ kind: 'text', key, title });
      else push(billTextRoute(key, version));
    },
    openPerson(slug: string, name?: string) {
      if (pane) pane.push({ kind: 'person', key: slug, title: name });
      else push(personRoute(slug));
    },
  };
}
