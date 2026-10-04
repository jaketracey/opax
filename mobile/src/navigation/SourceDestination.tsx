import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../design/controls';
import { Heading, Text } from '../design/text';
import { colors, layout, spacing } from '../design/tokens';

/** UIKit alerts truncate long URL messages even after scrolling at AX5. */
export function SourceDestination({
  url,
  dismiss,
}: {
  url: string | null;
  dismiss: () => void;
}) {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} accessibilityViewIsModal>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          testID="source-destination-scroll"
        >
          <Heading level={1}>Source record</Heading>
          {url ? (
            <Text
              accessibilityLabel={url}
              testID="source-destination-url"
              style={styles.url}
            >
              {url}
            </Text>
          ) : (
            <Text>This source link could not be opened.</Text>
          )}
        </ScrollView>
        <View style={styles.dismiss}>
          <Button label="OK" onPress={dismiss} />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
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
