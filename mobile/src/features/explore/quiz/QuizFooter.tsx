import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { useAccessibilitySize } from '../../../design/accessibility';
import { Button } from '../../../design/controls';

export interface FooterAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}

/** Below AX1 on iOS the one primary action sits in a bottom toolbar. */
export function useToolbarFooter() {
  const large = useAccessibilitySize();
  return Platform.OS === 'ios' && !large;
}

/**
 * The one primary action. On iOS below AX1 it is a full-width capsule in a
 * bottom `Stack.Toolbar`, which rides above the tab bar natively, hidden
 * while the typed guess is focused (the keyboard's Done is then the only
 * action). At AX1 and above, and on Android, the same button flows after
 * the content, so it never covers half the screen. Render it twice, once
 * with `placement="toolbar"` outside the scroll view and once with
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
  if (placement === 'content') return hidden ? null : button;
  return (
    <Stack.Toolbar placement="bottom">
      <Stack.Toolbar.View hidden={hidden}>
        <View style={width ? { width } : { alignSelf: 'stretch' }}>
          {button}
        </View>
      </Stack.Toolbar.View>
    </Stack.Toolbar>
  );
}
