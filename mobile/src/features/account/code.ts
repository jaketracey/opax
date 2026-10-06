// Pure rules for emailed codes (docs/IOS-VOICE.md, "Code sign-in contract").
// Challenges and codes live in component state only: never persisted, logged
// or sent anywhere but the bridge.

/** A proof expires 15 minutes after the Worker creates it. */
export const CODE_LIFETIME_SECONDS = 15 * 60;
/** The Worker compares at most five codes per challenge. */
export const CODE_ATTEMPTS = 5;
/** A client courtesy before "Send a new code"; the Worker has its own limits. */
export const RESEND_COOLDOWN_SECONDS = 60;
export const CODE_LENGTH = 8;

export type Challenge = {
  id: string;
  /** Device time the code was sent, in milliseconds. */
  sentAt: number;
  /** Codes this device has submitted against the challenge. */
  attempts: number;
};

/**
 * Digits only, at most eight. A pasted "0123 4567" or "Code: 0123-4567"
 * becomes "01234567".
 */
export function codeDigits(text: string): string {
  return text.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

/** The Worker's own address check (portal/src/community-auth.ts). */
export function isEmailAddress(text: string): boolean {
  const email = text.trim();
  return (
    email.length >= 3 &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

/**
 * Whether a code can still be tried. The device sends after the Worker
 * creates the proof, so the local clock never expires a code early. Trying a
 * dead code would still count against the address's daily attempts.
 */
export function codeGate(
  challenge: Challenge,
  now: number,
): 'open' | 'expired' | 'spent' {
  if (now - challenge.sentAt >= CODE_LIFETIME_SECONDS * 1000) return 'expired';
  if (challenge.attempts >= CODE_ATTEMPTS) return 'spent';
  return 'open';
}

/** Whole seconds until "Send a new code" is available; 0 when it is. */
export function resendWait(challenge: Challenge | null, now: number): number {
  if (!challenge) return 0;
  const left = RESEND_COOLDOWN_SECONDS * 1000 - (now - challenge.sentAt);
  return left > 0 ? Math.ceil(left / 1000) : 0;
}
