import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { rhythm } from '../../design/tokens';

/**
 * One row of call controls, centred, like the Phone app's: each control is a
 * round `IconButton` (`size="large"`), whose symbol keeps its size at every
 * text size and whose long press shows the Large Content Viewer.
 */
export function ControlRow({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rhythm.group,
  },
});
