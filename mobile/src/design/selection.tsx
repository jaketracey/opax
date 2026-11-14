import { useCallback, useContext } from 'react';
import { StyleSheet } from 'react-native';
import { Divider } from './controls';
import { ColumnMarginContext } from './row-padding';
import { accents, colors, radii, rhythm, type Accent } from './tokens';

// The selected fill sits this far in from the column's edges, as an iOS
// sidebar's selection does: it reaches into the column's margin by the
// margin less this gap (12pt of a 20pt margin, 8pt of Search's 16pt), at
// most PILL_INSET, and pads the text by the same, so the text keeps the
// list's leading edge.
const EDGE_GAP = 8;
const PILL_INSET = 12;
// The selected row's outline. Every split row draws it, clear at rest, so
// no row moves when the selection does; its width comes out of the row's
// padding, so the text and the row's height stay where they were.
const OUTLINE = 1;

function bleed(inset: number) {
  return {
    marginHorizontal: -inset,
    paddingHorizontal: inset - OUTLINE,
    paddingVertical: rhythm.row - OUTLINE,
    borderWidth: OUTLINE,
    borderColor: 'transparent',
    borderRadius: radii.container,
    borderCurve: 'continuous',
  } as const;
}

/**
 * Rows in an iPad split list (Oct 2026): the row bleeds into the margin so
 * its selected wash has room around the text. The rounded wash and its 1pt
 * outline mark the selection (no leading bar: a straight bar on a rounded
 * pill read as clipped, b65; the wash alone is under 3:1 against the page,
 * so the outline carries the state), and the separators touching it clear
 * (`useSplitSeparator`, `useRowSelected`). No chevron: the detail pane is
 * the destination. Every split list selects alike, in navy, whatever the
 * row's category: the category's accent belongs to the detail pane (one
 * accent per view). Rows outside a split (every iPhone row) never use this.
 * `bleed` is for a 20pt column, `narrow` for a 16pt one; rows take theirs
 * from `useSplitBleed`.
 */
export const splitRowStyles = StyleSheet.create({
  bleed: bleed(PILL_INSET),
  narrow: bleed(16 - EDGE_GAP),
});

/** The split row style for the column the row sits in. */
export function useSplitBleed() {
  const margin = useContext(ColumnMarginContext);
  return margin - EDGE_GAP >= PILL_INSET
    ? splitRowStyles.bleed
    : splitRowStyles.narrow;
}

// The one selection: the navy wash (the `people` role), which `contrast.ts`
// checks for every text tone, and which steps stronger under Increase
// Contrast; its outline is `lineControl`, 3:1 against the page.
const SELECTED = accents.people;

/**
 * The selected row's wash and outline, the same in every list. `accent` is
 * ignored (pass nothing); it stays optional until the callers that still
 * pass one drop it.
 */
export function selectedWash(_accent?: Accent) {
  return {
    backgroundColor: colors[SELECTED.wash],
    borderColor: colors.lineControl,
  };
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
