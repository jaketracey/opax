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
import { isPad, useLayout, useScreenMargin } from '../../design/adaptive';
import { LaunchHandoff } from '../../launch/LaunchHandoff';
import { releaseSplash } from '../../launch/splash';
import { welcomeSeatRoute } from '../../navigation/routes';
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
  const { fontScale } = useWindowDimensions();
  const layout = useLayout();
  const seat = useSeat();
  const [laidOut, setLaidOut] = useState(false);
  const [covered, setCovered] = useState(launch);
  const leaving = useRef(false);
  const advancing = useRef(false);
  const accessible = isAccessibilityCategory(fontScale);
  const pinned = continuePinned(fontScale);
  const wide = isPad && layout.regular;
  // The short welcome is the same page with Continue only (first-launch
  // 4.5 D2): the same ground.
  const ground = designFlags.groupedSurfaces ? colors.sunken : colors.paper;
  const margin = useScreenMargin();

  const leave = (declined: boolean) => {
    if (leaving.current) return;
    leaving.current = true;
    void markWelcomeSeen({ declined }).catch(() => undefined);
    closeWelcome(navigation as Parameters<typeof closeWelcome>[0]);
  };
  const next = () => {
    if (leaving.current || advancing.current) return;
    if (short) leave(false);
    else {
      advancing.current = true;
      router.push(welcomeSeatRoute());
    }
  };
  // Two-finger Z, Escape and Android back: "Not now" (today.md 3.2). A
  // replay with a seat saved changes nothing; the short welcome declines
  // nothing, so they act as its Continue.
  const notNow = () =>
    leave(!short && seat.status !== 'chosen' && seat.status !== 'loading');

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
        style={styles.screen}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: margin,
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
        <LaunchHandoff
          ready={laidOut}
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
