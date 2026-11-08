import { useContext, type ReactNode } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { isPad } from '../../design/adaptive';
import { designFlags } from '../../design/flags';
import { colors, isAccessibilityCategory, rhythm } from '../../design/tokens';

/** iOS 26's bottom search field on iPhone, as drawn (w4-seat-01, -ax5-01). */
export const BOTTOM_FIELD_HEIGHT = 48;

/**
 * The space the chooser's list leaves for the bottom search field, or 0.
 * At accessibility sizes the rows are taller than the field's glass can
 * soften, so the last visible row read through it (w4-seat-ax5-01): the
 * list ends above the field there. At smaller sizes the list fits above it
 * or scrolls under its scroll edge, as iOS draws it. iPad keeps search in
 * the bar and Android has no bottom field.
 */
export function bottomFieldClearance(
  fontScale: number,
  safeBottom: number,
  os: string = Platform.OS,
  pad: boolean = isPad,
): number {
  if (os !== 'ios' || pad || !isAccessibilityCategory(fontScale)) return 0;
  return safeBottom + BOTTOM_FIELD_HEIGHT + rhythm.tight;
}

/** The chooser's list, ended above the bottom search field (see above). */
export function FieldClearance({ children }: { children: ReactNode }) {
  const { fontScale } = useWindowDimensions();
  const safeBottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const clearance = bottomFieldClearance(fontScale, safeBottom);
  const ground = designFlags.groupedSurfaces ? colors.sunken : colors.paper;
  return (
    <View
      style={[
        styles.fill,
        clearance
          ? { paddingBottom: clearance, backgroundColor: ground }
          : null,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
