// First: holds the native splash until the launch handoff replaces it.
import '../launch/splash';
import { useStackChrome } from '../navigation/chrome';
import { rootScreens, rootSettings } from '../navigation/stack/root';
import {
  ExternalURLProbe,
  presentSourceDestination,
  sourceDestination,
  subscribeSourceDestination,
} from '../navigation/source-destination';
import { AndroidMenuHost } from '../design/menu';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { hasSourcePreview } from '../design/environment';
import { fonts, light } from '../design/tokens';
import { requestSeatChooser } from '../features/your-mp/chooser-request';
import { LaunchHandoff } from '../launch/LaunchHandoff';
import {
  checkFirstLaunch,
  hideTour,
  leaveTour,
  useTourState,
} from '../onboarding/state';
import { WelcomeTour } from '../onboarding/WelcomeTour';
import { isPad } from '../design/adaptive';
import { KeyboardShortcuts } from '../navigation/KeyboardShortcuts';
export const unstable_settings = rootSettings;

export default function Layout() {
  const [loaded, error] = useFonts({
    [fonts.serif]: require('../../assets/fonts/Merriweather.ttf'),
    [fonts.serifBold]: require('../../assets/fonts/Merriweather-Bold.ttf'),
    [fonts.sans]: require('../../assets/fonts/PublicSans.ttf'),
    [fonts.sansSemiBold]: require('../../assets/fonts/PublicSans-SemiBold.ttf'),
    [fonts.sansBold]: require('../../assets/fonts/PublicSans-Bold.ttf'),
  });
  const chrome = useStackChrome();
  const tour = useTourState();
  const [laidOut, setLaidOut] = useState(false);
  const [handedOver, setHandedOver] = useState(false);
  const endHandoff = useCallback(() => setHandedOver(true), []);
  useEffect(() => {
    void checkFirstLaunch();
  }, []);
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
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={styles.app} onLayout={() => setLaidOut(true)}>
        <AndroidMenuHost />
        <ExternalURLProbe />
        {isPad ? <KeyboardShortcuts /> : null}
        <Stack
          screenOptions={{
            ...chrome,
            headerShown: false,
            contentStyle: { backgroundColor: light.paper },
          }}
        >
          {[...rootScreens(chrome)]}
        </Stack>
        {/* Above the tabs; a replay closes the Account sheet first. */}
        {tour === 'visible' ? (
          <WelcomeTour
            entrance={handedOver}
            onLeave={(reason) => {
              void leaveTour();
              if (reason === 'finish') {
                requestSeatChooser();
                router.navigate('/your-mp' as Href);
              }
            }}
            onClosed={hideTour}
          />
        ) : null}
        {handedOver ? null : (
          <LaunchHandoff
            ready={laidOut && tour !== 'checking'}
            onDone={endHandoff}
          />
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ app: { flex: 1 } });
