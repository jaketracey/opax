import { Stack } from 'expo-router';
import { useStackChrome } from '../../navigation/chrome';
import { welcomeScreens } from '../../navigation/stack/seat';

/**
 * The welcome page has no bar, so the stack's hard top scroll edge would
 * draw its divider under the status bar (w4-welcome-01). The page hides
 * its top edge; the seat step keeps the stack's chrome under its bar.
 */
const welcomePageEdges = {
  top: 'hidden',
  bottom: 'soft',
  left: 'automatic',
  right: 'automatic',
} as const;

export default function Layout() {
  const chrome = useStackChrome();
  return (
    <Stack
      screenOptions={({ route }) =>
        route.name === 'index'
          ? { ...chrome, scrollEdgeEffects: welcomePageEdges }
          : chrome
      }
    >
      {[...welcomeScreens()]}
    </Stack>
  );
}
