import { screen, tabRootScreen } from './screen';

export function searchScreens(segment = '', signedIn = false) {
  return [
    ...tabRootScreen(segment, '(search)', 'search', 'Search', signedIn),
    screen('results/[kind]', 'Results'),
    screen('topics', 'Topics'),
    screen('topic/[slug]', 'Topic'),
  ];
}
