import { router } from 'expo-router';

/**
 * Where a finished sign-in returns (specs/account.md 1.5): Account (the
 * default), Talk (signed in from Talk's own sheet) or wherever the Account
 * sheet was opened from (`dismiss`, Ask's conversations row).
 */
export type SignInReturn = 'account' | 'talk' | 'dismiss';

export function signInReturn(value: unknown, base: 'account' | 'talk') {
  return value === 'account' || value === 'talk' || value === 'dismiss'
    ? value
    : base;
}

/** The code screen and the email screen both leave the stack. */
export function finishSignIn(to: SignInReturn) {
  if (to === 'talk') router.dismissTo('/talk');
  else if (to === 'dismiss') {
    // Back to Account's root, then the sheet itself closes.
    router.dismissAll();
    router.back();
  } else router.dismissTo('/account');
}
