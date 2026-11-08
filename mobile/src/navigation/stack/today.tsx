import { tabRootScreen } from './screen';

export function todayScreens(segment = '', signedIn = false) {
  return [...tabRootScreen(segment, '(today)', 'index', 'Today', signedIn)];
}
