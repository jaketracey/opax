import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button, Heading, Icon, Text } from '../../design/primitives';
import { colors, hairline, layout, spacing } from '../../design/tokens';
import { webPageUrl } from '../../navigation/external';
import type { VoiceSource } from '../../voice';
import { recordDestination } from './sources';

/** Sources a call can open: validated OPAX record paths only. */
export const openableSources = (sources: readonly VoiceSource[]) =>
  sources.filter((source) => webPageUrl(source.path));

/**
 * The records behind the call's answers, in a native sheet over the call.
 * A sheet, not a route: leaving Talk's route would end the call.
 */
export function SourcesSheet({
  visible,
  sources,
  active,
  onOpen,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  sources: readonly VoiceSource[];
  active: boolean;
  onOpen: (source: VoiceSource) => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <SafeAreaProvider>
        <View style={styles.sheet} testID="talk-sources-sheet">
          <View style={styles.header}>
            <Heading level={2}>Sources</Heading>
            <Button
              label="Done"
              variant="quiet"
              size="compact"
              testID="talk-sources-done"
              onPress={onClose}
            />
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {openableSources(sources).map((source, index) => (
              <Pressable
                key={source.path}
                testID={`talk-source-${index}`}
                accessibilityRole="link"
                accessibilityLabel={source.title}
                accessibilityHint={
                  recordDestination(source.path)
                    ? active
                      ? 'Opens the record within the conversation'
                      : 'Opens the record'
                    : active
                      ? 'Opens on opax.com.au after the conversation'
                      : 'Opens on opax.com.au'
                }
                onPress={() => onOpen(source)}
                style={({ pressed }) => [
                  styles.row,
                  pressed ? styles.pressed : null,
                ]}
              >
                <View style={styles.title}>
                  <Text tone="bronzeInk" wordSafe>
                    {source.title}
                  </Text>
                </View>
                <Icon name="chevron.right" size={14} tone="inkFaint" />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.s5,
    paddingBottom: spacing.s3,
  },
  list: {
    paddingHorizontal: layout.screenMargin,
    paddingBottom: spacing.s7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s4,
    minHeight: 44,
    paddingVertical: spacing.s4,
    borderBottomWidth: hairline,
    borderBottomColor: colors.dividerSubtle,
  },
  pressed: { backgroundColor: colors.sunken },
  title: { flex: 1 },
});
