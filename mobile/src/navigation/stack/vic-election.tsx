import { screen, untitled } from './screen';
import { vicCopy } from '../../features/vic-election/copy';
export function vicElectionScreens() {
  return [
    screen('vic-election/index', vicCopy.bar, untitled),
    screen('vic-election/[district]', vicCopy.bar, untitled),
  ];
}
