import { formatClock } from '../../design/format';
import type { VoiceFailure } from '../../voice';

// Account copy (docs/IOS-UX.md sections 4.9, 4.11 and 4.12). Development and
// e2e builds only: production resolves entry.production.ts, so none of it
// ships until voice does.
export const accountCopy = {
  checking: 'Checking your account…',
  signedOut: 'Not signed in. An account is only needed to talk to OPAX.',
  signInForVoice: 'Sign in for voice',
  signedInAs: (email: string) => `Signed in as ${email}`,
  signedInHere: 'Signed in on this iPhone',
  voiceTime: (seconds: number) =>
    `Voice time: ${formatClock(seconds)} remaining`,
  unlimited: 'Unlimited voice access · up to 10 minutes per call',
  voiceOff: 'Voice is taking a break. You can still search the public records.',
  unavailableAccount:
    'This account is unavailable. You can still delete it, or sign out of this iPhone.',
  statusFailed: 'We could not check your account.',
  signOut: 'Sign out of this iPhone',
  signedOutNotice: 'Signed out of this iPhone.',
  signedOutLocally:
    'Signed out of this iPhone. OPAX could not be reached to end the session on its server. It expires within 30 days.',
  deleteAccount: 'Delete account',
  sharedAccount: 'Your OPAX community account is also used on opax.com.au.',

  signInIntro:
    'An OPAX account lets you talk to OPAX. The rest of the app works without one.',
  sameAccount:
    'It is the same account as the OPAX community on opax.com.au. Signing in creates an account if you do not have one.',
  email: 'Email',
  sendCode: 'Send code',
  privacy: 'Privacy policy',
  enterCode: 'Enter the code',
  codeSent: (email: string) =>
    `We sent a code to ${email}. It expires in 15 minutes.`,
  newCodeSent: (email: string) => `We sent a new code to ${email}.`,
  emailLink:
    'The email also has a link. It signs you in on the website, not in this app.',
  code: '8-digit code',
  signIn: 'Sign in',
  sendNewCode: 'Send a new code',
  resendIn: (seconds: number) =>
    `You can send a new code in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`,
  differentEmail: 'Use a different email',

  deleteHeading: 'Delete your OPAX account',
  deleteIntro:
    'Your OPAX community account is also used on opax.com.au. Deleting it here deletes it there too.',
  deletedHeading: 'What is deleted',
  // Decision 5 (IOS-APP section 11) and IOS-UX 4.12.
  deleted: [
    'Your account and its personal data, including your email address.',
    'Your own discussions and replies on opax.com.au, with your reading lists, saved chats and messages.',
    'Your sign-in sessions on every device.',
  ],
  keptHeading: 'What is not deleted',
  kept: [
    'Other members’ replies under a discussion you started. The discussion stays as a stub with no personal data. Other members also keep their own messages.',
    'Your voice usage, kept without a link to you, because the shared monthly voice limit depends on it. Each record keeps the voice provider’s reference to its conversation until OPAX’s housekeeping removes it, a day after the call is recorded as closed. A call cut off by a failure is recorded as closed shortly after its time limit.',
    'Voice time is not refunded. Deleting the account does not give back time already used.',
    'The public parliamentary record.',
  ],
  deleteConfirmNote:
    'To confirm, we will email a deletion code to the address on your account.',
  cancel: 'Cancel',
  enterDeletionCode: 'Enter the deletion code',
  deletionCodeSent:
    'We sent a deletion code to the address on your account. It expires in 15 minutes.',
  newDeletionCodeSent: 'We sent a new deletion code.',
  deletionCode: '8-digit deletion code',
  sendNewDeletionCode: 'Send a new deletion code',
  accountDeleted: 'Account deleted',
  accountDeletedDetail:
    'Your OPAX account, its personal data and your own discussions and replies have been deleted. This iPhone is signed out. Everything public in the app keeps working.',
  done: 'Done',
} as const;

export const refusalCopy = {
  invalidEmail: 'Enter a valid email address.',
  codeIncomplete: 'Enter all 8 digits of the code.',
  codeFailed: 'That code did not work. Check it, or send a new code.',
  codeExpired: 'That code has expired. Send a new code.',
  codeSpent: 'That code can no longer be used. Send a new code.',
  deletionCodeFailed:
    'That code did not work. Check it, or send a new deletion code.',
  deletionCodeExpired: 'That code has expired. Send a new deletion code.',
  deletionCodeSpent:
    'That code can no longer be used. Send a new deletion code.',
  tooManyCodes: 'Too many codes requested. Try again later.',
  tooManyAttempts: 'Too many attempts. Try again later.',
  network: 'OPAX could not be reached. Check your connection and try again.',
  emailNotSent: 'We could not send the code. Please try again shortly.',
  signInUnavailable:
    'Sign-in is not available right now. Please try again shortly.',
  deletionUnavailable:
    'Deletion is not available right now. Please try again shortly.',
  signedOut: 'You are signed out. Sign in again to delete your account.',
  generic: 'That did not work. Please try again.',
} as const;

const offline: readonly VoiceFailure[] = ['network', 'timeout'];

/** The one sentence for a refused code request ("Send code", "Send a new code"). */
export function requestRefusal(error: VoiceFailure): string {
  if (offline.includes(error)) return refusalCopy.network;
  if (error === 'rateLimited') return refusalCopy.tooManyCodes;
  if (error === 'unavailable') return refusalCopy.emailNotSent;
  // The Worker answers a malformed address with 400.
  if (error === 'invalidResponse') return refusalCopy.invalidEmail;
  return refusalCopy.generic;
}

/**
 * The one sentence for a refused sign-in code. Wrong, expired, used,
 * superseded and locked codes share one Worker answer (400), by contract.
 */
export function consumeRefusal(error: VoiceFailure): string {
  if (offline.includes(error)) return refusalCopy.network;
  if (error === 'rateLimited') return refusalCopy.tooManyAttempts;
  if (error === 'unavailable') return refusalCopy.signInUnavailable;
  if (error === 'invalidResponse' || error === 'signedOut')
    return refusalCopy.codeFailed;
  return refusalCopy.generic;
}

/** Requesting a deletion code or deleting the account. */
export function deletionRefusal(error: VoiceFailure): string {
  if (offline.includes(error)) return refusalCopy.network;
  if (error === 'deletionVerificationFailed')
    return refusalCopy.deletionCodeFailed;
  if (error === 'signedOut' || error === 'forbidden')
    return refusalCopy.signedOut;
  if (error === 'rateLimited') return refusalCopy.tooManyCodes;
  if (error === 'unavailable') return refusalCopy.deletionUnavailable;
  return refusalCopy.generic;
}
