import { useContext, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { currentRule, useLayout } from '../../design/adaptive';
import { designFlags } from '../../design/flags';
import { colors, rhythm } from '../../design/tokens';

/** iOS 26's bottom search field on iPhone, as drawn (w4-seat-01, -ax5-01). */
export const BOTTOM_FIELD_HEIGHT = 48;

/**
 * The space the chooser's list leaves for the bottom search field, or 0.
 * The list ends above the field at every text size, so the last row can
 * be read and tapped without the field covering it. Regular layouts keep
 * search in the bar and Android has no bottom field.
 */
export function bottomFieldClearance(
  safeBottom: number,
  os: string = Platform.OS,
  regular: boolean = currentRule() !== 'phone',
): number {
  if (os !== 'ios' || regular) return 0;
  return safeBottom + BOTTOM_FIELD_HEIGHT + rhythm.tight;
}

/** The chooser's list, ended above the bottom search field (see above). */
export function FieldClearance({ children }: { children: ReactNode }) {
  const safeBottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const { regular, rule } = useLayout();
  const clearance = bottomFieldClearance(
    safeBottom,
    Platform.OS,
    rule === 'pad' || regular,
  );
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
