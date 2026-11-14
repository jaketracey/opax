import { formatClock } from '../../design/format';
import { phoneCopy } from '../../design/phone-copy';
import type { VoiceFailure } from '../../voice';

// Account copy (specs/account.md 2.3, 5.5 and 6.6), written as the spec
// prints it: typographic apostrophes, no em dashes, Australian English.
// Android reads "this phone" (phoneCopy).
export const accountCopy = {
  title: 'Account',
  loading: 'Loading your account',

  // Group 1, the identity.
  signIn: 'Sign in',
  signInDetail:
    'Talk to OPAX, and keep your Ask conversations on all your devices.',
  signedInHere: phoneCopy('Signed in on this iPhone'),
  talk: 'Talk to OPAX',
  voiceConsent: 'Voice consent',
  consentGiven: 'Given',
  consentNotGiven: 'Not given',
  paused: 'Paused',
  unlimitedFooter: 'Up to 10 minutes a call.',
  unavailableFooter: 'Voice isn’t available for this account.',
  voiceOffFooter: 'Voice is taking a break. Search and Ask still work.',
  statusFailed: 'Your account couldn’t be checked.',
  statusOffline: 'You’re offline, so your account couldn’t be checked.',

  // Groups 2 and 3.
  signOut: 'Sign out',
  deleteAccount: 'Delete account',

  // Groups 4 to 6.
  ask: 'Ask settings',
  about: 'About OPAX',
  sources: 'Sources and licences',
  methods: 'Methods',
  coverage: 'Coverage by source',
  privacy: 'Privacy policy',
  terms: 'Terms of use',
  support: 'OPAX support',
  correction: 'Report a correction',
  correctionFooter: 'We aim to respond within 2 business days.',
  replayWelcome: 'Replay welcome',
  community: 'Community',
  workbench: 'Design workbench',

  // The page foot.
  version: (version: string, build: string) => `OPAX ${version} (${build})`,
  versionSpoken: (version: string, build: string) =>
    `Version ${version}, build ${build}`,
  copyVersion: 'Copy version',
  copy: 'Copy',

  // Notices (2.4).
  signedOutNotice: phoneCopy('Signed out of this iPhone.'),
  deletedNotice: phoneCopy(
    'Your OPAX account was deleted. This iPhone is signed out.',
  ),
  localChatsError: phoneCopy(
    'Conversations saved on this iPhone couldn’t be cleared.',
  ),

  // The Voice consent page (2.2).
  voicePrivacy: 'Voice privacy',
  withdrawConsent: 'Withdraw consent',
  consentNotGivenFooter: 'Talk asks for this before your next call.',
  withdrawTitle: 'Withdraw voice consent?',
  withdrawMessage: 'Talk will ask again before your next call.',
  withdraw: 'Withdraw',
  consentWithdrawn: 'Voice consent withdrawn',

  // Sign in (5.5).
  signUpToTalk: 'Sign up to talk',
  signUpOrSignIn: 'Sign up or sign in',
  checkEmail: 'Check your email',
  email: 'Email',
  emailFooter:
    'We’ll email you an 8-digit code. If you don’t have an OPAX account, this creates one.',
  // TODO(D-8): the terms’ age is open (specs/account.md 11 item 1). It must
  // equal opax.com.au’s terms and the App Store rating before release.
  ageLimit: 'For people aged 16 and over.',
  sendCode: 'Send code',
  code: '8-digit code',
  codeSent: (email: string) =>
    `Sent to ${email}. It expires in 15 minutes. Use the code here, not the link in the email.`,
  newCodeSent: (email: string) =>
    `We sent a new code to ${email}. It expires in 15 minutes. Use the code here, not the link in the email.`,
  sendNewCode: 'Send a new code',
  sendNewCodeIn: (seconds: number) =>
    `Send a new code in ${formatClock(seconds)}`,
  availableIn: (seconds: number) => `available in ${seconds} seconds`,

  // Delete account (6.6).
  deleteLede:
    'This deletes your OPAX account here and on opax.com.au. It can’t be undone.',
  deletedHeader: 'Deleted',
  deletedRows: [
    'Your email address and account details',
    'Ask conversations saved to your account',
    'Anything you posted on opax.com.au',
    'Your sign-in on every device',
  ],
  keptHeader: 'Kept',
  keptRows: [
    'Voice minutes used, without your name or email',
    'The public record',
  ],
  deletionPolicy: 'How deletion works',
  emailDeletionCode: 'Email me a deletion code',
  deletionCode: 'Deletion code',
  deletionCodeSent:
    'Sent to the address on your account. It expires in 15 minutes.',
  newDeletionCodeSent: 'We sent a new deletion code. It expires in 15 minutes.',
  sendNewDeletionCode: 'Send a new deletion code',
  sendNewDeletionCodeIn: (seconds: number) =>
    `Send a new deletion code in ${formatClock(seconds)}`,
  confirmDeleteTitle: 'Delete your OPAX account?',
  confirmDeleteMessage: 'This can’t be undone.',
  signInAgain: 'Sign in again',
  cancel: 'Cancel',
  opensOnWeb: 'Opens on opax.com.au',
  confirmHint: 'Asks you to confirm',
} as const;

// One sentence each, with no "Try again." appended: where retrying helps the
// screen draws its own control (specs/account.md 5.4 and 6.4).
export const refusalCopy = {
  invalidEmail: 'Enter a valid email address.',
  codeIncomplete: 'Enter all 8 digits of the code.',
  codeFailed: 'That code didn’t work. Check it, or send a new code.',
  deletionCodeFailed:
    'That code didn’t work. Check it, or send a new deletion code.',
  tooManyCodes: 'Too many codes requested. Try again later.',
  tooManyAttempts: 'Too many attempts. Try again later.',
  network:
    'You’re offline, or OPAX couldn’t be reached. Check your connection and try again.',
  emailNotSent: 'The code couldn’t be sent. Try again shortly.',
  signInUnavailable: 'Sign-in isn’t available right now. Try again shortly.',
  deletionUnavailable: 'Deletion isn’t available right now. Try again shortly.',
  // The device's credential store failed: the native core signed this device
  // out, but the Worker was never asked to delete the account.
  deletionSignedOutHere: phoneCopy(
    'This iPhone was signed out, but your account wasn’t deleted. Sign in again to finish.',
  ),
  signedOut: 'You’re signed out. Sign in again to delete your account.',
  generic: 'Something went wrong. Try again shortly.',
} as const;

const offline: readonly VoiceFailure[] = ['network', 'timeout'];
/** Whether a failed status read means no connection (2.5 Offline). */
export const isOfflineFailure = (error: VoiceFailure | null) =>
  error !== null && offline.includes(error);

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
