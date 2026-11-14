import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isProduction } from '../design/environment';
import { RootLaunchHandoff } from './LaunchHandoff';

/**
 * The root's launch cover, then a probe that says it has gone.
 *
 * The cover takes every touch until it fades, and it is hidden from
 * accessibility, so a UI test sees the tab bar beneath it and its tap lands
 * on the cover. On a slow host the cover is still up a few seconds after
 * launch (journeys 02 and 07 to 11 on iOS 18, 14 Nov 2026).
 */
export function RootLaunchCover() {
  const [handedOver, setHandedOver] = useState(false);
  const endHandoff = useCallback(() => setHandedOver(true), []);
  return handedOver ? (
    <LaunchSettledProbe />
  ) : (
    <RootLaunchHandoff onDone={endHandoff} />
  );
}

/**
 * Debug and e2e only: a 1 pt element, drawn once the cover has gone, that
 * journeys wait for before their first tap (.maestro/support/launch-ready.yaml).
 * Release builds draw nothing.
 */
export function LaunchSettledProbe() {
  const insets = useSafeAreaInsets();
  if (isProduction) return null;
  return (
    <Text
      testID="launch-settled"
      accessible
      accessibilityLabel="Launch settled"
      pointerEvents="none"
      style={{
        position: 'absolute',
        // Beside debug-last-external-url, clear of it.
        top: insets.top + 1,
        left: insets.left + 4,
        width: 1,
        height: 1,
        opacity: 0.02,
        overflow: 'hidden',
      }}
    >
      Launch settled
    </Text>
  );
}
