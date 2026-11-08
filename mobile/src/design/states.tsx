import { phoneCopy } from './phone-copy';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type DimensionValue,
} from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { ContentUnavailableView, Host } from '@expo/ui/swift-ui';
import { accessibilityIdentifier } from '@expo/ui/swift-ui/modifiers';
import { ApiError } from '../api/errors';
import { Button } from './controls';
import { copy } from './copy';
import { staleText, type DateInput } from './format';
import { Icon, type SFSymbol } from './icon';
import { symbols } from './symbols';
import { Text } from './text';
import { colors, radii, rhythm, spacing, type Accent } from './tokens';
import { columns, useLayout } from './adaptive';

export const stateCopy = {
  offlineUncached: phoneCopy(
    "Not saved on this iPhone yet. It will load when you're back online.",
  ),
  offlineCached: phoneCopy(
    'Offline. Records saved on this iPhone stay readable.',
  ),
  genericError: "The public record couldn't be loaded.",
  searchBusy: 'Search is busy. Try again in a minute.',
  searchUnavailable: 'Search is temporarily unavailable.',
  retry: copy.tryAgain,
} as const;

export function errorMessage(
  error: unknown,
  context: 'record' | 'search' = 'record',
): string {
  if (error instanceof ApiError) {
    if (context === 'search' && error.code === 'rate-limited')
      return stateCopy.searchBusy;
    if (context === 'search' && error.status === 503)
      return stateCopy.searchUnavailable;
    return error.message.replace(/\s*Try again\.$/, '');
  }
  return stateCopy.genericError;
}

function pageState(announcementsEnabled = true) {
  let announced = false;
  const failures = new Set<symbol>();
  const offline = new Set<symbol>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    firstOffline: () => offline.values().next().value,
    offline(id: symbol) {
      offline.add(id);
      notify();
      return () => {
        offline.delete(id);
        notify();
      };
    },
    fail(id: symbol) {
      failures.add(id);
      if (announcementsEnabled && !announced) {
        announced = true;
        AccessibilityInfo.announceForAccessibility(copy.someSectionsFailed);
      }
      return () => {
        failures.delete(id);
      };
    },
  };
}
type PageState = ReturnType<typeof pageState>;
const StatePageContext = createContext<PageState | null>(null);
// Existing Screen callers inherit their route's scope until Screen adopts the
// provider. Never share an announcement or offline owner between routes.
const routeStates = new WeakMap<object, PageState>();
function usePageState() {
  const provided = useContext(StatePageContext);
  const navigation = useContext(NavigationContext);
  const [own] = useState(pageState);
  return useMemo(() => {
    if (provided) return provided;
    if (!navigation) return own;
    let state = routeStates.get(navigation);
    if (!state) {
      state = pageState();
      routeStates.set(navigation, state);
    }
    return state;
  }, [provided, navigation, own]);
}

/** Screen's scope: reset once at the start of each pull to refresh/load. */
export function StatePageProvider({
  children,
  refreshing = false,
}: {
  children: ReactNode;
  refreshing?: boolean;
}) {
  const page = useMemo(() => pageState(!refreshing), [refreshing]);
  return (
    <StatePageContext.Provider value={page}>
      {children}
    </StatePageContext.Provider>
  );
}

type SkeletonShape =
  | 'text'
  | 'rows'
  | 'people'
  | 'bills'
  | 'divisions'
  | 'card'
  | 'figure';
const bar = (width: DimensionValue, height = 14, onSunken = false) => (
  <View
    style={[
      styles.bar,
      {
        width,
        height,
        backgroundColor: onSunken ? colors.raised : colors.sunken,
      },
    ]}
  />
);
/** Final geometry and count, no shimmer or entrance movement. */
export function Skeleton({
  shape = 'rows',
  count = 3,
  label = 'Loading',
  onSunken = false,
  testID,
}: {
  shape?: SkeletonShape;
  count?: number;
  label?: string;
  onSunken?: boolean;
  testID?: string;
}) {
  const items = Array.from({ length: Math.max(0, count) }, (_, index) => index);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      testID={testID}
      style={styles.loading}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.loading}
      >
        {shape === 'text' ? (
          items.map((index) => (
            <View key={index}>
              {bar(index === count - 1 ? '60%' : '100%', 20, onSunken)}
            </View>
          ))
        ) : shape === 'figure' ? (
          <View style={styles.figures}>
            {items.map((index) => (
              <View key={index} style={styles.figure}>
                {bar(96, 34, onSunken)}
                {bar(120, 15, onSunken)}
              </View>
            ))}
          </View>
        ) : (
          items.map((index) => (
            <View
              key={index}
              style={[styles.placeholderRow, shape === 'card' && styles.card]}
            >
              {shape === 'people' ? (
                <View
                  style={[
                    styles.circle,
                    {
                      backgroundColor: onSunken ? colors.raised : colors.sunken,
                    },
                  ]}
                />
              ) : null}
              <View style={styles.grow}>
                {shape === 'bills' || shape === 'card'
                  ? bar('30%', 20, onSunken)
                  : null}
                {bar(
                  '70%',
                  shape === 'bills' || shape === 'card' ? 23 : 20,
                  onSunken,
                )}
                {bar('45%', 18, onSunken)}
                {shape === 'divisions' ? bar('100%', 8, onSunken) : null}
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}
/** Compatibility alias while screen lanes adopt the named shapes. */
export function LoadingState({
  shape = 'rows',
  ...props
}: {
  shape?: 'text' | 'rows' | 'people' | 'figures';
  count?: number;
  label?: string;
  testID?: string;
}) {
  return <Skeleton {...props} shape={shape === 'figures' ? 'figure' : shape} />;
}

/** Whole screens only. Keep inside the screen's scrolling column. */
export function ContentUnavailable({
  symbol,
  title,
  body,
  action,
  testID,
}: {
  symbol: SFSymbol;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; testID?: string };
  testID?: string;
}) {
  const { width } = useWindowDimensions();
  const region = useLayout();
  const columnWidth = Math.max(
    0,
    Math.min(
      width - (width < 414 ? 16 : 20) * 2,
      region.width,
      columns.readable,
    ),
  );
  return (
    <View testID={testID} style={styles.unavailable}>
      {Platform.OS === 'ios' ? (
        // Verified in @expo/ui 57.0.21 HostProps: boolean | { vertical?, horizontal? }.
        // Propose the column width; only height follows SwiftUI, including AX5.
        <Host
          style={{ width: columnWidth, maxWidth: '100%' }}
          matchContents={{ vertical: true }}
        >
          <ContentUnavailableView
            title={phoneCopy(title)}
            description={body ? phoneCopy(body) : undefined}
            systemImage={symbol}
            modifiers={testID ? [accessibilityIdentifier(testID)] : []}
          />
        </Host>
      ) : (
        <View style={styles.unavailable}>
          <Icon name={symbol} size={44} tone="inkSoft" scale="large" />
          <Text variant="sectionTitle" wordSafe style={styles.center}>
            {phoneCopy(title)}
          </Text>
          {body ? (
            <Text variant="body" tone="inkSoft" style={styles.center}>
              {phoneCopy(body)}
            </Text>
          ) : null}
        </View>
      )}
      {action ? (
        <Button
          label={action.label}
          variant="secondary"
          onPress={action.onPress}
          testID={action.testID ?? (testID ? `${testID}-retry` : undefined)}
        />
      ) : null}
    </View>
  );
}

/** An empty result inside a successfully loaded block. */
export function EmptyState({
  message,
  title,
  size = 'block',
  testID,
}: {
  message?: string;
  title?: string;
  icon?: SFSymbol | null;
  size?: 'block' | 'pane';
  accent?: Accent;
  testID?: string;
}) {
  return (
    <View style={size === 'pane' ? styles.pane : undefined}>
      <Text
        wordSafe
        variant="body"
        tone="inkSoft"
        testID={testID}
        style={size === 'pane' ? styles.center : undefined}
      >
        {size === 'pane' ? (title ?? message) : (message ?? title)}
      </Text>
    </View>
  );
}

export function InlineError({
  subject,
  message,
  onRetry,
  required = false,
  testID,
}: {
  subject: string;
  message?: string;
  onRetry?: () => void;
  required?: boolean;
  testID?: string;
}) {
  const page = usePageState();
  const [id] = useState(() => Symbol('failure'));
  const ref = useRef<View>(null);
  const sentence = (message ?? copy.couldNotLoad(subject)).replace(
    /\s*Try again\.$/,
    '',
  );
  useEffect(() => {
    // required means this is the only content available to read.
    if (required) {
      if (ref.current)
        AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
      return;
    }
    return page.fail(id);
  }, [page, id, required, sentence]);
  return (
    <View style={styles.error}>
      <View
        ref={ref}
        accessible
        accessibilityLabel={sentence}
        style={styles.inline}
      >
        <Icon name={symbols.error} size={18} tone="danger" />
        <Text
          wordSafe
          variant="body"
          tone="inkSoft"
          testID={testID}
          style={styles.grow}
        >
          {sentence}
        </Text>
      </View>
      {onRetry ? (
        <Button
          label={copy.tryAgain}
          variant="plain"
          onPress={onRetry}
          testID={testID ? `${testID}-retry` : undefined}
        />
      ) : null}
    </View>
  );
}
/** Existing caller API, now with the same quiet block treatment. */
export function ErrorState(props: {
  message: string;
  onRetry?: () => void;
  required?: boolean;
  testID?: string;
}) {
  return <InlineError subject="The public record" {...props} />;
}

/** First registered line owns the page's offline sentence, including legacy callers. */
export function OfflineLine({
  savedAt,
  testID,
}: {
  savedAt: DateInput | null;
  testID?: string;
}) {
  const page = usePageState();
  const [id] = useState(() => Symbol('offline'));
  useEffect(() => page.offline(id), [page, id]);
  const owner = useSyncExternalStore(
    page.subscribe,
    page.firstOffline,
    page.firstOffline,
  );
  if (owner !== id) return null;
  const message = savedAt === null ? "You're offline." : copy.offline(savedAt);
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={message}
      testID={testID}
      style={styles.inline}
    >
      <Icon name={symbols.offline} size={15} tone="inkSoft" />
      <Text wordSafe variant="secondary" tone="inkSoft" style={styles.grow}>
        {message}
      </Text>
    </View>
  );
}
export function OfflineBanner({
  cached = true,
  testID,
}: {
  cached?: boolean;
  testID?: string;
}) {
  return cached ? (
    <OfflineLine savedAt={null} testID={testID} />
  ) : (
    <ContentUnavailable
      symbol={symbols.offline}
      title={copy.notSaved}
      body={copy.notSavedBody}
      testID={testID}
    />
  );
}
export function Collapse({
  when,
  children,
}: {
  when: boolean;
  children: ReactNode;
}) {
  return when ? null : <>{children}</>;
}
export function StaleNotice({
  savedAt,
  refreshing = false,
  testID,
}: {
  savedAt: DateInput;
  refreshing?: boolean;
  testID?: string;
}) {
  return (
    <Text wordSafe variant="footnote" testID={testID}>
      {staleText(savedAt)}
      {refreshing ? ' Checking for a newer copy.' : ''}
    </Text>
  );
}
const styles = StyleSheet.create({
  loading: { gap: spacing.s4 },
  bar: { borderRadius: radii.bar, borderCurve: 'continuous' },
  placeholderRow: {
    minHeight: 64,
    flexDirection: 'row',
    gap: spacing.s4,
    alignItems: 'center',
  },
  card: { padding: 20, minHeight: 144 },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderCurve: 'continuous',
  },
  grow: { flex: 1, gap: spacing.s3 },
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s4 },
  figure: { gap: spacing.s3, minWidth: 140 },
  error: { gap: rhythm.heading, alignItems: 'flex-start' },
  unavailable: {
    alignItems: 'center',
    gap: rhythm.heading,
    alignSelf: 'stretch',
  },
  pane: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rhythm.section,
    paddingBottom: rhythm.section * 2,
  },
  center: { textAlign: 'center' },
  inline: { flexDirection: 'row', gap: spacing.s3, alignItems: 'flex-start' },
});
