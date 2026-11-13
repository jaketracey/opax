import { track } from '../../analytics';
import { TALK_DURATION_CAP_S } from '../../analytics/events';
import type {
  CallState,
  EndReason,
  VoiceFailure,
  VoiceStatus,
} from '../../voice/types';

/**
 * Talk's `opax_talk` events (docs/ANALYTICS.md): the consent sheet, then each
 * call a Start begins. Only fixed words, the signed-in state and a capped
 * call length in whole seconds are sent; never audio, captions, sources,
 * remaining minutes or an account ID.
 */
type Account = 'signed_in' | 'signed_out';
export type TalkEndReason = 'user' | 'limit' | 'network' | 'error';

let account: Account | undefined;
/** The account state of the last voice status read; unknown while none is. */
export function noteTalkAccount(status: VoiceStatus | null) {
  account = status ? (status.signedIn ? 'signed_in' : 'signed_out') : undefined;
}

function send(action: string, extra: Record<string, string | number> = {}) {
  track('opax_talk', {
    action,
    ...(account ? { account } : {}),
    ...extra,
  });
}

export function trackTalkConsent(
  action: 'consent_shown' | 'consent_accepted' | 'consent_declined',
) {
  send(action);
}

/**
 * How a call ended, in four words: the reader's side (they ended it, left
 * OPAX, took another call or withdrew consent), a time or allowance limit,
 * a dropped connection, or an error.
 */
export function talkEndReason(reason: EndReason | null): TalkEndReason {
  switch (reason) {
    case 'user':
    case 'background':
    case 'interruption':
    case 'consentWithdrawn':
      return 'user';
    case 'deadline':
    case 'callLimit':
    case 'allowanceExhausted':
    case 'budgetClosed':
      return 'limit';
    case 'network':
    case 'mediaReset':
    case 'provider':
      return 'network';
    default:
      return 'error';
  }
}

/** Why a Start did not connect, in the same four words. */
export function talkFailureReason(error: VoiceFailure): TalkEndReason {
  switch (error) {
    case 'allowanceExhausted':
    case 'budgetClosed':
    case 'capacity':
    case 'rateLimited':
    case 'callOpen':
      return 'limit';
    case 'network':
    case 'timeout':
    case 'invalidResponse':
    case 'cancelled':
    case 'policy':
      return 'network';
    case 'signedOut':
    case 'microphoneDenied':
    case 'consentRequired':
      return 'user';
    default:
      return 'error';
  }
}

/**
 * One Start's lifecycle, reported once: `call_started` when it goes live,
 * then `call_ended` with its length and reason; or `call_failed` if it never
 * went live. Events from a call this screen did not start are ignored.
 */
export class CallMeasure {
  private attempt: { liveAt: number | null; done: boolean } | null = null;
  constructor(private readonly now: () => number = Date.now) {}

  begin() {
    // A live call keeps its own record until it ends.
    if (this.attempt && !this.attempt.done && this.attempt.liveAt !== null)
      return;
    this.attempt = { liveAt: null, done: false };
  }

  state(state: CallState, reason: EndReason | null) {
    const attempt = this.attempt;
    if (!attempt || attempt.done) return;
    if (state === 'live' && attempt.liveAt === null) {
      attempt.liveAt = this.now();
      send('call_started');
      return;
    }
    if (state !== 'ended' && state !== 'failed') return;
    attempt.done = true;
    if (attempt.liveAt === null)
      send('call_failed', {
        end_reason: state === 'failed' ? 'error' : talkEndReason(reason),
      });
    else this.ended(attempt.liveAt, talkEndReason(reason));
  }

  /** A refusal or error before the call went live (a command or an event). */
  refused(error: VoiceFailure) {
    const attempt = this.attempt;
    if (!attempt || attempt.done || attempt.liveAt !== null) return;
    attempt.done = true;
    send('call_failed', { end_reason: talkFailureReason(error) });
  }

  /** Talk closed with the call live: closing Talk ends the call. */
  left() {
    const attempt = this.attempt;
    if (!attempt || attempt.done || attempt.liveAt === null) return;
    attempt.done = true;
    this.ended(attempt.liveAt, 'user');
  }

  private ended(liveAt: number, reason: TalkEndReason) {
    const seconds = Math.max(0, Math.round((this.now() - liveAt) / 1000));
    send('call_ended', {
      duration_s: Math.min(TALK_DURATION_CAP_S, seconds),
      end_reason: reason,
    });
  }
}
