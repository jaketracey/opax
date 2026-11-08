import { screen, sheetOptions } from './screen';

export function recordsScreens() {
  return [
    // The bar stays empty until the title scrolls under it; the stack's
    // title remains the back label for the next screen.
    screen('doc/[slug]', 'Record', { headerTitle: '' }),
    // A route sheet that holds still at its medium detent while the
    // citation's length changes with the style (records.md 3.2).
    screen('doc-cite/[slug]', 'Citation formats', sheetOptions),
    screen('bill-text/[key]', 'Bill text', { headerTitle: '' }),
    screen('recent-records', 'Just added'),
    screen('record-list', 'Records'),
    screen('bill-text-contents/[key]', 'Contents', sheetOptions),
  ];
}
