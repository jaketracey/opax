import { screen, untitled } from './screen';
import { colors } from '../../design/tokens';
import { designFlags } from '../../design/flags';
import { scrollBar } from '../chrome';

export function editionScreens() {
  const ground = designFlags.groupedSurfaces ? colors.sunken : colors.paper;
  return [
    screen('edition', 'Daily edition', {
      ...untitled,
      ...scrollBar(ground),
      // Extend this route's own ground under the bar, including overscroll.
      // Stopping below an opaque bar let the edge sample Today underneath.
      contentStyle: { backgroundColor: ground },
    }),
  ];
}
