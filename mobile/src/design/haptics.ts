import { Platform } from 'react-native';
import { OpaxShare } from '../../modules/opax-share';

export type HapticKind = 'success' | 'selection' | 'light';
/**
 * Follow on, Copy and seat chosen use success; custom choices use selection.
 * Native pickers supply their own selection feedback. No navigation, refresh
 * or sheet feedback. Silent,
 * and a no-op where the native module is not linked (unit tests).
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
