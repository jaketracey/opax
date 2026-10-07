import { OpaxShare } from '../../modules/opax-share';

export type HapticKind = 'success' | 'selection' | 'light';
/**
 * A light tap of confirmation: Follow ("success"), Share ("light"). Silent,
 * and a no-op where the native module is not linked (unit tests).
 */
export function haptic(kind: HapticKind = 'light') {
  // Feedback is decoration; never fail the action for it.
  try {
    void OpaxShare?.haptic?.(kind)?.catch(() => undefined);
  } catch {
    /* Not linked in this build. */
  }
}
