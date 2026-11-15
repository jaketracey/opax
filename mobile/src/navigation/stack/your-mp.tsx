import { screen, sheetOptions, tabRootScreen, untitled } from './screen';
import { glassBar } from '../chrome';

const electorateOptions = { ...untitled, headerTransparent: glassBar() };

export function yourMpScreens(segment = '', signedIn = false) {
  return [
    ...tabRootScreen(segment, '(your-mp)', 'your-mp', 'Your MP', signedIn),
    screen('electorate/[id]', '', electorateOptions),
    // Their pages name the bar once loaded: the empty title keeps the
    // Duo rail's title band from growing under the page when they do.
    screen('members', '', untitled),
    screen('election', '', untitled),
    screen('electorate-date', 'View on a date', {
      ...sheetOptions,
      // The type takes one value; fitToContents grows to the calendar's height.
      sheetAllowedDetents: 'fitToContents',
      sheetGrabberVisible: true,
    }),
    screen('follows', 'Following'),
  ];
}
