import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../design/tokens';
export default function Layout() {
  const [loaded, error] = useFonts({
    Merriweather: require('../../assets/fonts/Merriweather.ttf'),
    PublicSans: require('../../assets/fonts/PublicSans.ttf'),
  });
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.paper },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="person/[slug]" />
      </Stack>
    </SafeAreaProvider>
  );
}
