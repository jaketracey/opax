import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Divider,
  Hoverable,
  Text,
  useLayout,
} from '../design/primitives';
import {
  colors,
  fonts,
  hairline,
  isAccessibilityCategory,
  light,
  minimumTarget,
  rhythm,
  spacing,
} from '../design/tokens';
import {
  padGeometry,
  padMargin,
  swipeTarget,
  type TourArrangement,
} from './layout';
import {
  finishLabel,
  padSceneSummaries,
  pageAnnouncement,
  welcomePages,
  type WelcomePage,
} from './pages';
import { PadScene } from './padScenes';

/**
 * The welcome tour on iPad at regular width (`columns` or `stacked`, see
 * layout.ts). The same five pages and words as the phone, composed for the
 * larger screen:
 *
 * - The picture is the app's iPad screen at real size in a window; pages
 *   change by a crossfade, the incoming picture drifting 32pt in from the
 *   side it comes from and the words fading in. Reduce Motion (and an
 *   unanswered setting): pages change at once, nothing drifts.
 * - Navigation: Back and Next (Choose your electorate on the last page),
 *   Skip, and a page indicator whose marks each open their page. A
 *   horizontal swipe over the picture or the words turns the page. The
 *   hardware keyboard (WelcomeTour) adds ←, →, Return and Escape.
 * - VoiceOver: the picture's summary, the page ("Page 2 of 5. Your MP. …"),
 *   the indicator (adjustable: swipe up or down to change page), then Skip,
 *   Back and Next.
 */
export function PadTour({
  arrangement,
  page,
  seen,
  reduced,
  motion,
  onWords,
  onTurn,
  onLeave,
}: {
  arrangement: Exclude<TourArrangement, 'phone'>;
  page: number;
  seen: ReadonlySet<number>;
  /** No crossfade or drift: Reduce Motion is on, or not known yet. */
  reduced: boolean;
  /** The Reduce Motion setting, or null until it is known. */
  motion: boolean | null;
  /** Registers a page's words, for VoiceOver focus after a turn. */
  onWords: (index: number, node: View | null) => void;
  onTurn: (index: number) => void;
  onLeave: (reason: 'skip' | 'finish') => void;
}) {
  const layout = useLayout();
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const count = welcomePages.length;
  const current = welcomePages[page]!;
  const large = isAccessibilityCategory(fontScale);
  const margin = padMargin(layout.width);

  // The body's size, measured; estimated from the window until then.
  const [body, setBody] = useState<{ width: number; height: number } | null>(
    null,
  );
  const bodyWidth =
    body?.width ?? layout.width - 2 * margin - insets.left - insets.right;
  const bodyHeight = body?.height ?? layout.height * 0.72;
  // Stacked, the picture shares the scrolling region (above the actions).
  const [viewport, setViewport] = useState<number | null>(null);
  const geometry = padGeometry({
    arrangement,
    width: bodyWidth,
    height:
      arrangement === 'stacked' ? (viewport ?? bodyHeight * 0.75) : bodyHeight,
    fontScale,
  });

  // The words drift in from the side the reader is moving towards.
  const [turned, setTurned] = useState({ page, direction: 0 });
  if (turned.page !== page)
    setTurned({ page, direction: page > turned.page ? 1 : -1 });

  // The swipe and the keyboard read the newest page and handler.
  const latest = useRef({ page, onTurn, reduced });
  useEffect(() => {
    latest.current = { page, onTurn, reduced };
  });
  const drag = useState(() => new Animated.Value(0))[0];
  // The handlers read the ref on a gesture, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    const release = () =>
      Animated.timing(drag, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    return PanResponder.create({
      // Horizontal drags only; vertical ones stay with the words' scroll.
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        if (latest.current.reduced) return;
        drag.setValue(Math.max(-48, Math.min(48, g.dx * 0.25)));
      },
      onPanResponderRelease: (_, g) => {
        release();
        const target = swipeTarget(g.dx, g.vx, latest.current.page, count);
        if (target !== null) latest.current.onTurn(target);
      },
      onPanResponderTerminate: release,
    });
  });

  const text = (
    <Words
      key={current.id}
      page={current}
      index={page}
      count={count}
      direction={turned.direction}
      reduced={reduced}
      wordsRef={(node) => onWords(page, node)}
    />
  );
  const controls = (
    <Controls
      page={page}
      count={count}
      large={large}
      onTurn={onTurn}
      onLeave={onLeave}
    />
  );
  const stage = (
    <Stage
      page={page}
      seen={seen}
      width={geometry.stage.width}
      height={geometry.stage.height}
      fontScale={fontScale}
      reduced={reduced}
      motion={motion}
      drag={drag}
    />
  );

  return (
    <View style={styles.pad} testID={`tour-pad-${arrangement}`}>
      <View
        style={[
          styles.masthead,
          {
            paddingTop: insets.top + spacing.s4,
            paddingLeft: margin + insets.left,
            paddingRight: margin + insets.right,
          },
        ]}
      >
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel="OPAX"
          testID="tour-masthead"
          style={styles.brand}
        >
          <Image
            source={require('../../assets/splash/mark.png')}
            style={styles.mark}
          />
          {/* A logo: the wordmark keeps its size at every text setting. */}
          <NativeText allowFontScaling={false} style={styles.wordmark}>
            OPAX
          </NativeText>
        </View>
      </View>
      <View style={{ paddingHorizontal: margin }}>
        <Divider />
      </View>
      <View
        {...pan.panHandlers}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          const inner = {
            width: width - 2 * margin - insets.left - insets.right,
            height: height - rhythm.section - insets.bottom - rhythm.block,
          };
          setBody((previous) =>
            previous &&
            Math.abs(previous.width - inner.width) < 0.5 &&
            Math.abs(previous.height - inner.height) < 0.5
              ? previous
              : inner,
          );
        }}
        style={[
          styles.body,
          {
            paddingLeft: margin + insets.left,
            paddingRight: margin + insets.right,
            paddingBottom: insets.bottom + rhythm.block,
          },
        ]}
      >
        {arrangement === 'columns' ? (
          <View style={styles.columns}>
            {stage}
            <View
              style={[
                styles.column,
                { width: geometry.column, marginLeft: geometry.gutter },
              ]}
            >
              <FitScroll>{text}</FitScroll>
              {controls}
            </View>
          </View>
        ) : (
          <View style={styles.stacked}>
            <FitScroll centred onFrame={setViewport}>
              {stage}
              <View style={[styles.stackedWords, { width: geometry.column }]}>
                {text}
              </View>
            </FitScroll>
            <View style={[styles.stackedControls, { width: geometry.column }]}>
              {controls}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * A vertical scroll view that only scrolls when its content outgrows it, so
 * a horizontal swipe over words that fit is never taken by the scroll view.
 */
function FitScroll({
  children,
  centred = false,
  onFrame,
}: {
  children: ReactNode;
  centred?: boolean;
  /** Reports the visible height. */
  onFrame?: (height: number) => void;
}) {
  const [frame, setFrame] = useState(0);
  const [content, setContent] = useState(0);
  const scrolls = content > frame + 1;
  return (
    <ScrollView
      style={styles.grow}
      scrollEnabled={scrolls}
      bounces={scrolls}
      showsVerticalScrollIndicator={scrolls}
      onLayout={(event) => {
        const { height } = event.nativeEvent.layout;
        setFrame(height);
        onFrame?.(Math.round(height));
      }}
      onContentSizeChange={(_, height) => setContent(height)}
      contentContainerStyle={[
        styles.scrollContent,
        centred ? styles.centred : null,
      ]}
    >
      {children}
    </ScrollView>
  );
}

/**
 * The picture: every page's scene in one window, the current one shown.
 * One VoiceOver image whose label says what the picture shows. Each scene
 * reveals itself the first time its page is shown.
 */
function Stage({
  page,
  seen,
  width,
  height,
  fontScale,
  reduced,
  motion,
  drag,
}: {
  page: number;
  seen: ReadonlySet<number>;
  width: number;
  height: number;
  fontScale: number;
  reduced: boolean;
  motion: boolean | null;
  drag: Animated.Value;
}) {
  const current = welcomePages[page]!;
  const fades = useState(() =>
    welcomePages.map((_, index) => new Animated.Value(index === page ? 1 : 0)),
  )[0];
  const shifts = useState(() =>
    welcomePages.map(() => new Animated.Value(0)),
  )[0];
  const shown = useRef(page);
  useEffect(() => {
    const from = shown.current;
    if (from === page) return;
    shown.current = page;
    if (reduced) {
      fades.forEach((fade, index) => fade.setValue(index === page ? 1 : 0));
      shifts.forEach((shift) => shift.setValue(0));
      return;
    }
    const direction = page > from ? 1 : -1;
    shifts[page]!.setValue(direction * 32);
    Animated.parallel([
      ...fades.map((fade, index) =>
        Animated.timing(fade, {
          toValue: index === page ? 1 : 0,
          duration: index === page ? 360 : 240,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ),
      Animated.timing(shifts[page]!, {
        toValue: 0,
        duration: 480,
        easing: Easing.bezier(0.2, 0, 0, 1),
        useNativeDriver: true,
      }),
      Animated.timing(shifts[from]!, {
        toValue: -direction * 32,
        duration: 360,
        easing: Easing.bezier(0.2, 0, 0, 1),
        useNativeDriver: true,
      }),
    ]).start();
  }, [page, reduced, fades, shifts]);

  // The "Example" line is on every page, so the window never moves; the
  // window takes what the line (which grows with the text) leaves.
  const [measured, setMeasured] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const window = measured ?? { width, height: Math.max(0, height - 24) };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={padSceneSummaries[current.id]}
      testID="tour-scene"
      style={{ width, height }}
    >
      {/* Every iPad picture shows sample records, the first page's too. */}
      <View style={styles.exampleLine}>
        <Text variant="kicker" testID={`tour-example-${current.id}`}>
          Example
        </Text>
      </View>
      <View
        style={styles.window}
        onLayout={(event) => {
          const next = {
            width: Math.round(event.nativeEvent.layout.width),
            height: Math.round(event.nativeEvent.layout.height),
          };
          setMeasured((previous) =>
            previous &&
            previous.width === next.width &&
            previous.height === next.height
              ? previous
              : next,
          );
        }}
      >
        <Animated.View
          style={[styles.fill, { transform: [{ translateX: drag }] }]}
        >
          {welcomePages.map((item, index) => (
            <Animated.View
              key={item.id}
              pointerEvents="none"
              style={[
                styles.fill,
                {
                  opacity: fades[index],
                  transform: [{ translateX: shifts[index]! }],
                },
              ]}
            >
              <PadScene
                page={item}
                width={window.width}
                height={window.height}
                fontScale={fontScale}
                active={seen.has(index) || index === page}
                reduced={motion}
              />
            </Animated.View>
          ))}
        </Animated.View>
        <View pointerEvents="none" style={styles.fade} />
      </View>
    </View>
  );
}

/** A page's words; they fade (and drift a little) in when the page opens. */
function Words({
  page,
  index,
  count,
  direction,
  reduced,
  wordsRef,
}: {
  page: WelcomePage;
  index: number;
  count: number;
  direction: number;
  reduced: boolean;
  wordsRef: (node: View | null) => void;
}) {
  const still = reduced || direction === 0;
  const shown = useState(() => new Animated.Value(still ? 1 : 0))[0];
  useEffect(() => {
    if (still) {
      shown.setValue(1);
      return;
    }
    const entrance = Animated.timing(shown, {
      toValue: 1,
      duration: 320,
      delay: 60,
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: true,
    });
    entrance.start();
    return () => entrance.stop();
  }, [still, shown]);
  return (
    <Animated.View
      ref={wordsRef}
      testID={`tour-page-${page.id}`}
      accessible
      accessibilityLabel={pageAnnouncement(index, count)}
      style={[
        styles.words,
        still
          ? null
          : {
              opacity: shown,
              transform: [
                {
                  translateX: shown.interpolate({
                    inputRange: [0, 1],
                    outputRange: [direction * 12, 0],
                  }),
                },
              ],
            },
      ]}
    >
      <Text variant="padTitle" wordSafe accessibilityRole="header">
        {page.title}
      </Text>
      <Text variant="padLede">{page.body}</Text>
      {page.notice ? (
        <Text variant="metadata" testID="tour-deceased-notice">
          {page.notice}
        </Text>
      ) : null}
    </Animated.View>
  );
}

/** The indicator and the actions, over a hairline. */
function Controls({
  page,
  count,
  large,
  onTurn,
  onLeave,
}: {
  page: number;
  count: number;
  large: boolean;
  onTurn: (index: number) => void;
  onLeave: (reason: 'skip' | 'finish') => void;
}) {
  const last = page === count - 1;
  const skip = (
    <Button
      label="Skip"
      variant="quiet"
      accessibilityHint="Closes the welcome tour"
      testID="tour-skip"
      onPress={() => onLeave('skip')}
    />
  );
  // Page 1 has nothing to go back to. A disabled capsule there still read as
  // a live button, so Back keeps its place unseen, out of reach of touch,
  // the keyboard and VoiceOver, and Next never moves.
  const first = page === 0;
  const back = (
    <View
      style={first ? styles.unseen : null}
      pointerEvents={first ? 'none' : 'auto'}
      accessibilityElementsHidden={first}
      importantForAccessibility={first ? 'no-hide-descendants' : 'auto'}
      testID="tour-back-slot"
    >
      <Button
        label="Back"
        icon="chevron.left"
        disabled={first}
        accessibilityHint={first ? undefined : `Page ${page} of ${count}`}
        testID="tour-back"
        onPress={() => onTurn(page - 1)}
      />
    </View>
  );
  const next = (
    <Button
      label={last ? finishLabel : 'Next'}
      trailingIcon={last ? undefined : 'chevron.right'}
      variant="primary"
      accessibilityHint={
        last
          ? 'Closes the tour and opens the seat chooser'
          : `Page ${page + 2} of ${count}`
      }
      testID={last ? 'tour-finish' : 'tour-next'}
      onPress={() => (last ? onLeave('finish') : onTurn(page + 1))}
    />
  );
  return (
    <View style={styles.controls}>
      <Indicator count={count} page={page} onSelect={onTurn} />
      {large ? (
        // Accessibility sizes: the primary action on its own line, Back and
        // Skip sharing the next, each button a fixed width for its words.
        <View style={styles.actionsStacked}>
          {next}
          <View style={styles.actionsPair}>
            <View style={styles.grow}>{back}</View>
            <View style={styles.grow}>{skip}</View>
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <View style={styles.skip}>{skip}</View>
          {back}
          {next}
        </View>
      )}
    </View>
  );
}

/**
 * Five marks, the current page's navy and thicker. Each mark is a 44pt
 * target that opens its page (with the pointer's highlight); to VoiceOver
 * the row is one adjustable element, "Page 2 of 5".
 */
function Indicator({
  count,
  page,
  onSelect,
}: {
  count: number;
  page: number;
  onSelect: (index: number) => void;
}) {
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Page ${page + 1} of ${count}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') onSelect(page + 1);
        if (event.nativeEvent.actionName === 'decrement') onSelect(page - 1);
      }}
      testID="tour-progress"
      style={styles.indicator}
    >
      {Array.from({ length: count }, (_, index) => (
        <Hoverable key={index} effect="highlight" cornerRadius={10}>
          <Pressable
            testID={`tour-dot-${index}`}
            onPress={() => onSelect(index)}
            style={styles.dot}
          >
            <View
              style={[
                styles.tick,
                index === page ? styles.tickCurrent : styles.tickOther,
              ]}
            />
          </Pressable>
        </Hoverable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { flex: 1 },
  grow: { flex: 1 },
  unseen: { opacity: 0 },
  fill: { ...StyleSheet.absoluteFill },
  masthead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.s4,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  mark: { width: 30, height: 30 },
  wordmark: {
    fontFamily: fonts.serifBold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
  },
  body: { flex: 1, paddingTop: rhythm.section },
  columns: { flex: 1, flexDirection: 'row' },
  column: { flexShrink: 0 },
  stacked: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  centred: { alignItems: 'center' },
  stackedWords: { paddingTop: rhythm.section, paddingBottom: rhythm.group },
  stackedControls: { alignSelf: 'center' },
  exampleLine: { paddingBottom: spacing.s1 },
  window: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderWidth: hairline,
    borderRadius: 24,
    borderCurve: 'continuous',
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    experimental_backgroundImage: `linear-gradient(to top, ${light.paper} 0%, ${light.paper}00 100%)`,
  },
  words: { gap: rhythm.block, paddingBottom: rhythm.group },
  controls: {
    gap: rhythm.tight,
    paddingTop: rhythm.heading,
    borderTopWidth: hairline,
    borderTopColor: colors.dividerSubtle,
  },
  indicator: { flexDirection: 'row', alignItems: 'center' },
  dot: {
    width: minimumTarget,
    height: minimumTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: { width: 28, borderRadius: 1.5 },
  tickCurrent: { height: 3, backgroundColor: colors.navy },
  tickOther: { height: hairline, backgroundColor: colors.lineStrong },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.s3,
  },
  skip: { marginRight: 'auto' },
  actionsStacked: { gap: spacing.s3 },
  actionsPair: { flexDirection: 'row', gap: spacing.s3 },
});
