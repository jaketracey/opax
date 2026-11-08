import { screen, sheetOptions, tabRootScreen } from './screen';

export function yourMpScreens(segment = '', signedIn = false) {
  return [
    ...tabRootScreen(segment, '(your-mp)', 'your-mp', 'Your MP', signedIn),
    screen('electorate/[id]', 'Electorate'),
    screen('members', 'Members'),
    screen('election', 'Election'),
    screen('electorate-date', 'Date', sheetOptions),
    screen('follows', 'Following'),
  ];
}
