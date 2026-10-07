import native from '../../modules/opax-voice';
import {
  mapChallenge,
  mapDeletion,
  mapEvent,
  mapLevels,
  mapResult,
  mapStatus,
  mapSnapshot,
} from './mapping';
import type { VoiceResult, VoiceEvent, VoiceLevels } from './types';
export * from './types';
async function invoke<T>(
  call: () => Promise<unknown>,
  decode: (value: unknown) => T,
): Promise<VoiceResult<T>> {
  if (!native) return { ok: false, error: 'unavailable' };
  try {
    return mapResult(await call(), decode);
  } catch {
    return { ok: false, error: 'unavailable' };
  } // No native exception prose crosses into UI.
}
const empty = (value: unknown): void => {
  if (value !== null) throw new Error('Invalid command result');
};
export const snapshot = () => invoke(() => native!.snapshot(), mapSnapshot);
export const status = () => invoke(() => native!.status(), mapStatus);
export const requestCode = (email: string) =>
  invoke(() => native!.requestCode(email), mapChallenge);
export const consumeCode = (challengeId: string, code: string) =>
  invoke(() => native!.consumeCode(challengeId, code), mapStatus);
// Command acknowledgement only. Call lifecycle/refusals arrive through subscribe().
export const start = () => invoke(() => native!.start(), empty);
export const mute = (muted = true) => invoke(() => native!.mute(muted), empty);
export const end = () => invoke(() => native!.end(), empty);
export const logout = () => invoke(() => native!.logout(), empty);
export const requestDeletionCode = () =>
  invoke(() => native!.requestDeletionCode(), mapChallenge);
export const deleteAccount = (challengeId: string, code: string) =>
  invoke(() => native!.deleteAccount(challengeId, code), mapDeletion);
export function subscribe(listener: (event: VoiceEvent) => void): () => void {
  if (!native) return () => {};
  const subscription = native!.addListener('onVoiceEvent', (value) => {
    const event = mapEvent(value);
    if (event) listener(event);
  });
  return () => subscription.remove();
}
/** Call loudness for animation only; a separate stream from call events. */
export function subscribeLevels(
  listener: (levels: VoiceLevels) => void,
): () => void {
  if (!native) return () => {};
  const subscription = native!.addListener('onVoiceLevel', (value) => {
    const levels = mapLevels(value);
    if (levels) listener(levels);
  });
  return () => subscription.remove();
}
