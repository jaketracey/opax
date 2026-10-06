import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  View,
  findNodeHandle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Divider,
  Heading,
  Text,
  useReduceMotionSetting,
} from '../design/primitives';
import {
  colors,
  fonts,
  hairline,
  isAccessibilityCategory,
  layout,
  radius,
  spacing,
} from '../design/tokens';
import {
  finishLabel,
  pageAnnouncement,
  welcomePages,
  type WelcomePage,
} from './pages';
import { Scene } from './scenes';

/**
 * The welcome tour: five pages over the app, once per device after the first
 * launch and again from Account (src/onboarding/state.ts). Each page is a
 * live scene built from the app's components above a few plain sentences.
 *
 * - A native paging scroll view: the reader swipes or taps Next. Nothing
 *   advances on its own. Skip is always visible and closes the tour.
 * - Parallax: the scene lags the page a little and the words fade with it.
 *   Reduce Motion: no parallax, no reveal and no animated page turns; Next
 *   moves straight to the next page.
 * - VoiceOver: the masthead, Skip, the page ("Page 2 of 5. Your MP. …"), the
 *   position and the button, in that order. Pages off screen are hidden, and
 *   Next moves focus to the new page. Scenes are pictures and take no focus.
 * - Dynamic Type to AX5: each page scrolls; at accessibility sizes the words
 *   come before the picture.
 * - The last page's button, Choose your electorate, closes the tour and
 *   opens Your MP's seat chooser.
 */
export function WelcomeTour({
  entrance = false,
  onLeave,
  onClosed,
}: {
  /** Fade in (a replay); the first launch's handoff already covers it. */
  entrance?: boolean;
  /** Skip or the last page's button, at the press, before the tour fades. */
  onLeave: (reason: 'skip' | 'finish') => void;
  /** The tour has faded out. */
  onClosed: () => void;
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Null until iOS answers: scenes wait, and nothing parallaxes or animates
  // a page turn until the setting is known to be off.
  const motion = useReduceMotionSetting();
  const reduced = motion !== false;
  const accessibilitySize = isAccessibilityCategory(fontScale);
  const count = welcomePages.length;
  const [page, setPage] = useState(0);
  // The page nearest the centre while swiping: its scene starts revealing.
  const [near, setNear] = useState(0);
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0]));
  const scrollX = useState(() => new Animated.Value(0))[0];
  const pager = useRef<ScrollView>(null);
  const words = useRef<(View | null)[]>([]);
  const veil = useState(() => new Animated.Value(entrance ? 0 : 1))[0];
  const closing = useRef(false);
  const last = page === count - 1;

  const focusPage = (index: number) => {
    const node = findNodeHandle(words.current[index] ?? null);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  };

  useEffect(() => {
    if (entrance)
      Animated.timing(veil, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    const timer = setTimeout(() => focusPage(0), 500);
    return () => clearTimeout(timer);
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same values bail out, so the scroll listener can call this freely.
  const reveal = (index: number) => {
    setNear(index);
    setSeen((previous) =>
      previous.has(index) ? previous : new Set([...previous, index]),
    );
  };

  const settle = (index: number) => {
    const target = Math.max(0, Math.min(count - 1, index));
    reveal(target);
    if (target === page) return;
    setPage(target);
    setTimeout(() => focusPage(target), 80);
  };

  const go = (index: number) => {
    pager.current?.scrollTo({ x: index * width, animated: !reduced });
    settle(index);
  };

  const leave = (reason: 'skip' | 'finish') => {
    if (closing.current) return;
    closing.current = true;
    onLeave(reason);
    Animated.timing(veil, {
      toValue: 0,
      duration: reduced ? 200 : 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => onClosed());
  };

  // Created once: the listener only uses state setters.
  const [onScroll] = useState(() =>
    Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
      useNativeDriver: true,
      listener: (event: {
        nativeEvent: {
          contentOffset: { x: number };
          layoutMeasurement: { width: number };
        };
      }) => {
        const { contentOffset, layoutMeasurement } = event.nativeEvent;
        if (layoutMeasurement.width <= 0) return;
        const nearest = Math.round(contentOffset.x / layoutMeasurement.width);
        if (nearest >= 0 && nearest < count) reveal(nearest);
      },
    }),
  );

  // At standard sizes the picture and the words fit without scrolling on
  // every supported iPhone; at accessibility sizes the page scrolls.
  const stageHeight = accessibilitySize
    ? 260
    : Math.round(Math.max(230, Math.min(330, height * 0.34)));

  // A rotation changes the page width: stay on the same page.
  useEffect(() => {
    pager.current?.scrollTo({ x: page * width, animated: false });
    // Only when the width changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  return (
    <Animated.View
      testID="welcome-tour"
      accessibilityViewIsModal
      style={[styles.tour, { opacity: veil }]}
    >
      <View
        style={[
          styles.masthead,
          {
            paddingTop: insets.top + spacing.s2,
            paddingLeft: layout.screenMargin + insets.left,
            paddingRight: layout.screenMargin - spacing.s3 + insets.right,
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
        <Button
          label="Skip"
          variant="quiet"
          size="compact"
          accessibilityHint="Closes the welcome tour"
          testID="tour-skip"
          onPress={() => leave('skip')}
        />
      </View>
      <View style={styles.rule}>
        <Divider />
      </View>

      <Animated.ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        onScroll={onScroll}
        onMomentumScrollEnd={(event) =>
          settle(Math.round(event.nativeEvent.contentOffset.x / width))
        }
        style={styles.pager}
      >
        {welcomePages.map((item, index) => (
          <Page
            key={item.id}
            page={item}
            index={index}
            count={count}
            width={width}
            stageHeight={stageHeight}
            scrollX={scrollX}
            current={index === page}
            revealed={seen.has(index) || index === near}
            reduced={reduced}
            motion={motion}
            fontScale={fontScale}
            wordsFirst={accessibilitySize}
            insets={{ left: insets.left, right: insets.right }}
            wordsRef={(node) => {
              words.current[index] = node;
            }}
          />
        ))}
      </Animated.ScrollView>

      <View
        style={[
          styles.controls,
          {
            paddingBottom: insets.bottom + spacing.s3,
            paddingLeft: layout.screenMargin + insets.left,
            paddingRight: layout.screenMargin + insets.right,
          },
        ]}
      >
        <Progress count={count} page={page} />
        <Button
          label={last ? finishLabel : 'Next'}
          variant="primary"
          size="large"
          fullWidth
          accessibilityHint={
            last
              ? 'Closes the tour and opens the seat chooser'
              : `Page ${page + 2} of ${count}`
          }
          testID={last ? 'tour-finish' : 'tour-next'}
          onPress={() => (last ? leave('finish') : go(page + 1))}
        />
      </View>
    </Animated.View>
  );
}

function Page({
  page,
  index,
  count,
  width,
  stageHeight,
  scrollX,
  current,
  revealed,
  reduced,
  motion,
  fontScale,
  wordsFirst,
  insets,
  wordsRef,
}: {
  page: WelcomePage;
  index: number;
  count: number;
  width: number;
  stageHeight: number;
  scrollX: Animated.Value;
  current: boolean;
  revealed: boolean;
  reduced: boolean;
  /** The Reduce Motion setting, or null until it is known. */
  motion: boolean | null;
  fontScale: number;
  wordsFirst: boolean;
  insets: { left: number; right: number };
  wordsRef: (node: View | null) => void;
}) {
  const margin = layout.screenMargin;
  const range = [(index - 1) * width, index * width, (index + 1) * width];
  // The scene lags the page by up to 40pt; the words drift and fade.
  const sceneShift = reduced
    ? null
    : {
        transform: [
          {
            translateX: scrollX.interpolate({
              inputRange: range,
              outputRange: [40, 0, -40],
              extrapolate: 'clamp',
            }),
          },
        ],
      };
  const wordsShift = reduced
    ? null
    : {
        opacity: scrollX.interpolate({
          inputRange: [
            (index - 0.7) * width,
            index * width,
            (index + 0.7) * width,
          ],
          outputRange: [0, 1, 0],
          extrapolate: 'clamp',
        }),
        transform: [
          {
            translateX: scrollX.interpolate({
              inputRange: range,
              outputRange: [24, 0, -24],
              extrapolate: 'clamp',
            }),
          },
        ],
      };
  const plateInner = width - 2 * margin - insets.left - insets.right - 2 * 16;
  const stage = (
    <View style={styles.plate}>
      {page.example ? (
        <Text variant="kicker" testID={`tour-example-${page.id}`}>
          Example
        </Text>
      ) : null}
      <Animated.View style={sceneShift}>
        <Scene
          page={page}
          width={plateInner}
          height={stageHeight}
          fontScale={fontScale}
          active={revealed}
          reduced={motion}
        />
      </Animated.View>
    </View>
  );
  const text = (
    <Animated.View
      ref={wordsRef}
      testID={`tour-page-${page.id}`}
      accessible
      accessibilityLabel={pageAnnouncement(index, count)}
      style={[styles.words, wordsShift]}
    >
      <Heading level={1}>{page.title}</Heading>
      <Text variant="lede">{page.body}</Text>
    </Animated.View>
  );
  return (
    <View
      style={{ width }}
      accessibilityElementsHidden={!current}
      importantForAccessibility={current ? 'auto' : 'no-hide-descendants'}
    >
      <ScrollView
        testID={`tour-scroll-${page.id}`}
        showsVerticalScrollIndicator={wordsFirst}
        contentContainerStyle={[
          styles.page,
          {
            paddingLeft: margin + insets.left,
            paddingRight: margin + insets.right,
          },
        ]}
      >
        {wordsFirst ? text : stage}
        {wordsFirst ? stage : text}
      </ScrollView>
    </View>
  );
}

/** Five short hairlines; the current page's is navy and thicker. */
function Progress({ count, page }: { count: number; page: number }) {
  return (
    <View
      accessible
      accessibilityLabel={`Page ${page + 1} of ${count}`}
      testID="tour-progress"
      style={styles.progress}
    >
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={[
            styles.tick,
            index === page ? styles.tickCurrent : styles.tickOther,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tour: { ...StyleSheet.absoluteFill, backgroundColor: colors.paper },
  masthead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.s2,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  mark: { width: 28, height: 28 },
  wordmark: {
    fontFamily: fonts.serifBold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
  },
  rule: { paddingHorizontal: layout.screenMargin },
  pager: { flex: 1 },
  page: {
    paddingTop: spacing.s5,
    paddingBottom: spacing.s5,
    gap: spacing.s5,
  },
  plate: {
    backgroundColor: colors.raised,
    borderColor: colors.line,
    borderWidth: hairline,
    borderRadius: radius,
    padding: 16,
    gap: spacing.s3,
  },
  words: { gap: spacing.s3 },
  controls: {
    gap: spacing.s4,
    paddingTop: spacing.s3,
    borderTopWidth: hairline,
    borderTopColor: colors.dividerSubtle,
    backgroundColor: colors.paper,
  },
  progress: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: 12,
  },
  tick: { width: 24, borderRadius: 1 },
  tickCurrent: { height: 3, backgroundColor: colors.navy },
  tickOther: { height: hairline, backgroundColor: colors.lineStrong },
});
