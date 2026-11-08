import { screen, sheetOptions } from './screen';
export function sheetsScreens() {
  return [
    screen('source', 'Sources', sheetOptions),
    screen('machine-note', 'Machine-written', {
      ...sheetOptions,
      sheetAllowedDetents: 'fitToContents',
    }),
    screen('citation', 'Citation', sheetOptions),
    screen('rule', 'How this is chosen', {
      ...sheetOptions,
      sheetAllowedDetents: 'fitToContents',
    }),
    screen('licences', 'Sources and licences', sheetOptions),
  ];
}
