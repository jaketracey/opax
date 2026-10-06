import { useEffect, useState } from 'react';
import { codeGate, resendWait, type Challenge } from './code';

/**
 * One emailed code's transient state: the challenge, how many codes this
 * device has tried against it and the resend cooldown. React state only, so
 * the challenge is gone when the screen closes.
 */
export function useCodeChallenge() {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const wait = resendWait(challenge, now);
  // Tick only while the cooldown shows; expiry is checked at submission.
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [wait, now]);
  return {
    challenge,
    /** Seconds until a new code can be requested. */
    wait,
    issued(id: string) {
      const sentAt = Date.now();
      setNow(sentAt);
      setChallenge({ id, sentAt, attempts: 0 });
    },
    /** Before a submission: whether this code can still be tried. */
    gate() {
      return challenge ? codeGate(challenge, Date.now()) : 'expired';
    },
    tried() {
      setChallenge((value) =>
        value ? { ...value, attempts: value.attempts + 1 } : value,
      );
    },
    clear() {
      setChallenge(null);
    },
  };
}
