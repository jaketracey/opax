// Set by the consent sheet's "Agree and start" (specs/account.md 7.7). The
// Talk screen reads it when it is shown again, so the microphone prompt and
// the call start only once the sheet has gone, never over it.
let startAfterConsent = false;

export function requestStartAfterConsent() {
  startAfterConsent = true;
}

/** Whether Agree was chosen since the last read; reading clears it. */
export function takeStartAfterConsent(): boolean {
  const value = startAfterConsent;
  startAfterConsent = false;
  return value;
}

// Set by a sign-in that started from Talk (specs/account.md 1.5 and 5.8):
// once Talk has read the new status and consent, it opens the consent sheet
// if consent is not given yet. It never starts a call itself.
let consentAfterSignIn = false;

export function requestConsentAfterSignIn() {
  consentAfterSignIn = true;
}

/** Whether a Talk sign-in finished since the last read; reading clears it. */
export function takeConsentAfterSignIn(): boolean {
  const value = consentAfterSignIn;
  consentAfterSignIn = false;
  return value;
}
