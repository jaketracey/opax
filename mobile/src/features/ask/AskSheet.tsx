import type { ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Heading, Screen } from '../../design/primitives';
import { colors, rhythm } from '../../design/tokens';

/** The options and conversation sheets keep Done within reach at every size. */
export function AskSheet({
  title,
  onDone,
  onClose = onDone,
  testID,
  doneID,
  children,
}: {
  title: string;
  onDone: () => void;
  onClose?: () => void;
  testID: string;
  doneID: string;
  children: ReactNode;
}) {
  return (
    <Modal
      animationType="none"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        edges={['bottom']}
        style={styles.sheet}
        accessibilityViewIsModal
      >
        <View style={styles.bar}>
          <Heading level={2} style={styles.title}>
            {title}
          </Heading>
          <Button
            label="Done"
            variant="quiet"
            onPress={onDone}
            testID={doneID}
          />
        </View>
        <Screen testID={testID}>{children}</Screen>
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
