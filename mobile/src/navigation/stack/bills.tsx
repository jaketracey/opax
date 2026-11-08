import { screen, sheetOptions, tabRootScreen } from './screen';

export function billsScreens(segment = '', signedIn = false) {
  return [
    ...tabRootScreen(segment, '(bills)', 'bills', 'Bills', signedIn),
    screen('bill/[key]', 'Bill'),
    screen('bill-list', 'Bills'),
    screen('division-history', 'Votes in parliament'),
  ];
}
export function legacyBillFilterScreens(segment: string) {
  return segment === '(bills)'
    ? [screen('bill-filters', 'Filters', sheetOptions)]
    : [];
}
