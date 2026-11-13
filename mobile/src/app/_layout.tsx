import { fonts } from '../design/tokens.generated';
// First: holds the native splash until the launch handoff replaces it.
import { useFonts } from 'expo-font';
import {
  Stack,
  ThemeProvider,
  router,
  useRootNavigationState,
  type Href,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Platform,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { startAnalytics, useScreenTracking } from '../analytics';
import { useNavigationTiming } from '../analytics/timing';
import { isPad, useWindowTraits } from '../design/adaptive';
import { hasSourcePreview } from '../design/environment';
import { AndroidMenuHost } from '../design/menu';
import { colors } from '../design/tokens';
import { KeyboardFrames } from '../features/ask/keyboard';
import { RootLaunchHandoff } from '../launch/LaunchHandoff';
import {
  decideLaunchSequence,
  decideSplashPlain,
  holdSplashForWelcome,
} from '../launch/splash';
import { useStackChrome } from '../navigation/chrome';
import { useLinkReadiness } from '../navigation/useLinkReadiness';
import { KeyboardShortcuts } from '../navigation/KeyboardShortcuts';
import { welcomeRoute } from '../navigation/routes';
import { navigationTheme } from '../navigation/theme';
import {
  ExternalURLProbe,
  presentSourceDestination,
  sourceDestination,
  subscribeSourceDestination,
} from '../navigation/source-destination';
import { rootScreens, rootSettings } from '../navigation/stack/root';
import {
  checkFirstLaunch,
  hideTour,
  isContentLink,
  useTourState,
} from '../onboarding/state';
export const unstable_settings = rootSettings;
// Last resort: a page that fails to draw shows Try again instead of closing.
export { RouteErrorBoundary as ErrorBoundary } from '../navigation/RouteErrorBoundary';

export default function Layout() {
  // Keep traits and adaptive-device detection live throughout this session.
  useWindowTraits();
  const [loaded, error] = useFonts({
    [fonts.serif]: require('../../assets/fonts/Merriweather.ttf'),
    [fonts.serifBold]: require('../../assets/fonts/Merriweather-Bold.ttf'),
    [fonts.sans]: require('../../assets/fonts/PublicSans.ttf'),
    [fonts.sansSemiBold]: require('../../assets/fonts/PublicSans-SemiBold.ttf'),
    [fonts.sansBold]: require('../../assets/fonts/PublicSans-Bold.ttf'),
  });
  const chrome = useStackChrome();
  // The bars' light or dark follows the page's (navigation/theme.ts).
  const scheme = useColorScheme();
  const tour = useTourState();
  const navigationReady = !!useRootNavigationState()?.key;
  useLinkReadiness(navigationReady && (loaded || !!error));
  const [handedOver, setHandedOver] = useState(false);
  const endHandoff = useCallback(() => setHandedOver(true), []);
  const launch = useLaunchWelcome(tour);
  useScreenTracking();
  useNavigationTiming();
  useEffect(() => {
    void checkFirstLaunch();
    // Beside the first-launch check: which splash sequence a plain launch
    // plays (launch/played.ts). The cover draws either way; motion waits.
    void decideLaunchSequence();
    startAnalytics();
  }, []);
  // The launch decision, once (shell.md 3, first-launch 4.1 L2 and 4.5): the
  // splash holds while it is pending. A plain first launch presents the full
  // welcome with no animation; a first launch from a link shows the linked
  // page in Today's stack with the short welcome over it. Either way the
  // welcome is presented before the splash may lift, and the splash lifts
  // only once the welcome has laid out, so no frame of Today shows first.
  const presented = useRef(false);
  useEffect(() => {
    if (launch === 'pending' || presented.current) return;
    if (launch === 'none') {
      presented.current = true;
      decideSplashPlain();
      return;
    }
    if (!navigationReady || (!loaded && !error)) return;
    presented.current = true;
    holdSplashForWelcome();
    router.push(welcomeRoute(launch === 'short', 'launch'));
    hideTour();
  }, [launch, navigationReady, loaded, error]);
  useEffect(() => {
    if (!hasSourcePreview) return;
    return subscribeSourceDestination(() => {
      const destination = sourceDestination();
      if (destination === null) return;
      presentSourceDestination(null);
      // A native-stack route can present above Account's existing sheet.
      router.push({
        pathname: '/source-destination',
        params: { ...destination },
      } as Href);
    });
  }, []);
  if (!loaded && !error) return null;
  // Seat services start with the app, rather than with route discovery.
  const { MyMemberProvider } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../features/your-mp/useIsMyMember') as typeof import('../features/your-mp/useIsMyMember');
  return (
    <SafeAreaProvider>
      <MyMemberProvider>
        <StatusBar style={Platform.OS === 'android' ? 'dark' : 'auto'} />
        <KeyboardFrames>
          <View style={styles.app}>
            <AndroidMenuHost />
            <ExternalURLProbe />
            {isPad ? <KeyboardShortcuts /> : null}
            <ThemeProvider value={navigationTheme(scheme)}>
              <Stack
                screenOptions={{
                  ...chrome,
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.paper },
                }}
              >
                {[...rootScreens(chrome)]}
              </Stack>
            </ThemeProvider>
            {handedOver ? null : <RootLaunchHandoff onDone={endHandoff} />}
          </View>
        </KeyboardFrames>
      </MyMemberProvider>
    </SafeAreaProvider>
  );
}

/**
 * What the first launch presents: nothing (seen, or the check failed), the
 * full welcome, or the short welcome when the launch carried a link. The
 * link is read once (`Linking.getInitialURL()`, already resolved by
 * `+native-intent.ts`); a link to Today itself, or a development client's
 * own URL, is a plain launch.
 */
type LaunchWelcome = 'pending' | 'none' | 'full' | 'short';
function useLaunchWelcome(
  tour: 'checking' | 'hidden' | 'visible',
): LaunchWelcome {
  const [link, setLink] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    Linking.getInitialURL().then(
      (url) => active && setLink(isContentLink(url)),
      () => active && setLink(false),
    );
    return () => {
      active = false;
    };
  }, []);
  // Once the root has presented the welcome it marks the decision spent
  // (`hideTour()`), which reads as 'none' here; the root's own guard keeps
  // that from presenting anything twice.
  if (tour === 'checking') return 'pending';
  if (tour === 'hidden') return 'none';
  if (link === null) return 'pending';
  return link ? 'short' : 'full';
}
const styles = StyleSheet.create({ app: { flex: 1 } });
