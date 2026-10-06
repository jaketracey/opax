import native from '../../../modules/opax-voice';
import { mapResult } from '../../voice/mapping';
import type { VoiceResult } from '../../voice/types';

// UI additions live here so the account lane's public bridge stays unchanged.
export async function readConsent(): Promise<boolean> {
  try {
    return native ? (await native.consent()) === true : false;
  } catch {
    return false;
  }
}
export async function setConsent(granted: boolean): Promise<boolean> {
  if (!native) return false;
  try {
    await native.setConsent(granted);
    return (await native.consent()) === granted;
  } catch {
    return false;
  }
}
export async function sendText(text: string): Promise<VoiceResult<void>> {
  if (!native) return { ok: false, error: 'unavailable' };
  try {
    return mapResult(await native.sendText(text), (value) => {
      if (value !== null) throw new Error('Invalid command acknowledgement');
    });
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}
export async function background(): Promise<void> {
  try {
    await native?.background();
  } catch {
    // Native lifecycle also owns background teardown; never retry a call.
  }
}

export async function discardEvidence(): Promise<void> {
  try {
    await native?.discardEvidence();
  } catch {
    /* No transcript is stored in JS. */
  }
}
