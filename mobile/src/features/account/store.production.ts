import type { VoiceStatus } from '../../voice';
import type { AccountState } from './store';

// The voice-off release has no account: Talk, sign-in and deletion stay out
// (metro.config.js), and so does the account store. Ask reads this instead: a
// settled status with no account held, so it never syncs conversations and
// never offers sign-in.
const noAccount: VoiceStatus = {
  enabled: false,
  signedIn: false,
  unlimited: null,
  totalSeconds: null,
  remainingSeconds: 0,
  activeSession: null,
  budgetOpen: null,
  accountHeld: false,
};
const state: AccountState = {
  status: noAccount,
  error: null,
  checking: false,
  email: null,
  cleared: false,
  notice: null,
};

export const accountSnapshot = (): AccountState => state;
export const useAccount = (): AccountState => state;
