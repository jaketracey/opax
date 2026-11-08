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
