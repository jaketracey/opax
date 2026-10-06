export const callStates = [
  'idle',
  'checking',
  'unavailable',
  'ready',
  'reserving',
  'connecting',
  'live',
  'ending',
  'ended',
  'failed',
] as const;
export type CallState = (typeof callStates)[number];
export const failures = [
  'signedOut',
  'disabled',
  'allowanceExhausted',
  'budgetClosed',
  'capacity',
  'rateLimited',
  'callOpen',
  'forbidden',
  'unavailable',
  'network',
  'policy',
  'unsupportedFormat',
  'audio',
  'queueOverflow',
  'microphoneDenied',
  'consentRequired',
  'timeout',
  'invalidResponse',
  'cancelled',
  'statusChecking',
  'deletionVerificationFailed',
] as const;
export type VoiceFailure = (typeof failures)[number];
export const endReasons = [
  'user',
  'interruption',
  'background',
  'mediaReset',
  'provider',
  'deadline',
  'network',
  'consentWithdrawn',
  'allowanceExhausted',
  'budgetClosed',
  'callLimit',
  'failed',
] as const;
export type EndReason = (typeof endReasons)[number];
export type VoiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: VoiceFailure };
export type VoiceStatus = {
  enabled: boolean;
  signedIn: boolean;
  unlimited: boolean | null;
  totalSeconds: number | null;
  remainingSeconds: number;
  activeSession: {
    state: 'reserved' | 'connecting' | 'active' | 'unknown';
    expiresAt: number | null;
  } | null;
  budgetOpen: boolean | null;
  /**
   * This iPhone holds an account session the server has not revoked. Voice
   * can refuse a member (a disabled one) whose account can still be signed
   * out and deleted. Absent from older native builds.
   */
  accountHeld?: boolean;
};
export type CodeChallenge = { sent: boolean; challengeId: string };
export type AccountDeletion = { deleted: boolean; signedOut: boolean };
export type TranscriptTurn = {
  role: 'user' | 'agent';
  id: number;
  text: string;
};
export type VoiceSource = { title: string; path: string };
export type VoiceEvent =
  | { type: 'state'; state: CallState; reason: EndReason | null }
  | { type: 'mode'; mode: 'listening' | 'speaking' | 'muted' }
  | { type: 'playback'; playback: 'flowing' | 'buffering' | 'truncated' }
  | { type: 'transcript'; turns: TranscriptTurn[] }
  | { type: 'sources'; sources: VoiceSource[] }
  | { type: 'remainingTime'; seconds: number }
  | { type: 'error'; error: VoiceFailure }
  | { type: 'status'; status: VoiceStatus | null };

export type VoiceSnapshot = {
  state: CallState;
  reason: EndReason | null;
  mode: 'listening' | 'speaking' | 'muted' | null;
  playback: 'flowing' | 'buffering' | 'truncated';
  remaining: number;
  transcript: TranscriptTurn[];
  sources: VoiceSource[];
  status: VoiceStatus | null;
};
