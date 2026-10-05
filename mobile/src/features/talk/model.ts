import type {
  EndReason,
  VoiceEvent,
  VoiceFailure,
  VoiceSnapshot,
  VoiceStatus,
} from '../../voice/types';

export const failureCopy: Record<VoiceFailure, string> = {
  signedOut: 'Voice needs an OPAX account. Sign in to talk for free.',
  disabled: 'Voice is taking a break. You can still search the public records.',
  allowanceExhausted:
    'You have used your free voice allowance. You can keep exploring the public records.',
  budgetClosed:
    'Voice is closed for the rest of this month. The public records are still here.',
  capacity: 'Voice is busy right now. Please try again in a little while.',
  rateLimited:
    'Voice has received too many start requests. Wait a little while before trying again.',
  callOpen:
    'A voice conversation is already open on your account. End it there, then check availability again.',
  forbidden:
    'OPAX could not authorise this voice request. Your microphone is off.',
  unavailable: 'Voice is unavailable in this build. Your microphone is off.',
  network:
    'The connection ended. Your microphone is off. Check availability before starting again.',
  policy:
    'The voice connection did not meet OPAX’s connection rules. Your microphone is off.',
  unsupportedFormat:
    'The voice provider sent an audio format OPAX cannot play. Your microphone is off.',
  audio: 'OPAX could not use the audio device. Your microphone is off.',
  queueOverflow:
    'The voice connection could not keep up with the audio. Your microphone is off.',
  microphoneDenied:
    'Microphone access is off for OPAX. Turn it on in Settings to talk.',
  consentRequired:
    'Agree to third-party voice processing before starting a conversation.',
  timeout:
    'We could not connect in time. Your microphone is off. Check availability before starting again.',
  invalidResponse:
    'OPAX received an unexpected voice response. Your microphone is off.',
  cancelled: 'The voice request was cancelled. Your microphone is off.',
  statusChecking:
    'Voice availability is still being checked. Wait for the check to finish.',
  deletionVerificationFailed:
    'OPAX could not verify the account deletion code. Check it in Account and about.',
};
export const endCopy: Record<EndReason, string> = {
  user: 'Conversation ended. Your microphone is off.',
  interruption:
    'The conversation ended because another app needed audio. Your microphone is off.',
  background:
    'The conversation ended when you left OPAX. Your microphone is off.',
  mediaReset:
    'The conversation ended because the audio system reset. Your microphone is off.',
  provider:
    'The voice provider ended the conversation. Your microphone is off.',
  deadline: 'The conversation reached its time limit. Your microphone is off.',
  network:
    'The connection ended. Your microphone is off. Check availability before starting again.',
  consentWithdrawn:
    'Voice consent withdrawn. The conversation ended. Your microphone is off.',
  allowanceExhausted:
    'Your free voice allowance is complete. Your microphone is off.',
  budgetClosed:
    'Voice is closed for the rest of this month. Your microphone is off.',
  callLimit:
    'This call has finished. Your microphone is off. You can start another call.',
  failed:
    'Voice ran into a problem. Your microphone is off. Check availability before starting again.',
};
export function refusal(status: VoiceStatus | null): VoiceFailure | null {
  if (!status) return null;
  if (!status.enabled) return 'disabled';
  if (!status.signedIn) return 'signedOut';
  if (status.activeSession) return 'callOpen';
  if (status.unlimited !== true && status.remainingSeconds <= 0)
    return 'allowanceExhausted';
  if (status.budgetOpen === false) return 'budgetClosed';
  return null;
}
export const isCallActive = (state: VoiceSnapshot['state']) =>
  ['checking', 'reserving', 'connecting', 'live', 'ending'].includes(state);
export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
export const timeLabel = (seconds: number) =>
  `${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`;
export const emptySnapshot: VoiceSnapshot = {
  state: 'idle',
  reason: null,
  mode: null,
  playback: 'flowing',
  remaining: 0,
  transcript: [],
  sources: [],
  status: null,
};
export const eventKeys: Record<VoiceEvent['type'], (keyof VoiceSnapshot)[]> = {
  state: ['state', 'reason'],
  mode: ['mode'],
  playback: ['playback'],
  transcript: ['transcript'],
  sources: ['sources'],
  remainingTime: ['remaining'],
  status: ['status'],
  error: [],
};
export function applyEvent(
  current: VoiceSnapshot,
  event: VoiceEvent,
): VoiceSnapshot {
  switch (event.type) {
    case 'state':
      return { ...current, state: event.state, reason: event.reason };
    case 'mode':
      return { ...current, mode: event.mode };
    case 'playback':
      return { ...current, playback: event.playback };
    case 'transcript':
      return { ...current, transcript: event.turns };
    case 'sources':
      return { ...current, sources: event.sources };
    case 'remainingTime':
      return { ...current, remaining: event.seconds };
    case 'status':
      return { ...current, status: event.status };
    case 'error':
      return current;
  }
}
// Merge by field: a caption correction must not hide a recovered call state,
// and a pending snapshot must never overwrite a newer status: null event.
export function recoverSnapshot(
  current: VoiceSnapshot,
  recovered: VoiceSnapshot,
  changed: ReadonlySet<keyof VoiceSnapshot>,
): VoiceSnapshot {
  const next = { ...recovered };
  for (const key of changed) Object.assign(next, { [key]: current[key] });
  return next;
}
