import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './controls';
import { Heading, Text } from './text';
import { colors, hairline, layout, spacing } from './tokens';

/**
 * E2E builds only: where a source link would have opened, drawn in full. The
 * native alert ends a word wider than its line with an ellipsis
 * ("representative…" for representatives.csv at AX5) and cannot be told not
 * to, so this page wraps the URL as selectable text and every character is
 * drawn. It presents from the link's own screen, so it also works inside a
 * sheet. Shipping builds open the in-app browser and never render it.
 */
export function SourceDestination({
  label,
  url,
  onDismiss,
}: {
  label: string;
  url: string;
  onDismiss: () => void;
}) {
  return (
    <Modal
      animationType="none"
      presentationStyle="fullScreen"
      onRequestClose={onDismiss}
    >
      {/* A modal is its own native hierarchy: SafeAreaView finds its insets
          from the nearest provider view, so the page needs one of its own. */}
      <SafeAreaProvider>
        <SafeAreaView style={styles.page} testID="source-destination">
          <ScrollView contentContainerStyle={styles.content}>
            <Heading level={2}>{`Source record: ${label}`}</Heading>
            {/* Title and URL apart, so journeys can assert the exact destination. */}
            <Text selectable testID="source-destination-url">
              {url}
            </Text>
          </ScrollView>
          <View style={styles.actions}>
            <Button
              label="OK"
              onPress={onDismiss}
              fullWidth
              testID="source-destination-ok"
            />
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  content: {
    gap: spacing.s4,
    paddingHorizontal: layout.screenMargin,
    paddingVertical: spacing.s5,
  },
  actions: {
    paddingHorizontal: layout.screenMargin,
    paddingVertical: spacing.s4,
    borderTopWidth: hairline,
    borderTopColor: colors.dividerSubtle,
  },
});
