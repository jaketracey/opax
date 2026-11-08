import { router } from 'expo-router';
import { welcomeRoute } from '../../navigation/routes';
/**
 * Replays the full welcome from Account (`account-replay-tour`). It slides
 * up as any modal does; its seat step shows the saved seat with a checkmark
 * and "Done", and a replay never clears a saved seat. Callers inside a sheet
 * (Account) close it first, then call this (specs/account.md 2.7).
 */
export function replayWelcome(): void {
  router.push(welcomeRoute());
}
