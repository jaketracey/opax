import {
  callStates,
  endReasons,
  failures,
  type VoiceStatus,
  type VoiceSnapshot,
  type VoiceEvent,
  type CodeChallenge,
  type AccountDeletion,
  type VoiceResult,
  type VoiceLevels,
} from './types';
const invalid = () => {
  throw new Error('Invalid native voice value');
};
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
const boolean = (value: unknown): boolean =>
  typeof value === 'boolean' ? value : invalid();
const integer = (value: unknown): number =>
  Number.isSafeInteger(value) ? (value as number) : invalid();
const seconds = (value: unknown) => {
  const n = integer(value);
  return n >= 0 ? n : invalid();
};
const string = (value: unknown, cap: number): string =>
  typeof value === 'string' && value.length <= cap ? value : invalid();
const member = <T extends string>(value: unknown, choices: readonly T[]): T =>
  choices.includes(value as T) ? (value as T) : invalid();
const nullable = <T>(
  value: unknown,
  decode: (value: unknown) => T,
): T | null => (value === null ? null : decode(value));
export function mapStatus(value: unknown): VoiceStatus {
  const v = object(value);
  return {
    enabled: boolean(v.enabled),
    signedIn: boolean(v.signedIn),
    unlimited: nullable(v.unlimited, boolean),
    totalSeconds: nullable(v.totalSeconds, seconds),
    remainingSeconds: seconds(v.remainingSeconds),
    budgetOpen: nullable(v.budgetOpen, boolean),
    ...(v.accountHeld === undefined
      ? {}
      : { accountHeld: boolean(v.accountHeld) }),
    activeSession: nullable(v.activeSession, (value) => {
      const open = object(value);
      return {
        state: member(open.state, [
          'reserved',
          'connecting',
          'active',
          'unknown',
        ]),
        expiresAt: nullable(open.expiresAt, seconds),
      };
    }),
  };
}
export function mapChallenge(value: unknown): CodeChallenge {
  const v = object(value);
  const challengeId = string(v.challengeId, 43);
  if (!/^[A-Za-z0-9_-]{43}$/.test(challengeId) || v.sent !== true)
    return invalid();
  return { sent: true, challengeId };
}
export function mapDeletion(value: unknown): AccountDeletion {
  const v = object(value);
  if (v.deleted !== true || v.signedOut !== true) return invalid();
  return { deleted: true, signedOut: true };
}
export function mapResult<T>(
  value: unknown,
  decode: (value: unknown) => T,
): VoiceResult<T> {
  try {
    const v = object(value);
    if (v.ok === false) return { ok: false, error: member(v.error, failures) };
    if (v.ok !== true) return invalid();
    return { ok: true, value: decode(v.value) };
  } catch {
    return { ok: false, error: 'invalidResponse' };
  }
}
export function mapEvent(value: unknown): VoiceEvent | null {
  try {
    const v = object(value);
    switch (v.type) {
      case 'state':
        return {
          type: 'state',
          state: member(v.state, callStates),
          reason: nullable(v.reason, (value) => member(value, endReasons)),
        };
      case 'mode':
        return {
          type: 'mode',
          mode: member(v.mode, ['listening', 'speaking', 'muted']),
        };
      case 'playback':
        return {
          type: 'playback',
          playback: member(v.playback, ['flowing', 'buffering', 'truncated']),
        };
      case 'remainingTime':
        return { type: 'remainingTime', seconds: seconds(v.seconds) };
      case 'error':
        return { type: 'error', error: member(v.error, failures) };
      case 'status':
        return { type: 'status', status: nullable(v.status, mapStatus) };
      case 'transcript': {
        if (!Array.isArray(v.turns) || v.turns.length > 80) return invalid();
        return {
          type: 'transcript',
          turns: v.turns.map((turn) => {
            const t = object(turn);
            return {
              role: member(t.role, ['user', 'agent']),
              id: integer(t.id),
              text: string(t.text, 24000),
            };
          }),
        };
      }
      case 'sources': {
        if (!Array.isArray(v.sources) || v.sources.length > 12)
          return invalid();
        return {
          type: 'sources',
          sources: v.sources.map((source) => {
            const s = object(source);
            const path = string(s.path, 1800);
            if (
              !/^\/(?:doc\/[^/?#]+|bill\/[^/?#]+|subject\/(?:person|party|supplier|donor|recipient|topic|campaigner|agency)\/[^/?#]+|money(?:\/(?:contracts|grants|donations|receipts|expenses|interests))?|declared|search|connections|topics|parties|reports(?:\/[^/?#]+)?|journey\/[^/?#]+)\/?(?:[?#].*)?$/.test(
                path,
              ) ||
              /%[01][0-9a-f]|%7f/i.test(path)
            )
              return invalid();
            return { title: string(s.title, 440), path };
          }),
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Two finite levels in [0, 1]; anything else is dropped. */
export function mapLevels(value: unknown): VoiceLevels | null {
  try {
    const v = object(value);
    const level = (n: unknown) =>
      typeof n === 'number' && n >= 0 && n <= 1 ? n : invalid();
    return { input: level(v.input), output: level(v.output) };
  } catch {
    return null;
  }
}

export function mapSnapshot(value: unknown): VoiceSnapshot {
  const v = object(value);
  const transcript = mapEvent({ type: 'transcript', turns: v.transcript });
  const sources = mapEvent({ type: 'sources', sources: v.sources });
  if (transcript?.type !== 'transcript' || sources?.type !== 'sources')
    return invalid();
  return {
    state: member(v.state, callStates),
    reason: nullable(v.reason, (value) => member(value, endReasons)),
    mode: nullable(v.mode, (value) =>
      member(value, ['listening', 'speaking', 'muted']),
    ),
    playback: member(v.playback, ['flowing', 'buffering', 'truncated']),
    remaining: seconds(v.remaining),
    transcript: transcript.turns,
    sources: sources.sources,
    status: nullable(v.status, mapStatus),
  };
}
