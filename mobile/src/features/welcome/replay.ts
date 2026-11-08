import { router } from 'expo-router';
import { welcomeRoute } from '../../navigation/routes';
/** Shared entry while the welcome content is built in wave 4. */
export function replayWelcome(): void {
  router.push(welcomeRoute());
}
