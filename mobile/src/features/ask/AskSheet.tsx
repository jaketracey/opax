import type { ReactNode, RefObject } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  IconButton,
  Heading,
  KeyboardStableScreen,
  Screen,
} from '../../design/primitives';
import { colors, rhythm } from '../../design/tokens';

/** The options and conversation sheets keep Done within reach at every size. */
export function AskSheet({
  title,
  onDone,
  onClose = onDone,
  doneLabel = 'Done',
  testID,
  doneID,
  keyboardTarget,
  children,
}: {
  title: string;
  onDone: () => void;
  onClose?: () => void;
  /** What VoiceOver calls the close button. */
  doneLabel?: string;
  testID: string;
  doneID: string;
  keyboardTarget?: RefObject<View | null>;
  children: ReactNode;
}) {
  return (
    <Modal
      animationType="none"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        edges={Platform.OS === 'android' ? ['top', 'bottom'] : ['bottom']}
        style={styles.sheet}
        accessibilityViewIsModal
      >
        <View style={styles.bar}>
          <Heading level={2} style={styles.title}>
            {title}
          </Heading>
          <IconButton
            symbol="xmark"
            accessibilityLabel={doneLabel}
            onPress={onDone}
            testID={doneID}
          />
        </View>
        {keyboardTarget ? (
          <KeyboardStableScreen testID={testID} keyboardTarget={keyboardTarget}>
            {children}
          </KeyboardStableScreen>
        ) : (
          <Screen testID={testID}>{children}</Screen>
        )}
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.paper },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    paddingHorizontal: rhythm.screen,
    paddingVertical: rhythm.heading,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerSubtle,
  },
  title: { flex: 1 },
});
