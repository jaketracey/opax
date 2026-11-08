import { screen, sheetOptions } from './screen';
export function filtersScreens() {
  return [
    screen('filters/bills', 'Filters', { ...sheetOptions, headerShown: false }),
    screen('filters/divisions', 'Filters', {
      ...sheetOptions,
      headerShown: false,
    }),
    screen('filters/directory', 'Filters', {
      ...sheetOptions,
      headerShown: false,
    }),
    screen('filters/declarations', 'Filters', {
      ...sheetOptions,
      headerShown: false,
    }),
    screen('filters/connections', 'Filters', {
      ...sheetOptions,
      headerShown: false,
    }),
    screen('filters/search', 'Filters', {
      ...sheetOptions,
      headerShown: false,
    }),
    screen('filters/money', 'Filters', { ...sheetOptions, headerShown: false }),
    screen('filters/allocation', 'Filters', {
      ...sheetOptions,
      headerShown: false,
    }),
  ];
}
