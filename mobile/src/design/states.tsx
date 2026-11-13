import { ContentUnavailableView, Host } from '@expo/ui/swift-ui';
import { accessibilityIdentifier } from '@expo/ui/swift-ui/modifiers';
import { NavigationContext } from 'expo-router/react-navigation';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { ApiError } from '../api/errors';
import { useAccessibilitySize, useReduceMotionSetting } from './accessibility';
import { columns, ReadableColumn, useLayout } from './adaptive';
import { Button } from './controls';
import { copy } from './copy';
import { type DateInput } from './format';
import { Icon, type SFSymbol } from './icon';
import { phoneCopy } from './phone-copy';
import { symbols } from './symbols';
import { Text } from './text';
import {
  colors,
  controlHeight,
  hairline,
  minimumTarget,
  motion,
  radii,
  rhythm,
  rhythmRegular,
  textStyles,
  type Accent,
  type TextVariant,
} from './tokens';

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
  | 'figure'
  | 'bill-header'
  | 'person-profile'
  | 'electorate-profile';
const bar = (
  width: DimensionValue,
  height = 14,
  onSunken = false,
  round = false,
) => (
  <View
    style={[
      styles.bar,
      {
        width,
        height,
        ...(round
          ? { borderRadius: radii.capsule, borderCurve: 'continuous' }
          : {}),
        backgroundColor: onSunken ? colors.raised : colors.sunken,
      },
    ]}
  />
);
/** Detail placeholders follow the same type, row and spacing tokens as content. */
function DetailSkeleton({
  person,
  label,
  onSunken,
  testID,
}: {
  person: boolean;
  label: string;
  onSunken: boolean;
  testID?: string;
}) {
  const large = useAccessibilitySize();
  const { regular } = useLayout();
  const { fontScale } = useWindowDimensions();
  const sectionGap = regular ? rhythmRegular.section : rhythm.section;
  const height = (variant: TextVariant) =>
    textStyles[variant].lineHeight * fontScale;
  const part = (name: string) => (testID ? `${testID}-${name}` : undefined);
  const bone = (
    name: string,
    width: DimensionValue,
    blockHeight: number,
    round = false,
    onRaised = false,
  ) => (
    <View
      testID={part(name)}
      style={{
        width,
        height: blockHeight,
        borderRadius: round ? blockHeight / 2 : radii.thumb,
        borderCurve: 'continuous',
        backgroundColor: onRaised || !onSunken ? colors.sunken : colors.raised,
      }}
    />
  );
  const line = (
    name: string,
    width: DimensionValue,
    variant: TextVariant = 'secondary',
    onRaised = false,
  ) => bone(name, width, height(variant), false, onRaised);
  const source = (name: string) => (
    <View style={{ minHeight: minimumTarget, justifyContent: 'center' }}>
      {line(name, '65%', 'footnote')}
    </View>
  );
  const heading = (name: string) => (
    <View
      style={
        large
          ? { marginBottom: rhythm.heading - rhythm.block }
          : { minHeight: minimumTarget, justifyContent: 'center' }
      }
    >
      {line(name, '48%', 'sectionTitle')}
    </View>
  );
  const member = (name: string) => (
    <View
      testID={part(name)}
      style={{
        flexDirection: large ? 'column' : 'row',
        alignItems: 'flex-start',
        gap: large ? rhythm.tight : rhythm.heading,
        paddingVertical: rhythm.row,
        paddingHorizontal: rhythm.block,
        minHeight: minimumTarget,
      }}
    >
      {bone(`${name}-portrait`, 44, 44, true, true)}
      <View
        style={{
          ...(large ? { alignSelf: 'stretch' } : { flex: 1 }),
          gap: rhythm.line,
        }}
      >
        {line(`${name}-name`, '65%', 'name', true)}
        <View style={{ paddingVertical: 1 }}>
          {line(`${name}-party`, '42%', 'strong', true)}
        </View>
        {line(`${name}-term`, '75%', 'secondary', true)}
      </View>
    </View>
  );
  const cards = (children: ReactNode) => (
    <View
      style={{
        backgroundColor: colors.raised,
        borderRadius: radii.container,
        borderCurve: 'continuous',
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
  const divider = (name: string) => (
    <View
      testID={part(name)}
      style={{ height: hairline, backgroundColor: colors.dividerSubtle }}
    />
  );
  const content = person ? (
    <>
      <ReadableColumn style={{ gap: rhythm.block }}>
        <View style={{ gap: rhythm.block }}>
          <View
            style={{
              gap: rhythm.tight,
              alignItems: large ? 'flex-start' : 'center',
            }}
          >
            {bone('portrait', 96, 96, true)}
            {line('name', '70%', 'pageTitle')}
            {bone('follow', large ? '100%' : 112, controlHeight.default, true)}
          </View>
          <View>
            <View
              style={{
                minHeight: minimumTarget,
                paddingVertical: rhythm.row,
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: rhythm.tight,
                }}
              >
                {bone('party-dot', 10, 10, true)}
                {line('party', '40%', 'body')}
              </View>
            </View>
            {divider('identity-divider')}
            <View style={{ gap: rhythm.line, paddingVertical: rhythm.row }}>
              {line('seat', '65%', 'body')}
              {line('seat-detail', '45%')}
            </View>
            {divider('identity-end')}
          </View>
        </View>
        <View style={{ gap: rhythm.tight }}>
          <View
            testID={part('stat-strip')}
            style={{
              flexDirection: large ? 'column' : 'row',
              gap: rhythm.block,
            }}
          >
            {[0, 1, 2].map((index) => (
              <View
                key={index}
                testID={part(`stat-tile-${index}`)}
                style={large ? undefined : { flex: 1 }}
              >
                {index ? (
                  <View
                    testID={part(`stat-divider-${index}`)}
                    style={
                      large
                        ? {
                            height: hairline,
                            backgroundColor: colors.dividerSubtle,
                            marginBottom: rhythm.block,
                          }
                        : {
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: -rhythm.tight,
                            width: hairline,
                            backgroundColor: colors.dividerSubtle,
                          }
                    }
                  />
                ) : null}
                <View style={{ minHeight: minimumTarget, gap: rhythm.line }}>
                  {line(`stat-value-${index}`, '85%', 'tileFigure')}
                  {bone(
                    `stat-label-${index}`,
                    '90%',
                    height('footnote') * (large ? 1 : 2),
                  )}
                </View>
              </View>
            ))}
          </View>
          {source('source')}
        </View>
      </ReadableColumn>
      <View style={{ gap: rhythm.heading }}>
        {heading('votes-heading')}
        <View style={{ gap: rhythm.tight }}>
          {line('votes-summary', '70%')}
          <View>
            {[0, 1, 2].map((index) => (
              <View
                key={index}
                testID={part(`vote-${index}`)}
                style={{
                  paddingVertical: rhythm.row,
                  gap: rhythm.line,
                  minHeight: minimumTarget,
                }}
              >
                {bone(
                  `vote-${index}-position`,
                  92,
                  Math.max(28, height('footnote') + rhythm.tight),
                  true,
                )}
                {line(`vote-${index}-title`, '90%', 'rowRecord')}
                {line(`vote-${index}-date`, '60%')}
              </View>
            ))}
          </View>
        </View>
      </View>
    </>
  ) : (
    <>
      <View style={{ gap: rhythm.heading }}>
        {bone('map', '100%', large ? 120 : 200)}
        {source('source')}
      </View>
      <View style={{ gap: rhythm.tight }}>
        <View style={{ gap: rhythm.line }}>
          {line('title', '60%', 'pageTitle')}
          {line('chamber', '90%')}
        </View>
        {bone('follow', 112, controlHeight.default, true)}
      </View>
      <View style={{ gap: rhythm.heading }}>
        {heading('members-heading')}
        {cards(member('member'))}
        <View style={{ gap: rhythm.groupHeader }}>
          {line('past-heading', '40%', 'groupHeader')}
          {cards(
            <>
              {member('past-0')}
              {divider('past-divider')}
              {member('past-1')}
            </>,
          )}
        </View>
        {source('members-source')}
      </View>
    </>
  );
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      testID={testID}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ gap: sectionGap }}
      >
        {content}
      </View>
    </View>
  );
}

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
  if (shape === 'person-profile' || shape === 'electorate-profile')
    return (
      <DetailSkeleton
        person={shape === 'person-profile'}
        label={label}
        onSunken={onSunken}
        testID={testID}
      />
    );
  if (shape === 'bill-header')
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityState={{ busy: true }}
        testID={testID}
        style={{ gap: rhythm.block }}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ gap: rhythm.block }}
        >
          <View style={{ gap: rhythm.line }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: rhythm.tight,
              }}
            >
              {bar(72, 24, onSunken, true)}
              {bar(120, 15, onSunken)}
            </View>
            {bar('100%', 28, onSunken)}
            {bar('100%', 28, onSunken)}
            {bar('55%', 28, onSunken)}
            {bar('70%', 15, onSunken)}
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: rhythm.line,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radii.capsule,
                borderCurve: 'continuous',
                backgroundColor: onSunken ? colors.raised : colors.sunken,
              }}
            />
            <View style={{ flex: 1, gap: rhythm.tight }}>
              {bar('60%', 17, onSunken)}
              {bar('35%', 15, onSunken)}
            </View>
          </View>
          {bar(96, 32, onSunken, true)}
        </View>
      </View>
    );
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
/** Screen supplies its own section gap, including adaptive-width boundaries. */
export const ScreenSectionGapContext = createContext<number>(rhythm.section);

/** Inputs to a cold-load crossfade; see SkeletonCrossfade. */
export type SkeletonCrossfadeInput = {
  loading: boolean;
  skeleton: ReactNode;
  /** Errors and empty states replace the skeleton immediately. */
  ready?: boolean;
  /** A saved record never has an entrance animation, even after a slow read. */
  cached?: boolean;
  /** The oldest saved record: a timestamp before this read identifies a cache hit. */
  cachedAt?: number | null;
};

/** The crossfade's timing, owned by the loader so its layers can move. */
export type SkeletonCrossfadeState = {
  loading: boolean;
  /** The skeleton to draw: the live one, or the last one while it fades. */
  skeleton: ReactNode;
  visible: boolean;
  fade: boolean;
  /** The content layer's opacity, 0 to 1; the skeleton draws its inverse. */
  reveal: Animated.Value;
};

/**
 * The crossfade's state without its layers. A loader whose seeded content
 * must stay still (a bill's header from the tapped row) keeps that content
 * outside CrossfadeLayers, and may render the layers in a new place once
 * its content arrives: all timing lives here.
 */
export function useSkeletonCrossfade({
  loading,
  skeleton,
  ready = true,
  cached = false,
  cachedAt,
}: SkeletonCrossfadeInput): SkeletonCrossfadeState {
  const reduceMotion = useReduceMotionSetting();
  const [opacity] = useState(() => new Animated.Value(loading ? 0 : 1));
  const [phase, setPhase] = useState({
    loading,
    skeleton,
    visible: false,
    eligible: false,
    fade: false,
    startedAt: 0,
  });
  // Capture the last committed loading shape before its props become content.
  // A new loading cycle resets the grace period; revalidation never enters it.
  if (loading !== phase.loading) {
    setPhase(
      loading
        ? {
            loading,
            skeleton,
            visible: false,
            eligible: false,
            fade: false,
            startedAt: 0,
          }
        : {
            ...phase,
            loading,
            fade:
              phase.eligible &&
              ready &&
              !cached &&
              !(cachedAt != null && cachedAt < phase.startedAt) &&
              reduceMotion === false,
          },
    );
  } else if (loading && skeleton !== phase.skeleton) {
    setPhase({ ...phase, skeleton });
  } else if (phase.fade && reduceMotion !== false) {
    setPhase({ ...phase, fade: false });
  }
  useLayoutEffect(() => {
    if (!loading) return;
    opacity.setValue(0);
    const startedAt = Date.now();
    // Reserve the final shape without flashing a skeleton on a warm read.
    const reveal = setTimeout(() => {
      setPhase((was) => ({ ...was, visible: true, startedAt }));
    }, 100);
    return () => clearTimeout(reveal);
  }, [loading, opacity]);
  useLayoutEffect(() => {
    if (!loading || !phase.visible) return;
    // Count from the visible skeleton's commit, including a busy JS thread.
    const eligible = setTimeout(() => {
      setPhase((was) => ({ ...was, eligible: true }));
    }, 100);
    return () => clearTimeout(eligible);
  }, [loading, phase.visible]);
  useLayoutEffect(() => {
    if (loading) return;
    if (!phase.fade) {
      opacity.setValue(1);
      return;
    }
    let active = true;
    const fade = Animated.timing(opacity, {
      toValue: 1,
      duration: motion.duration.crossfade,
      easing: Easing.bezier(...motion.easing.standard),
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (active && finished) setPhase((was) => ({ ...was, fade: false }));
    });
    return () => {
      active = false;
      fade.stop();
    };
  }, [loading, phase.fade, opacity]);
  return {
    loading,
    skeleton: loading ? skeleton : phase.skeleton,
    visible: phase.visible,
    fade: phase.fade,
    reveal: opacity,
  };
}

/** The skeleton and content layers of a crossfade. Holds no state. */
export function CrossfadeLayers({
  crossfade: { loading, skeleton, visible, fade, reveal: opacity },
  children,
  sectioned = false,
  fill = false,
  style,
}: {
  crossfade: SkeletonCrossfadeState;
  children?: ReactNode;
  /** Preserve Screen's spacing when its children are fragments. */
  sectioned?: boolean;
  /** For a loader whose content owns its scrolling screen. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const sectionGap = useContext(ScreenSectionGapContext);
  const contentStyle = [
    fill ? { flex: 1 } : null,
    sectioned ? { gap: sectionGap } : null,
  ];
  return (
    <View style={[fill ? { flex: 1 } : null, style]}>
      {(loading || fade) && (
        <Animated.View
          pointerEvents={loading ? 'auto' : 'none'}
          accessibilityElementsHidden={!loading || !visible}
          importantForAccessibility={
            loading && visible ? 'auto' : 'no-hide-descendants'
          }
          style={[
            ...contentStyle,
            !loading ? StyleSheet.absoluteFill : null,
            {
              opacity: loading
                ? visible
                  ? 1
                  : 0
                : opacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0],
                  }),
            },
          ]}
        >
          {skeleton}
        </Animated.View>
      )}
      {!loading && (
        <Animated.View style={[...contentStyle, { opacity }]}>
          {children}
        </Animated.View>
      )}
    </View>
  );
}
/** A cold skeleton yields to content in place. Fast and saved reads appear at once. */
export function SkeletonCrossfade({
  children,
  sectioned,
  fill,
  style,
  ...input
}: SkeletonCrossfadeInput & {
  children: ReactNode;
  /** Preserve Screen's spacing when its children are fragments. */
  sectioned?: boolean;
  /** For a loader whose content owns its scrolling screen. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <CrossfadeLayers
      crossfade={useSkeletonCrossfade(input)}
      sectioned={sectioned}
      fill={fill}
      style={style}
    >
      {children}
    </CrossfadeLayers>
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
  inline = false,
  testID,
}: {
  symbol: SFSymbol;
  title: string;
  body?: string;
  /**
   * Draw the symbol, title and body in React Native on iOS too, as Android
   * does. SwiftUI's view pads itself, so its action sat about 60 pt under
   * the body; inline, the action sits `rhythm.block` under it. For a state
   * inside a page (Search's No results, sweep 2 item 8.4), not a whole one.
   */
  inline?: boolean;
  action?: {
    label: string;
    onPress: () => void;
    testID?: string;
    containerTestID?: string;
  };
  testID?: string;
}) {
  const layout = useLayout();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const columnWidth =
    measuredWidth ??
    Math.max(
      0,
      Math.min(
        layout.width -
          2 * (layout.regular ? rhythmRegular.screen : rhythm.screen),
        columns.readable,
      ),
    );
  return (
    <View
      testID={testID}
      style={styles.unavailable}
      onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
    >
      {Platform.OS === 'ios' && !inline ? (
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
        // Centred under the centred text at every size (sweep 2, item 2). At
        // accessibility sizes a stretched secondary button reads from the
        // leading edge, so it hung left under the title; it hugs here and
        // the row centres it, its label wrapping inside the column.
        <View
          testID={action.containerTestID}
          style={[
            styles.unavailableAction,
            inline ? styles.unavailableActionInline : null,
          ]}
        >
          <Button
            label={action.label}
            variant="secondary"
            hug
            onPress={action.onPress}
            testID={action.testID ?? (testID ? `${testID}-retry` : undefined)}
          />
        </View>
      ) : null}
    </View>
  );
}

/** An empty result inside a successfully loaded block. */
export function EmptyState({
  message,
  title,
  icon,
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
  const pane = size === 'pane';
  return (
    <View style={pane ? styles.pane : undefined}>
      {/* A split's empty detail pane draws its symbol over the line, so the
          placeholder reads as one of the app's (sweep 2, item 10). A block
          inside a page stays one line. */}
      {pane && icon ? (
        <View testID={testID ? `${testID}-symbol` : undefined}>
          <Icon name={icon} size={44} tone="inkSoft" scale="large" />
        </View>
      ) : null}
      <Text
        wordSafe
        variant="body"
        tone="inkSoft"
        testID={testID}
        style={pane ? styles.center : undefined}
      >
        {pane ? (title ?? message) : (message ?? title)}
      </Text>
    </View>
  );
}

function ErrorSentence({
  sentence,
  onRetry,
  testID,
  alert = false,
  sentenceRef,
}: {
  sentence: string;
  onRetry?: () => void;
  testID?: string;
  alert?: boolean;
  sentenceRef?: Ref<View>;
}) {
  return (
    <View style={styles.error}>
      <View
        ref={sentenceRef}
        accessible
        accessibilityRole={alert ? 'alert' : undefined}
        accessibilityLabel={sentence}
        style={styles.errorSentence}
      >
        <Icon name={symbols.error} size={18} tone="danger" />
        <Text
          wordSafe
          variant="body"
          tone="inkSoft"
          testID={testID}
          style={styles.shrink}
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

/** A block load failure: one page announcement, no alert or focus movement. */
export function InlineError({
  subject,
  message,
  onRetry,
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
  const sentence = (message ?? copy.couldNotLoad(subject)).replace(
    /\s*Try again\.$/,
    '',
  );
  useEffect(() => page.fail(id), [page, id, sentence]);
  return (
    <ErrorSentence sentence={sentence} onRetry={onRetry} testID={testID} />
  );
}

/** Legacy form/action errors announce as alerts and focus their changed sentence. */
export function ErrorState({
  message,
  onRetry,
  testID,
}: {
  message: string;
  onRetry?: () => void;
  required?: boolean;
  testID?: string;
}) {
  const ref = useRef<View>(null);
  const sentence = message.replace(/\s*Try again\.$/, '');
  useEffect(() => {
    if (ref.current)
      AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
  }, [message]);
  return (
    <ErrorSentence
      sentence={sentence}
      onRetry={onRetry}
      testID={testID}
      alert
      sentenceRef={ref}
    />
  );
}

/** First registered line owns the page's offline sentence, including legacy callers. */
export function OfflineLine({
  savedAt,
  message: customMessage,
  testID,
}: {
  savedAt: DateInput | null;
  message?: string;
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
  const message =
    customMessage ??
    (savedAt === null ? "You're offline." : copy.offline(savedAt));
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
const styles = StyleSheet.create({
  loading: { gap: rhythm.block },
  bar: { borderRadius: radii.bar, borderCurve: 'continuous' },
  placeholderRow: {
    minHeight: 64,
    flexDirection: 'row',
    gap: rhythm.block,
    alignItems: 'center',
  },
  card: { padding: 20, minHeight: 144 },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderCurve: 'continuous',
  },
  grow: { flex: 1, gap: rhythm.tight },
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: rhythm.block },
  figure: { gap: rhythm.tight, minWidth: 140 },
  error: {
    gap: rhythm.heading,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  errorSentence: {
    flexDirection: 'row',
    gap: rhythm.tight,
    alignItems: 'flex-start',
    flexShrink: 1,
    maxWidth: '100%',
  },
  shrink: { flexShrink: 1 },
  unavailable: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: rhythm.heading,
    alignSelf: 'stretch',
  },
  unavailableAction: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  // The block's own gap is `heading`; the action sits a block under the body.
  unavailableActionInline: { marginTop: rhythm.block - rhythm.heading },
  pane: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: rhythm.block,
    paddingHorizontal: rhythm.section,
    paddingBottom: rhythm.section * 2,
  },
  center: { textAlign: 'center' },
  inline: { flexDirection: 'row', gap: rhythm.tight, alignItems: 'flex-start' },
});
