import { useSyncExternalStore } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../design/controls';
import { Heading, Text } from '../design/text';
import { colors, layout, spacing } from '../design/tokens';
import {
  presentSourceDestination,
  sourceDestination,
  subscribeSourceDestination,
} from './source-destination';

/** UIKit alerts truncate long URL messages even after scrolling at AX5. */
export function SourceDestination() {
  const url = useSyncExternalStore(
    subscribeSourceDestination,
    sourceDestination,
    sourceDestination,
  );
  if (url === null) return null;
  const dismiss = () => presentSourceDestination(null);
  return (
    <Modal
      visible
      animationType="none"
      presentationStyle="fullScreen"
      onRequestClose={dismiss}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen} accessibilityViewIsModal>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            testID="source-destination-scroll"
          >
            <Heading level={1}>Source record</Heading>
            <Text
              accessibilityLabel={url}
              testID="source-destination-url"
              style={styles.url}
            >
              {url}
            </Text>
          </ScrollView>
          <View style={styles.dismiss}>
            <Button label="OK" onPress={dismiss} />
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  content: { padding: layout.screenMargin, gap: spacing.s4 },
  // This is a column with unrestricted width: retain every measured URL line.
  url: { flexShrink: 0 },
  dismiss: { padding: layout.screenMargin },
});
