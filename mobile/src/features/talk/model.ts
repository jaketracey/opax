import type {
  EndReason,
  VoiceEvent,
  VoiceFailure,
  VoiceSnapshot,
  VoiceStatus,
} from '../../voice/types';

// One short sentence each: the call screen shows it with one action.
export const failureCopy: Record<VoiceFailure, string> = {
  signedOut: 'Voice needs a free OPAX account.',
  disabled: 'Voice is taking a break.',
  allowanceExhausted: 'You have used your free voice minutes.',
  budgetClosed: 'Voice is closed for the rest of this month.',
  capacity: 'Voice is busy right now. Try again soon.',
  rateLimited: 'Too many tries. Wait a little, then try again.',
  callOpen: 'A call is still open on your account.',
  forbidden: 'OPAX could not authorise voice. Microphone off.',
  unavailable: 'Voice is unavailable right now. Microphone off.',
  network: 'Can’t reach OPAX. Check your connection.',
  policy: 'The voice connection was refused. Microphone off.',
  unsupportedFormat: 'OPAX could not play the voice audio. Microphone off.',
  audio: 'OPAX could not use the microphone or speaker.',
  queueOverflow: 'The connection fell behind. Microphone off.',
  microphoneDenied: 'Turn on microphone access to talk.',
  consentRequired: 'Agree to voice processing to start.',
  timeout: 'Could not connect in time. Microphone off.',
  invalidResponse: 'OPAX got an unexpected voice reply. Microphone off.',
  cancelled: 'Voice request cancelled. Microphone off.',
  statusChecking: 'Still checking voice. One moment.',
  deletionVerificationFailed:
    'OPAX could not verify the deletion code. Check it in Account.',
};
export const endCopy: Record<EndReason, string> = {
  user: 'Call ended. Microphone off.',
  interruption: 'Another app took the audio. Microphone off.',
  background: 'The call ended when you left OPAX. Microphone off.',
  mediaReset: 'The audio system reset. Microphone off.',
  provider: 'The voice provider ended the call. Microphone off.',
  deadline: 'The call reached its time limit. Microphone off.',
  network: 'The connection dropped. Microphone off.',
  consentWithdrawn: 'Consent withdrawn. Microphone off.',
  allowanceExhausted: 'Your free minutes are used up. Microphone off.',
  budgetClosed: 'Voice is closed for this month. Microphone off.',
  callLimit: 'This call reached its limit. Microphone off.',
  failed: 'Voice ran into a problem. Microphone off.',
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
export const timeLabel = (seconds: number) => {
  const minutes = Math.floor(seconds / 60),
    rest = seconds % 60;
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ${rest} ${rest === 1 ? 'second' : 'seconds'} remaining`;
};
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
