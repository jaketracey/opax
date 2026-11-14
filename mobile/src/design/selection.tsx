import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { Divider } from './controls';
import { accents, colors, radii, type Accent } from './tokens';

// The pill's inner padding: the text keeps the list's leading edge and the
// fill reaches this far into the 20pt margin, so it sits 8pt in from the
// column's edges, as an iOS sidebar's selection does.
const PILL_INSET = 12;

/**
 * Rows in an iPad split list (Oct 2026): the row bleeds into the margin so
 * its selected wash has room around the text. The rounded wash alone marks
 * the selection, as an iOS sidebar draws it (no leading bar: a straight bar
 * on a rounded pill read as clipped, b65), and the separators touching it
 * clear (`useSplitSeparator`, `useRowSelected`). No chevron: the detail pane
 * is the destination. Every split list selects alike, in navy, whatever the
 * row's category: the category's accent belongs to the detail pane (one
 * accent per view). Rows outside a split (every iPhone row) never use this.
 */
export const splitRowStyles = StyleSheet.create({
  bleed: {
    marginHorizontal: -PILL_INSET,
    paddingHorizontal: PILL_INSET,
    borderRadius: radii.container,
    borderCurve: 'continuous',
  },
});

// The one selection: the navy wash (the `people` role), which `contrast.ts`
// checks for every text tone, and which steps stronger under Increase
// Contrast.
const SELECTED = accents.people;

/**
 * The selected row's wash, the same in every list. `accent` is ignored (pass
 * nothing); it stays optional until the callers that still pass one drop it.
 */
export function selectedWash(_accent?: Accent) {
  return { backgroundColor: colors[SELECTED.wash] };
}

/**
 * A FlatList or SectionList separator for a split list: the rule above and
 * the rule below the selected row draw clear, keeping their hairline so no
 * row moves when the selection does. `isSelected` is null outside a split,
 * where every rule draws.
 */
export function useSplitSeparator<T>(
  items: readonly T[],
  isSelected: ((item: T) => boolean) | null,
) {
  const at = isSelected ? items.findIndex(isSelected) : -1;
  const above = at > 0 ? items[at - 1] : undefined;
  const selected = at >= 0 ? items[at] : undefined;
  return useCallback(
    ({ leadingItem }: { leadingItem?: T }) => (
      <Divider
        variant="subtle"
        clear={
          leadingItem !== undefined &&
          (leadingItem === above || leadingItem === selected)
        }
      />
    ),
    [above, selected],
  );
}
