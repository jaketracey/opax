import { phoneCopy } from './phone-copy';
import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  type DimensionValue,
} from 'react-native';
import { ApiError } from '../api/errors';
import { Button } from './controls';
import { staleText, type DateInput } from './format';
import { Icon, type SFSymbol } from './icon';
import { Text } from './text';
import { colors, hairline, radius, rhythm, spacing } from './tokens';

// Copy from IOS-UX section 4 ("States, everywhere") and the API client.
export const stateCopy = {
  offlineUncached: phoneCopy(
    'This record is not saved on this iPhone yet. It will load when you are back online.',
  ),
  offlineCached: phoneCopy(
    'Offline. Records saved on this iPhone stay readable.',
  ),
  genericError: 'The public record could not be loaded. Try again.',
  searchBusy: 'Search is busy. Try again in a minute.',
  searchUnavailable: 'Search is temporarily unavailable.',
  retry: 'Try again',
} as const;

/** The plain sentence for a failed block. ApiError messages are already reader-facing. */
export function errorMessage(
  error: unknown,
  context: 'record' | 'search' = 'record',
): string {
  if (error instanceof ApiError) {
    if (context === 'search' && error.code === 'rate-limited')
      return stateCopy.searchBusy;
    if (context === 'search' && error.status === 503)
      return stateCopy.searchUnavailable;
    return error.message;
  }
  return stateCopy.genericError;
}

type Placeholder = 'text' | 'rows' | 'people' | 'figures';
const bar = (width: DimensionValue, height = 14) => (
  <View style={[styles.bar, { width, height }]} />
);
/**
 * Layout-stable placeholders in the block's final shape. No spinner over
 * content already shown, and no shimmer, so reduced motion is respected.
 */
export function LoadingState({
  shape = 'rows',
  count = 3,
  label = 'Loading',
  testID,
}: {
  shape?: Placeholder;
  count?: number;
  /** What VoiceOver announces: "Loading the public directory". */
  label?: string;
  testID?: string;
}) {
  const items = Array.from({ length: count }, (_, index) => index);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      testID={testID}
      style={styles.loading}
    >
      {shape === 'text' ? (
        items.map((index) => (
          <View key={index}>{bar(index === count - 1 ? '60%' : '100%')}</View>
        ))
      ) : shape === 'figures' ? (
        <View style={styles.figures}>
          {items.map((index) => (
            <View key={index} style={styles.figure}>
              {bar(96, 28)}
              {bar(120)}
            </View>
          ))}
        </View>
      ) : (
        items.map((index) => (
          <View key={index} style={styles.placeholderRow}>
            {shape === 'people' ? <View style={styles.circle} /> : null}
            <View style={styles.grow}>
              {bar('70%', 17)}
              {bar('45%')}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

/**
 * Says what is absent, in the web's words where it has them, beside a quiet
 * symbol. A block with nothing for this person is usually left out instead.
 */
export function EmptyState({
  message,
  icon = 'tray',
  testID,
}: {
  message: string;
  /** A quiet symbol before the message; null where the block draws its own. */
  icon?: SFSymbol | null;
  testID?: string;
}) {
  return (
    <View style={styles.empty}>
      {icon ? <Icon name={icon} size={17} tone="inkSoft" /> : null}
      <Text
        wordSafe
        variant="body"
        tone="inkSoft"
        testID={testID}
        style={styles.grow}
      >
        {message}
      </Text>
    </View>
  );
}

/**
 * A plain sentence plus Try again. Other blocks keep working. VoiceOver focus
 * moves to the message when it appears, then on to Try again.
 */
export function ErrorState({
  message,
  onRetry,
  testID,
}: {
  message: string;
  onRetry?: () => void;
  testID?: string;
}) {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (ref.current)
      AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
  }, [message]);
  return (
    <View style={styles.error}>
      <View
        ref={ref}
        accessible
        accessibilityRole="alert"
        accessibilityLabel={message}
        style={styles.inline}
      >
        <Icon name="exclamationmark.circle" size={18} tone="danger" />
        <Text wordSafe variant="body" testID={testID} style={styles.grow}>
          {message}
        </Text>
      </View>
      {onRetry ? (
        <Button
          label={stateCopy.retry}
          onPress={onRetry}
          testID={testID ? `${testID}-retry` : undefined}
        />
      ) : null}
    </View>
  );
}

/**
 * Shown when content could not be refreshed. Cached content stays readable
 * below it with its as-at line; with nothing saved, the screen says so.
 */
export function OfflineBanner({
  cached = true,
  testID,
}: {
  /** False when nothing is saved for this screen yet. */
  cached?: boolean;
  testID?: string;
}) {
  const message = cached ? stateCopy.offlineCached : stateCopy.offlineUncached;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={message}
      testID={testID}
      style={styles.banner}
    >
      <Icon name="wifi.slash" size={18} tone="ink" />
      <Text wordSafe variant="metadata" tone="ink" style={styles.grow}>
        {message}
      </Text>
    </View>
  );
}

/** A saved copy older than the latest known export: its date, said plainly. */
export function StaleNotice({
  savedAt,
  refreshing = false,
  testID,
}: {
  savedAt: DateInput;
  /** A refresh is in progress. */
  refreshing?: boolean;
  testID?: string;
}) {
  return (
    <Text wordSafe variant="fine" testID={testID}>
      {staleText(savedAt)}
      {refreshing ? ' Checking for a newer copy.' : ''}
    </Text>
  );
}

const styles = StyleSheet.create({
  loading: { gap: spacing.s4 },
  bar: { borderRadius: radius, backgroundColor: colors.sunken },
  placeholderRow: {
    flexDirection: 'row',
    gap: spacing.s4,
    alignItems: 'center',
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.sunken,
  },
  grow: { flex: 1, gap: spacing.s3 },
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s4 },
  figure: { gap: spacing.s3, minWidth: 140 },
  error: {
    gap: rhythm.heading,
    alignItems: 'flex-start',
    backgroundColor: colors.sunken,
    borderRadius: radius + 6,
    padding: rhythm.block,
  },
  empty: { flexDirection: 'row', gap: rhythm.tight, alignItems: 'flex-start' },
  inline: { flexDirection: 'row', gap: spacing.s3, alignItems: 'flex-start' },
  banner: {
    flexDirection: 'row',
    gap: spacing.s3,
    alignItems: 'flex-start',
    paddingVertical: spacing.s3,
    borderTopWidth: hairline,
    borderBottomWidth: hairline,
    borderColor: colors.dividerDefault,
  },
});
