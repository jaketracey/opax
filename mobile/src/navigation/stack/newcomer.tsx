import { minuteCopy } from '../../features/newcomer/copy';
import { screen } from './screen';

/** The newcomer build's ordinary pages, shared by every tab's stack. */
export function newcomerScreens() {
  return [screen('learn/minute', minuteCopy.title)];
}
