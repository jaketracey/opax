import { screen, sheetOptions, tabRootScreen } from './screen';

export function yourMpScreens(segment = '', signedIn = false) {
  return [
    ...tabRootScreen(segment, '(your-mp)', 'your-mp', 'Your MP', signedIn),
    screen('electorate/[id]', 'Electorate'),
    screen('members', ''),
    screen('election', ''),
    screen('electorate-date', 'View on a date', {
      ...sheetOptions,
      // The type takes one value; fitToContents grows to the calendar's height.
      sheetAllowedDetents: 'fitToContents',
      sheetGrabberVisible: true,
    }),
    screen('follows', 'Following'),
  ];
}
