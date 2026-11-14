import { ScrollView, StyleSheet } from 'react-native';
import { copy } from './copy';
import { ContentUnavailable } from './states';
import { symbols } from './symbols';
import { colors, rhythm } from './tokens';

export const routeErrorCopy = {
  title: 'This page couldn’t be shown',
  body: 'Something went wrong while drawing it.',
} as const;

/**
 * Expo Router's `ErrorBoundary` export for layouts. A render failure in one
 * page replaces that layout's content with a recoverable state instead of
 * closing the app. The error itself is not shown or sent anywhere.
 */
export function RouteErrorBoundary({
  retry,
}: {
  error: Error;
  retry: () => Promise<void>;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      testID="route-error"
    >
      <ContentUnavailable
        symbol={symbols.error}
        title={routeErrorCopy.title}
        body={routeErrorCopy.body}
        action={{
          label: copy.tryAgain,
          onPress: () => void retry(),
          testID: 'route-error-retry',
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: rhythm.screen,
  },
});
