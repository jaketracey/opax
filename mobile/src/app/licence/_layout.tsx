import { Stack } from 'expo-router';
import { useStackChrome, opaqueBar } from '../../navigation/chrome';
import { useColors } from '../../design/use-colors';
import { licenceScreens } from '../../navigation/stack/reference';

export { RouteErrorBoundary as ErrorBoundary } from '../../navigation/RouteErrorBoundary';

/** Its own stack, grouped like Account; the dataset is the root. */
export default function LicenceStack() {
  const colors = useColors();

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
