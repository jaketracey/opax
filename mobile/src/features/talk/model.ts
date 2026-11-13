import type {
  EndReason,
  VoiceEvent,
  VoiceFailure,
  VoiceSnapshot,
  VoiceStatus,
} from '../../voice/types';

// Voice failures in plain sentences (specs/account.md 7.6, F-4 and F-5).
// "Microphone off." is never said: the system indicator already shows it.
const couldntConnect = 'Couldn’t connect. Check your connection and try again.';
const wentWrong = 'Something went wrong with voice. Try again.';
export const failureCopy: Record<VoiceFailure, string> = {
  signedOut: 'Talk needs a free OPAX account.',
  disabled: 'Voice is taking a break.',
  allowanceExhausted: 'You’ve used your voice minutes.',
  budgetClosed: 'Voice is closed for the rest of this month.',
  capacity: 'Voice is busy right now. Try again soon.',
  rateLimited: 'Too many tries. Wait a minute, then try again.',
  // Only a 409 from /api/voice/start: the server is still ending the earlier call.
  callOpen: 'Your earlier call is still ending. Try again in a minute.',
  network: couldntConnect,
  timeout: couldntConnect,
  policy: couldntConnect,
  invalidResponse: couldntConnect,
  cancelled: couldntConnect,
  forbidden: wentWrong,
  unavailable: wentWrong,
  unsupportedFormat: wentWrong,
  queueOverflow: wentWrong,
  deletionVerificationFailed: wentWrong,
  audio: 'OPAX couldn’t use the microphone or speaker.',
  microphoneDenied: 'Turn on microphone access in Settings to talk.',
  consentRequired: 'Agree to voice processing to start.',
  statusChecking: 'Checking voice…',
};
/**
 * Android's microphone step: the rationale before the system dialog (the
 * iOS purpose string, voice-production-policy.json) and how a refusal reads.
 */
export const microphoneCopy = {
  heading: 'Microphone access',
  purpose:
    'OPAX uses your microphone only during a Talk call you start. Your audio is sent to ElevenLabs, OPAX’s voice provider, to understand and answer you.',
  next: 'Android asks you next. You can change it any time in Settings.',
  continue: 'Continue',
  notNow: 'Not now',
  denied: 'Allow microphone access to talk.',
  blocked: 'Turn on microphone access in Settings to talk.',
} as const;
export const endCopy: Record<EndReason, string> = {
  user: 'Call ended.',
  interruption: 'The call ended because another app needed the audio.',
  background: 'The call ended when you left OPAX.',
  network: 'The call dropped.',
  mediaReset: 'The call dropped.',
  provider: 'The call dropped.',
  deadline: 'The call reached its time limit.',
  callLimit: 'The call reached its time limit.',
  allowanceExhausted: 'You’ve used your voice minutes.',
  budgetClosed: 'Voice is closed for the rest of this month.',
  consentWithdrawn: 'Voice consent withdrawn.',
  failed: 'Something went wrong with voice.',
};

/** Talk's own words (specs/account.md 7.6 and 7.7). */
export const talkCopy = {
  title: 'Talk to OPAX',
  intro:
    'Ask a question out loud. OPAX answers from the public record and lists the records it used.',
  example: (question: string) => `Try “${question}”`,
  freeMinutes: (minutes: number) =>
    `A free OPAX account includes ${minutes} minutes of voice.`,
  start: 'Start',
  startAgain: 'Start again',
  signIn: 'Sign in',
  askInstead: 'Ask instead',
  tryAgain: 'Try again',
  openSettings: 'Open Settings',
  disclosure: 'AI voice by ElevenLabs. It can be wrong, so check the sources.',
  checkFailed: 'Voice couldn’t be checked.',
  offline: 'You’re offline. Talk needs a connection.',
  status: {
    checking: 'Checking voice',
    ready: 'Ready to talk',
    connecting: 'Connecting',
    listening: 'Listening',
    thinking: 'Thinking',
    speaking: 'OPAX is speaking',
    muted: 'Muted',
    ending: 'Ending the call',
  },
  controls: { mute: 'Mute', type: 'Type', sources: 'Sources', end: 'End' },
  sourcesSpoken: (count: number) => `Sources, ${count}`,
  composer: 'Type to OPAX',
  send: 'Send',
  menu: {
    more: 'More',
    hideCaptions: 'Hide captions',
    showCaptions: 'Show captions',
    report: 'Report this answer',
    voicePrivacy: 'Voice privacy',
    withdraw: 'Withdraw voice consent',
  },
  endConfirm: {
    title: 'End the call?',
    end: 'End call',
    keep: 'Keep talking',
  },
  webRecord: {
    title: 'Open after the call?',
    message: (title: string) =>
      `${title} opens on opax.com.au, which would end the call.`,
    later: 'Open after the call',
    now: 'End call and open',
    keep: 'Keep talking',
  },
  open: (title: string) => `Open ${title}`,
  playbackCut: 'Playback was cut short.',
  youSaid: (text: string) => `You said ${text}`,
  opaxSaid: (text: string) => `OPAX said ${text}`,
  sources: 'Sources',
  sourcesEmpty: 'No records yet.',
  record: 'Record',
  endRecord: 'End',
  consent: {
    title: 'Before you talk',
    sends:
      'Your voice and the conversation go to ElevenLabs, OPAX’s voice provider, so it can answer you.',
    keeps:
      'OPAX keeps when each call happened, never the audio or a transcript. ElevenLabs keeps no audio and deletes transcripts after a day (checked 9 September 2026).',
    withdraw: 'You can withdraw this in Account.',
    voicePrivacy: 'Voice privacy',
    agree: 'Agree and start',
    notNow: 'Not now',
  },
  unavailable: 'Talk isn’t available in this version',
  headphones: (reader: string) =>
    `Headphones keep ${reader} speech out of the microphone.`,
} as const;

/**
 * Voice time, one formatter everywhere (7.6, F-7): whole minutes, never
 * rounded up; seconds under a minute.
 */
export function voiceTime(
  status: Pick<VoiceStatus, 'unlimited' | 'remainingSeconds'>,
): string {
  if (status.unlimited) return 'Unlimited';
  const seconds = Math.max(0, Math.floor(status.remainingSeconds));
  if (seconds >= 60) return `${Math.floor(seconds / 60)} min left`;
  return seconds > 0 ? `${seconds} sec left` : 'No minutes left';
}
/** The same value for VoiceOver, with "min" and "sec" said in full. */
export function voiceTimeSpoken(
  status: Pick<VoiceStatus, 'unlimited' | 'remainingSeconds'>,
): string {
  if (status.unlimited) return 'Unlimited';
  const seconds = Math.max(0, Math.floor(status.remainingSeconds));
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0)
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`;
  return seconds > 0
    ? `${seconds} ${seconds === 1 ? 'second' : 'seconds'} left`
    : 'No minutes left';
}
export function refusal(status: VoiceStatus | null): VoiceFailure | null {
  if (!status) return null;
  if (!status.enabled) return 'disabled';
  if (!status.signedIn) return 'signedOut';
  // An open session is not a refusal: Start takes it over on the server.
  if (status.unlimited !== true && status.remainingSeconds <= 0)
    return 'allowanceExhausted';
  if (status.budgetOpen === false) return 'budgetClosed';
  return null;
}
export const isCallActive = (state: VoiceSnapshot['state']) =>
  ['checking', 'reserving', 'connecting', 'live', 'ending'].includes(state);
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
