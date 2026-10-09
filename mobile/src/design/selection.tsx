import { StyleSheet, View } from 'react-native';
import { accents, colors, radii, rhythm, type Accent } from './tokens';

/**
 * Rows in an iPad split list (Oct 2026): the row bleeds 12pt into the
 * margin so its selected wash has room around the text, and a 3pt mark in
 * the category's ink leads the selected row. No chevron: the detail pane is
 * the destination. Rows outside a split (every iPhone row) never use this.
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

/** The selected row's wash: its category's wash. */
export function selectedWash(accent: Accent = 'people') {
  return { backgroundColor: colors[accents[accent].wash] };
}

/** The 3pt mark leading a selected split row; decorative (the state is said). */
export function SelectedMark({ accent = 'people' }: { accent?: Accent }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        splitRowStyles.mark,
        { backgroundColor: colors[accents[accent].ink] },
      ]}
    />
  );
}
