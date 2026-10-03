import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { isProduction } from '../design/environment';
import { fonts, light } from '../design/tokens';
import { closeSheetItem, useStackChrome } from '../navigation/chrome';
export default function Layout() {
  const [loaded, error] = useFonts({
    [fonts.serif]: require('../../assets/fonts/Merriweather.ttf'),
    [fonts.serifBold]: require('../../assets/fonts/Merriweather-Bold.ttf'),
    [fonts.sans]: require('../../assets/fonts/PublicSans.ttf'),
    [fonts.sansSemiBold]: require('../../assets/fonts/PublicSans-SemiBold.ttf'),
    [fonts.sansBold]: require('../../assets/fonts/PublicSans-Bold.ttf'),
  });
  const chrome = useStackChrome();
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
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: light.paper },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="talk"
          options={{ ...sheet, title: 'Talk to OPAX' }}
        />
        <Stack.Screen
          name="account"
          options={{ ...sheet, title: 'Account and about' }}
        />
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
      </Stack>
    </SafeAreaProvider>
  );
}
