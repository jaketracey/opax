import { router } from 'expo-router';

/**
 * Leaves the Talk sheet the way the shared Done does (specs/account.md 1.1):
 * back when there is somewhere to go back to, else Today, so a cold
 * `opax://talk` open is never stranded.
 */
export function leaveTalk() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
