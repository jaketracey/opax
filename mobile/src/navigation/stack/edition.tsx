import { screen } from './screen';
import { colors } from '../../design/tokens';
import { designFlags } from '../../design/flags';

export function editionScreens() {
  return [
    screen('edition', 'Daily edition', {
      headerTitle: '',
      contentStyle: {
        backgroundColor: designFlags.groupedSurfaces
          ? colors.sunken
          : colors.paper,
      },
    }),
  ];
}
