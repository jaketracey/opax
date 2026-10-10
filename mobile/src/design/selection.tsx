import { StyleSheet, View } from 'react-native';
import { accents, colors, radii, rhythm, type Accent } from './tokens';

/**
 * Rows in an iPad split list (Oct 2026): the row bleeds 12pt into the
 * margin so its selected wash has room around the text, and a 3pt mark
 * leads the selected row. No chevron: the detail pane is the destination.
 * Every split list selects alike, in navy, whatever the row's category: the
 * category's accent belongs to the detail pane (one accent per view). Rows
 * outside a split (every iPhone row) never use this.
 */
export const splitRowStyles = StyleSheet.create({
  bleed: {
    marginHorizontal: -rhythm.heading,
    paddingHorizontal: rhythm.heading,
    borderRadius: radii.md,
    borderCurve: 'continuous',
  },
  mark: {
    position: 'absolute',
    left: 0,
    top: rhythm.heading,
    bottom: rhythm.heading,
    width: 3,
    borderRadius: 1.5,
  },
});

// The one selection: the navy wash and ink (the `people` roles), which
// `contrast.ts` checks for every text tone and under Increase Contrast.
const SELECTED = accents.people;

/**
 * The selected row's wash, the same in every list. `accent` is ignored (pass
 * nothing); it stays optional until the callers that still pass one drop it.
 */
export function selectedWash(_accent?: Accent) {
  return { backgroundColor: colors[SELECTED.wash] };
}

/** The 3pt mark leading a selected split row; decorative (the state is said). */
export function SelectedMark(_props: { accent?: Accent }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[splitRowStyles.mark, { backgroundColor: colors[SELECTED.ink] }]}
    />
  );
}
