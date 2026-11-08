import { screen, sheetOptions } from './screen';
import { PixelRatio } from 'react-native';
import { isAccessibilityCategory } from '../../design/tokens';
export function filtersScreens() {
  return [
    screen('filters', 'Filters', {
      ...sheetOptions,
      headerShown: false,
      sheetLargestUndimmedDetentIndex: 0,
      sheetExpandsWhenScrolledToEdge: true,
      sheetInitialDetentIndex: isAccessibilityCategory(
        PixelRatio.getFontScale(),
      )
        ? 1
        : 0,
    }),
  ];
}
