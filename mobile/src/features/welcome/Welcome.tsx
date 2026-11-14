import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useNavigation, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../design/controls';
import { copy } from '../../design/copy';
import { designFlags } from '../../design/flags';
import { Icon } from '../../design/icon';
import { useKeyScope } from '../../design/keyboard';
import { Text } from '../../design/text';
import {
  colors,
  contentSizeCategory,
  isAccessibilityCategory,
  rhythm,
} from '../../design/tokens';
import { useLayout, useScreenMargin } from '../../design/adaptive';
import { LaunchHandoff } from '../../launch/LaunchHandoff';
import { welcomeMounted } from '../../launch/settled';
import { releaseSplash } from '../../launch/splash';
import { welcomeSeatRoute } from '../../navigation/routes';
import { firstRunSkipped } from '../../onboarding/measure';
import { closeWelcome, markWelcomeSeen } from '../../onboarding/state';
import { useSeat } from '../your-mp/useSeat';
import { welcomeCopy } from './copy';

/** The welcome's content column on a wide screen (today.md 3.3). */
export const WELCOME_COLUMN = 540;

/**
 * Accessibility sizes from AX3 up push the fine print below the fold, so
 * Continue unpins and becomes the last item in the scroll, under the notice
 * (first-launch 4.2 A1, S1): the cultural notice is always on screen before
 * Continue can be tapped.
 */
export function continuePinned(fontScale: number): boolean {
  return !['ax3', 'ax4', 'ax5'].includes(contentSizeCategory(fontScale));
}

/**
 * Whether the page overflows its scroll view, from the scroll view's height
 * and its content's. Below AX3 a short window (the Duo's outer display, a
 * landscape phone) can overflow too: the pinned foot then cut the cultural
 * notice through above Continue, with no sign the page scrolled (BACKLOG
 * D10). Measured overflow unpins Continue the same way AX3 does.
 */
export function overflows(view: number, content: number): boolean {
  return view > 0 && content > view + 1;
}

/**
 * The welcome (`/welcome`, shell.md 4, today.md 3): one full-screen page on
 * every device, Apple's feature-list layout, then the pushed seat step. The
 * short form (`short`) is shown over a page opened from a link on the first
 * launch: Continue closes it onto that page, with no seat step
 * (first-launch 4.5 D2 to D4).
 *
 * `launch`: presented with no animation straight out of the splash. The page
 * draws the splash image over itself and dissolves it once laid out, so the
 * reader sees the mark, then the welcome, and no frame of Today.
 */
export function WelcomePage({
  short = false,
  launch = false,
}: {
  short?: boolean;
  launch?: boolean;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { fontScale, width, height } = useWindowDimensions();
  const layout = useLayout();
  const seat = useSeat();
  const [laidOut, setLaidOut] = useState(false);
  const [covered, setCovered] = useState(launch);
  const leaving = useRef(false);
  const advancing = useRef(false);
  const accessible = isAccessibilityCategory(fontScale);
  // A window that overflowed with Continue pinned keeps it unpinned until
  // the window or the text size changes (unpinned, the page only grows).
  const windowKey = `${width}x${height}@${fontScale}`;
  const [overflowedAt, setOverflowedAt] = useState<string | null>(null);
  const pinned = continuePinned(fontScale) && overflowedAt !== windowKey;
  const scroll = useRef<ScrollView>(null);
  const size = useRef({ view: 0, content: 0 });
  const [scrolls, setScrolls] = useState(false);
  const measure = () => {
    const over = overflows(size.current.view, size.current.content);
    setScrolls(over);
    if (over && pinned) setOverflowedAt(windowKey);
  };
  // The sign the page scrolls: the system indicator, flashed once the page
  // is in view (after the launch cover has gone).
  useEffect(() => {
    if (scrolls && !covered) scroll.current?.flashScrollIndicators();
  }, [scrolls, covered]);
  // While a welcome is up, a launch does not settle (launch/settled.ts):
  // motion held for the launch starts when the reader first sees Today.
  useEffect(() => welcomeMounted(), []);
  const wide = layout.regular;
  // The short welcome is the same page with Continue only (first-launch
  // 4.5 D2): the same ground.
  const ground = designFlags.groupedSurfaces ? colors.sunken : colors.paper;
  const margin = useScreenMargin();

  const leave = (declined: boolean) => {
    if (leaving.current) return;
    leaving.current = true;
    void markWelcomeSeen({ declined }).catch(() => undefined);
    if (declined) firstRunSkipped('welcome');
    closeWelcome(navigation as Parameters<typeof closeWelcome>[0]);
  };
  const next = () => {
    if (leaving.current || advancing.current) return;
    if (short) leave(false);
    else {
      advancing.current = true;
      // Continue has shown the page and its notice, so the welcome counts as
      // seen from here: a reader who leaves the app on the electorate step
      // comes back to Today and its invitation, not to this page again.
      void markWelcomeSeen().catch(() => undefined);
      router.push(welcomeSeatRoute());
    }
  };
  // Two-finger Z, Escape and Android back: "Not now" (today.md 3.2). A
  // replay with a seat saved changes nothing; the short welcome declines
  // nothing, so they act as its Continue. Only a saved seat makes it a
  // no-op: on a first launch the seat read can still be in flight, and a
  // "Not now" then must still move Today's invitation (a replay's seat has
  // long been read).
  const notNow = () => leave(!short && seat.status !== 'chosen');

  useFocusEffect(() => {
    if (Platform.OS !== 'android') return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      notNow();
      return true;
    });
    return () => back.remove();
  });
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    const blur = navigation.addListener('blur', () => setFocused(false));
    const focus = navigation.addListener('focus', () => {
      advancing.current = false;
      setFocused(true);
    });
    return () => {
      blur();
      focus();
    };
  }, [navigation]);
  useKeyScope(
    [
      {
        id: 'welcome-continue',
        input: 'return',
        modifiers: [],
        title: welcomeCopy.continue,
        priority: true,
        run: next,
      },
      {
        id: 'welcome-not-now',
        input: 'escape',
        modifiers: [],
        title: short ? welcomeCopy.continue : copy.notNow,
        priority: true,
        run: notNow,
      },
    ],
    focused,
  );

  const button = (
    <Button
      label={welcomeCopy.continue}
      variant="primary"
      size="large"
      fullWidth
      onPress={next}
      testID="welcome-continue"
    />
  );
  const markSize = accessible ? 44 : wide ? 72 : 64;
  return (
    <View
      testID={short ? 'welcome-short' : 'welcome-screen'}
      accessibilityViewIsModal
      onAccessibilityEscape={notNow}
      style={[styles.screen, { backgroundColor: ground }]}
      onLayout={() => {
        if (laidOut) return;
        setLaidOut(true);
        releaseSplash('welcome');
      }}
    >
      <ScrollView
        ref={scroll}
        testID="welcome-scroll"
        style={styles.screen}
        contentInsetAdjustmentBehavior="never"
        onLayout={(event) => {
          size.current.view = event.nativeEvent.layout.height;
          measure();
        }}
        onContentSizeChange={(_, contentHeight) => {
          size.current.content = contentHeight;
          measure();
        }}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: margin,
            paddingLeft: margin + insets.left,
            paddingRight: margin + insets.right,
            paddingTop: insets.top + (wide ? rhythm.section : 56),
            // Unpinned, the scroll's end leaves the whole button above the
            // home indicator.
            paddingBottom: pinned ? rhythm.block : insets.bottom + rhythm.block,
          },
        ]}
      >
        <View style={[styles.column, { maxWidth: WELCOME_COLUMN }]}>
          <Image
            source={require('../../../assets/splash/mark.png')}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID="welcome-mark"
            style={{ width: markSize, height: markSize, alignSelf: 'center' }}
          />
          <Text
            wordSafe
            variant="largeTitle"
            accessibilityRole="header"
            testID="welcome-title"
            style={styles.title}
          >
            {welcomeCopy.title}
          </Text>
          <View style={styles.rows}>
            {welcomeCopy.features.map((feature) => (
              <View
                key={feature.id}
                accessible
                accessibilityLabel={`${feature.title}. ${feature.line}`}
                testID={`welcome-row-${feature.id}`}
                style={accessible ? styles.rowStacked : styles.row}
              >
                <View style={accessible ? null : styles.symbol}>
                  {/* The tint, at full strength in every layer: hierarchical
                      navy drew the secondary layers grey, so the glyphs
                      read as ink (w4-welcome-01). */}
                  <Icon
                    name={feature.symbol}
                    size={36}
                    maxScale={1.5}
                    tone="navy"
                    scale="large"
                  />
                </View>
                <View
                  style={accessible ? styles.rowTextStacked : styles.rowText}
                >
                  <Text wordSafe variant="subsectionTitle">
                    {feature.title}
                  </Text>
                  <Text wordSafe variant="secondary">
                    {feature.line}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          <View
            accessible
            accessibilityLabel={`${copy.independence} ${copy.deceasedNotice}`}
            style={styles.fine}
          >
            <Text
              wordSafe
              variant="footnote"
              tone="inkSoft"
              testID="welcome-independence"
              style={styles.centred}
            >
              {copy.independence}
            </Text>
            <Text
              wordSafe
              variant="footnote"
              tone="inkSoft"
              testID="welcome-notice"
              style={styles.centred}
            >
              {copy.deceasedNotice}
            </Text>
          </View>
          {pinned ? null : <View style={styles.unpinned}>{button}</View>}
        </View>
      </ScrollView>
      {pinned ? (
        <View
          style={[
            styles.foot,
            {
              paddingHorizontal: margin,
              paddingLeft: margin + insets.left,
              paddingRight: margin + insets.right,
              backgroundColor: ground,
              paddingBottom: Math.max(insets.bottom, rhythm.block),
            },
          ]}
        >
          <View style={[styles.column, { maxWidth: WELCOME_COLUMN }]}>
            {button}
          </View>
        </View>
      ) : null}
      {covered ? (
        // A first launch: the name unfolds here, over the welcome, since the
        // root's cover sits under this full-screen modal.
        <LaunchHandoff
          ready={laidOut}
          sequence="full"
          onDone={() => setCovered(false)}
          testID="welcome-launch-cover"
        />
      ) : null}
    </View>
  );
}

/** `/welcome`: the full welcome. */
export default function Welcome({ launch = false }: { launch?: boolean }) {
  return <WelcomePage launch={launch} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  column: { width: '100%', alignSelf: 'center' },
  title: { textAlign: 'center', marginTop: rhythm.block },
  rows: { marginTop: rhythm.section, gap: rhythm.group },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: rhythm.block },
  rowStacked: { gap: rhythm.tight },
  symbol: { width: 44, alignItems: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTextStacked: { gap: 2 },
  fine: { marginTop: rhythm.section, gap: rhythm.tight },
  centred: { textAlign: 'center' },
  unpinned: { marginTop: rhythm.group },
  foot: { paddingTop: rhythm.block },
});
