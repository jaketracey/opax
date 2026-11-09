import { Stack, type NativeStackNavigationOptions } from 'expo-router';
import { useIsPreview } from 'expo-router';
import { NavigationContext } from 'expo-router/react-navigation';
import { useCallback, useContext, type ComponentProps } from 'react';

/** Preview destinations have placeholder navigation that rejects options. */
export function useCanSetOptions() {
  return !useIsPreview();
}

export function useSafeSetOptions() {
  const navigation = useContext(NavigationContext);
  const canSetOptions = useCanSetOptions();
  return useCallback(
    (options: NativeStackNavigationOptions) => {
      if (canSetOptions) navigation?.setOptions?.(options);
    },
    [navigation, canSetOptions],
  );
}

/** Dynamic destination options only. Stack registrations keep Stack.Screen. */
export function RouteOptions(
  props: Pick<ComponentProps<typeof Stack.Screen>, 'options'>,
) {
  return useCanSetOptions() ? <Stack.Screen {...props} /> : null;
}
