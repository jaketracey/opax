import { useEffect, useState } from 'react';
import { apiClient } from '../../api/runtime';
import { InsetGroup, LinkRow, thisDevice } from '../../design/primitives';
import { readSavedShelf, type ShelfItem } from './saved-shelf';

/** The read may take this long; after it the offline view goes without. */
export const SHELF_WAIT_MS = 300;

let reader: () => Promise<ShelfItem[]> = () => readSavedShelf(apiClient);
/** Tests only: the shelf's read. */
export function setShelfReaderForTests(
  next: (() => Promise<ShelfItem[]>) | null,
) {
  reader = next ?? (() => readSavedShelf(apiClient));
}

/**
 * The shelf for an offline dead end, decided once before that view is first
 * drawn: `undefined` while the saved copies are being read (draw nothing
 * yet), then the rows, or none. The answer never changes afterwards, so the
 * view is whole on its first frame and nothing is added under the reader
 * later. A read that fails or takes longer than `SHELF_WAIT_MS` is no
 * shelf. When `active` is false nothing is read and the answer is none.
 */
export function useSavedShelf(
  active: boolean,
  /**
   * What the answer is for (the failure being shown). A new one starts
   * undecided, as a fresh mount does, so a view whose error turns into an
   * offline one draws nothing until its shelf is decided.
   */
  subject: unknown = null,
): ShelfItem[] | undefined {
  const [decision, setDecision] = useState<{
    subject: unknown;
    items: ShelfItem[];
  } | null>(null);
  useEffect(() => {
    if (!active) return;
    let decided = false;
    const decide = (items: ShelfItem[]) => {
      if (decided) return;
      decided = true;
      clearTimeout(timer);
      setDecision({ subject, items });
    };
    const timer = setTimeout(() => decide(NONE), SHELF_WAIT_MS);
    reader().then(decide, () => decide(NONE));
    return () => {
      decided = true;
      clearTimeout(timer);
    };
  }, [active, subject]);
  if (!active) return NONE;
  return decision && decision.subject === subject ? decision.items : undefined;
}
const NONE: ShelfItem[] = [];

/**
 * "Saved on this iPhone": records with a saved copy, each opening its page,
 * which reads that copy. A plain list under the offline message; each row
 * reads as its title, then "Bill" or "Electorate".
 */
export function SavedShelf({
  items,
  testID = 'saved-shelf',
}: {
  items: readonly ShelfItem[];
  testID?: string;
}) {
  if (!items.length) return null;
  return (
    <InsetGroup header={`Saved on this ${thisDevice()}`} testID={testID}>
      {items.map((item, index) => (
        <LinkRow
          key={item.key}
          title={item.title}
          titleLines={0}
          detail={item.kind}
          href={item.route}
          testID={`${testID}-${index}`}
        />
      ))}
    </InsetGroup>
  );
}
