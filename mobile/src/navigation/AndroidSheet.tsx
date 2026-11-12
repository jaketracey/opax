import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReduceMotion } from '../design/accessibility';
import { Text } from '../design/text';
import { colors, minimumTarget, radii, rhythm } from '../design/tokens';

/**
 * Android's sheet for a short choice or a ⋯ menu: a panel from the foot of
 * the screen over a scrim, as Material's modal bottom sheet and the iPhone's
 * action sheet both sit. Route notes use native Material bottom sheets;
 * filters with nested stacks use a full-screen dialog. Back, the scrim
 * and the last row close this menu.
 */
export function AndroidBottomSheet({
  title,
  onClose,
  closeLabel,
  testID,
  children,
}: {
  /** Said once, small, as the iPhone action sheet's title. */
  title: string;
  onClose: () => void;
  /** A last row that closes the sheet ("Cancel"); without one, the scrim is "Done". */
  closeLabel?: string;
  testID?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType={reduced ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {/* With a closing row, TalkBack hears that row, not a second one. */}
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim]}
          accessible={!closeLabel}
          importantForAccessibility={closeLabel ? 'no' : 'yes'}
          accessibilityLabel={closeLabel ? undefined : 'Done'}
          accessibilityRole="button"
          onPress={onClose}
        />
        <View
          style={[
            styles.panel,
            {
              paddingBottom: insets.bottom + rhythm.tight,
              paddingLeft: insets.left,
              paddingRight: insets.right,
            },
          ]}
          accessibilityViewIsModal
          role="dialog"
          accessibilityLabel={title || 'Actions'}
          testID={testID}
        >
          <View accessible={false} style={styles.handle} />
          <Text
            wordSafe
            variant="secondary"
            accessibilityRole="header"
            style={styles.title}
          >
            {title}
          </Text>
          <ScrollView bounces={false}>{children}</ScrollView>
          {closeLabel ? (
            <AndroidSheetRow
              label={closeLabel}
              onPress={onClose}
              testID={testID ? `${testID}-close` : undefined}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/** One row of an Android sheet: the whole width, Material's ripple. */
export function AndroidSheetRow({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.sunken }}
      style={styles.row}
      onPress={onPress}
      testID={testID}
    >
      <Text wordSafe variant="strong">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  handle: {
    width: 32,
    height: 4,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
    backgroundColor: colors.inkSoft,
    alignSelf: 'center',
    marginBottom: rhythm.tight,
  },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  // The ink at 40%: the scrim is a role, not a new colour.
  scrim: { backgroundColor: colors.ink, opacity: 0.4 },
  panel: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.container,
    borderTopRightRadius: radii.container,
    paddingTop: rhythm.block,
    maxHeight: '85%',
    borderCurve: 'continuous',
  },
  title: {
    paddingHorizontal: rhythm.screen,
    paddingBottom: rhythm.tight,
  },
  row: {
    minHeight: minimumTarget,
    justifyContent: 'center',
    paddingHorizontal: rhythm.screen,
    paddingVertical: rhythm.row,
  },
});
