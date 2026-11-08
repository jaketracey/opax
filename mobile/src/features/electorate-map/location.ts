import * as Location from 'expo-location';
import type { Electorate } from '../../api/catalogs';
import { catalogs } from '../../api/runtime';
import { loadOutlines, suggest, type Suggestion } from './suggestion';
import { suggestState, type StateSuggestion } from './state-suggestion';
// The only two location calls in the app (tests/motion-purpose): the
// when-in-use prompt, asked at a chooser's "Use my location" tap, and one
// foreground fix.
// Precise Location off (iOS 14+ reduced accuracy) or an Android coarse grant:
// the fix is a wide circle (first-launch 4.3, S8).
const permission = async () => {
  const response = await Location.requestForegroundPermissionsAsync();
  return {
    granted: response.status === 'granted',
    reduced:
      response.ios?.accuracy === 'reduced' ||
      response.android?.accuracy === 'coarse',
  };
};
const currentFix = () =>
  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
// Called only from the chooser's button. The fix never crosses this function's
// boundary: no state, storage, transport or logging receives coordinates.
export async function suggestFromLocation(
  seats: Electorate[],
  progress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<Suggestion> {
  try {
    const { granted, reduced } = await permission();
    if (!granted) return { kind: 'denied' };
    if (signal.aborted) return { kind: 'unavailable' };
    const outlines = await loadOutlines(
      seats,
      (path) => catalogs.electorate(path),
      progress,
      signal,
    );
    if (signal.aborted) return { kind: 'unavailable' };
    const fix = await currentFix();
    if (signal.aborted) return { kind: 'unavailable' };
    return suggest(
      outlines,
      [fix.coords.longitude, fix.coords.latitude],
      fix.coords.accuracy,
      reduced,
    );
  } catch {
    return { kind: 'unavailable' };
  }
}
/**
 * The state district for the chooser's "Use my location": the permission is
 * asked here, at the tap, and the fix is matched against outlines bundled in
 * the app. Nothing is fetched, so no request (to OPAX or anyone) depends on
 * where the person is, and the fix never leaves this function.
 */
export async function suggestStateFromLocation(
  seats: Electorate[],
  signal: AbortSignal,
): Promise<StateSuggestion> {
  try {
    const { granted, reduced } = await permission();
    if (!granted) return { kind: 'denied' };
    if (signal.aborted) return { kind: 'unavailable' };
    const fix = await currentFix();
    if (signal.aborted) return { kind: 'unavailable' };
    return suggestState(
      seats,
      [fix.coords.longitude, fix.coords.latitude],
      fix.coords.accuracy,
      undefined,
      reduced,
    );
  } catch {
    return { kind: 'unavailable' };
  }
}
