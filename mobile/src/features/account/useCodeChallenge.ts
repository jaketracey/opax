import { useEffect, useState } from 'react';
import { codeGate, resendWait, type Challenge } from './code';

// The challenges this app session issued, by id: memory only, never
// persisted, logged or sent anywhere but the bridge. The id travels to the
// code step as a route param, so the resend timer survives the push.
const issued = new Map<string, Challenge>();

/** Records a challenge the Worker has just issued; returns its id. */
export function issueChallenge(id: string): string {
  issued.set(id, { id, sentAt: Date.now(), attempts: 0 });
  return id;
}

/** VoiceOver hears the countdown in 10-second steps, never every second. */
export const spokenWait = (seconds: number) =>
  seconds > 0 ? Math.max(10, Math.floor(seconds / 10) * 10) : 0;

/**
 * One emailed code's transient state, keyed by challenge id: how many codes
 * this device has tried against it and the resend cooldown.
 */
export function useCodeChallenge(initialId: string | null = null) {
  const [id, setId] = useState<string | null>(initialId);
  const [challenge, setChallenge] = useState<Challenge | null>(() =>
    initialId ? (issued.get(initialId) ?? null) : null,
  );
  const [now, setNow] = useState(() => Date.now());
  const wait = resendWait(challenge, now);
  // Tick only while the cooldown shows; expiry is checked at submission.
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [wait, now]);
  return {
    id,
    challenge,
    /** Seconds until a new code can be requested; the visible label. */
    wait,
    /** The same, in the 10-second steps VoiceOver hears. */
    spokenWait: spokenWait(wait),
    issued(next: string) {
      issueChallenge(next);
      setNow(Date.now());
      setId(next);
      setChallenge(issued.get(next)!);
    },
    /** Before a submission: whether this code can still be tried. */
    gate() {
      return challenge ? codeGate(challenge, Date.now()) : 'expired';
    },
    tried() {
      setChallenge((value) => {
        if (!value) return value;
        const next = { ...value, attempts: value.attempts + 1 };
        issued.set(next.id, next);
        return next;
      });
    },
    clear() {
      if (id) issued.delete(id);
      setChallenge(null);
    },
  };
}

/** Tests only. */
export function resetChallenges() {
  issued.clear();
}
