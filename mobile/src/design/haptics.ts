import { Platform } from 'react-native';
import { OpaxShare } from '../../modules/opax-share';

export type HapticKind = 'success' | 'selection' | 'light';
/**
 * Haptics confirm something the reader did; nothing fires on plain scrolling,
 * navigation or an ordinary tap.
 * - success: Follow on, Copy, seat chosen, a saved setting.
 * - selection: custom choices, a switch row, Unfollow, and a sheet settling
 *   on another detent (`navigation/sheet-snap.ts`).
 * - light: before a share sheet.
 * Native pickers supply their own selection feedback, and UIKit's refresh
 * control plays its own tap when a pull crosses the threshold, so neither
 * gets a second one here. A haptic belongs to the press or the native event
 * that caused it, never to a mount: a remount must not replay it.
 * Silent, and a no-op where the native module is not linked (unit tests).
 * Android maps success to CONFIRM and selection to CLOCK_TICK natively; it has
 * no light tap before a share sheet (the ripple is the feedback), so Android
 * drops `light`.
 */
export function haptic(kind: HapticKind = 'light') {
  if (Platform.OS === 'android' && kind === 'light') return;
  // Feedback is decoration; never fail the action for it.
  try {
    void OpaxShare?.haptic?.(kind)?.catch(() => undefined);
  } catch {
    /* Not linked in this build. */
  }
}
