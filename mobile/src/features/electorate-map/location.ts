import * as Location from 'expo-location';
import type { Electorate } from '../../api/catalogs';
import { catalogs } from '../../api/runtime';
import { loadOutlines, suggest, type Suggestion } from './suggestion';
import { suggestState, type StateSuggestion } from './state-suggestion';
// Called only from the chooser's button. The fix never crosses this function's
// boundary: no state, storage, transport or logging receives coordinates.
export async function suggestFromLocation(
  seats: Electorate[],
  progress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<Suggestion> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return { kind: 'denied' };
    if (signal.aborted) return { kind: 'unavailable' };
    const outlines = await loadOutlines(
      seats,
      (path) => catalogs.electorate(path),
      progress,
      signal,
    );
    if (signal.aborted) return { kind: 'unavailable' };
    const fix = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    if (signal.aborted) return { kind: 'unavailable' };
    return suggest(
      outlines,
      [fix.coords.longitude, fix.coords.latitude],
      fix.coords.accuracy,
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
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return { kind: 'denied' };
    if (signal.aborted) return { kind: 'unavailable' };
    const fix = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    if (signal.aborted) return { kind: 'unavailable' };
    return suggestState(
      seats,
      [fix.coords.longitude, fix.coords.latitude],
      fix.coords.accuracy,
    );
  } catch {
    return { kind: 'unavailable' };
  }
}
