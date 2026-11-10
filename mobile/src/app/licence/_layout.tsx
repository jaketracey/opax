import { Stack } from 'expo-router';
export { RouteErrorBoundary as ErrorBoundary } from '../../design/route-error';
import { useStackChrome, opaqueBar } from '../../navigation/chrome';
import { colors } from '../../design/tokens';
import { licenceScreens } from '../../navigation/stack/reference';

/** Its own stack, grouped like Account; the dataset is the root. */
export default function LicenceStack() {
  return (
    <Stack
      screenOptions={{
        ...useStackChrome(),
        ...opaqueBar(colors.sunken),
        contentStyle: { backgroundColor: colors.sunken },
      }}
    >
      {[...licenceScreens()]}
    </Stack>
  );
}
