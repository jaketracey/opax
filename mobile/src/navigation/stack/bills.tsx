import { screen, tabRootScreen, untitled } from './screen';

export function billsScreens(segment = '', signedIn = false) {
  return [
    ...tabRootScreen(segment, '(bills)', 'bills', 'Bills', signedIn),
    screen('bill/[key]', 'Bill'),
    screen('bill-list', 'Bills'),
    screen('division-history', 'Votes in parliament', untitled),
  ];
}
