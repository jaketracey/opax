import { screen, tabRootScreen, untitled } from './screen';

export function billsScreens(segment = '', signedIn = false) {
  return [
    ...tabRootScreen(segment, '(bills)', 'bills', 'Bills', signedIn),
    screen('bill/[key]', '', untitled),
    screen('bill-list', 'Bills'),
    screen('division-history', 'Votes in parliament', {
      headerTitle: 'Votes in parliament',
      headerTitleAlign: 'center',
    }),
  ];
}
