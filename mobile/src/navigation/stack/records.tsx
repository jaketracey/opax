import { screen, sheetOptions } from './screen';

export function recordsScreens() {
  return [
    // The bar stays empty until the title scrolls under it; the stack's
    // title remains the back label for the next screen.
    screen('doc/[slug]', 'Record', { headerTitle: '' }),
    // Detents stay [0.5, 1]; it opens large per the wave 2 simulator check.
    screen('doc-cite/[slug]', 'Citation formats', {
      ...sheetOptions,
      sheetInitialDetentIndex: 1,
    }),
    screen('bill-text/[key]', 'Bill text', { headerTitle: '' }),
    screen('recent-records', 'Just added'),
    screen('record-list', 'Records'),
    screen('bill-text-contents/[key]', 'Contents', sheetOptions),
  ];
}
