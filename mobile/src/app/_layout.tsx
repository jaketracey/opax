// First: holds the native splash until the launch handoff replaces it.
import '../launch/splash';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { hasSourcePreview, isProduction } from '../design/environment';
import { fonts, light } from '../design/tokens';
import { requestSeatChooser } from '../features/your-mp/chooser-request';
import { LaunchHandoff } from '../launch/LaunchHandoff';
import { closeSheetItem, useStackChrome } from '../navigation/chrome';
import {
  checkFirstLaunch,
  hideTour,
  leaveTour,
  useTourState,
} from '../onboarding/state';
import { WelcomeTour } from '../onboarding/WelcomeTour';
import {
  presentSourceDestination,
  sourceDestination,
  subscribeSourceDestination,
} from '../navigation/source-destination';
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
  // Talk and Account and about are full-height sheets from the navigation bar
  // (IOS-UX section 3). Their lanes replace the placeholder content.
  const sheet = {
    ...chrome,
    headerShown: true,
    presentation: 'modal' as const,
    unstable_headerRightItems: () => [closeSheetItem()],
  };
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={styles.app} onLayout={() => setLaidOut(true)}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: light.paper },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="money"
            options={{ ...chrome, headerShown: true, title: 'Money map' }}
          />
          <Stack.Screen
            name="money-node"
            options={{
              ...sheet,
              presentation: 'formSheet',
              title: 'Money record',
              sheetAllowedDetents: [1],
              sheetGrabberVisible: true,
            }}
          />
          <Stack.Screen
            name="talk"
            options={{ ...sheet, title: 'Talk to OPAX' }}
          />
          <Stack.Screen
            name="account"
            options={{ ...sheet, headerShown: false }}
          />
          {hasSourcePreview ? (
            <Stack.Screen
              name="source-destination"
              options={{
                headerShown: false,
                presentation: 'fullScreenModal',
                animation: 'none',
              }}
            />
          ) : null}
          {isProduction ? null : (
            // Development and e2e only: the route file is excluded from release
            // bundles by metro.config.js.
            <Stack.Screen
              name="workbench"
              options={{
                ...sheet,
                presentation: 'fullScreenModal',
                title: 'Workbench',
              }}
            />
          )}
          {isProduction ? null : (
            <Stack.Screen
              name="money-map-spike"
              options={{
                ...chrome,
                headerShown: true,
                title: 'Money map spike',
              }}
            />
          )}
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
