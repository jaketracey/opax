import { screen, screenInStack, untitled } from './screen';

/**
 * "How Parliament works" (features/learn): pushed in whichever tab the
 * reader is in. Titles name the next screen's Back button.
 */
export function learnScreens() {
  return [
    screen('learn/index', 'How Parliament works'),
    screen('learn/[chapter]', 'How Parliament works', untitled),
    screen('learn/glossary', 'A to Z glossary'),
    // "Parliament in a minute": ad-newcomer-c owns the page.
    screen('learn/minute', 'Parliament in a minute'),
  ];
}

/** Account › Glossary terms: the guide's two switches. */
export function learnAccountScreens() {
  const screen = screenInStack('Account');
  return [screen('terms', 'Glossary terms')];
}
