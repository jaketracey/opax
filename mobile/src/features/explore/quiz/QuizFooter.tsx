import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAccessibilitySize } from '../../../design/accessibility';
import { Button } from '../../../design/controls';
import { designFlags } from '../../../design/flags';
import { colors, rhythm } from '../../../design/tokens';

export interface FooterAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}

/** Below AX1 on iOS the one primary action is pinned above the tab bar. */
export function useToolbarFooter() {
  const large = useAccessibilitySize();
  return Platform.OS === 'ios' && !large;
}

/**
 * The one primary action. On iOS below AX1 it is a full-width capsule pinned
 * under the scroll view, inside the screen's own safe area, which UIKit
 * extends over the tab bar: so it always sits above the bar. It was a
 * bottom `Stack.Toolbar`, which iOS 26 draws under the floating tab bar on
 * pushed pages (explore-04, w4-quiz-02). It is hidden while the typed guess
 * is focused (the keyboard's Done is then the only action). At AX1 and
 * above, and on Android, the same button flows after the content, so it
 * never covers half the screen. Render it twice, once with
 * `placement="toolbar"` after the scroll view and once with
 * `placement="content"` at the end of the content; each draws only in its
 * own mode.
 */
export function QuizFooter({
  action,
  placement,
  hidden = false,
  width,
}: {
  action: FooterAction | null;
  placement: 'toolbar' | 'content';
  hidden?: boolean;
  /** The content column's width, so the capsule lines up with the rows. */
  width?: number;
}) {
  const toolbar = useToolbarFooter();
  if (!action || toolbar !== (placement === 'toolbar')) return null;
  const button = (
    <Button
      label={action.label}
      variant="primary"
      fullWidth
      disabled={action.disabled}
      onPress={action.onPress}
      testID={action.testID}
    />
  );
  if (placement === 'content' || hidden) return hidden ? null : button;
  return (
    <SafeAreaView
      edges={['bottom']}
      testID="quiz-footer"
      style={[
        styles.pinned,
        {
          backgroundColor: designFlags.groupedSurfaces
            ? colors.sunken
            : colors.paper,
        },
      ]}
    >
      <View style={width ? { width } : styles.stretch}>{button}</View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  pinned: {
    alignItems: 'center',
    paddingTop: rhythm.tight,
    paddingBottom: rhythm.tight,
  },
  stretch: { alignSelf: 'stretch', paddingHorizontal: rhythm.screen },
});
