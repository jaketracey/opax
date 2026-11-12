import { screen, sheetOptions, untitled } from './screen';

export function recordsScreens() {
  return [
    screen('doc/[slug]', '', untitled),
    screen('report/[slug]', '', untitled),
    // Detents stay [0.5, 1]; it opens large per the wave 2 simulator check.
    screen('doc-cite/[slug]', 'Citation formats', {
      ...sheetOptions,
      sheetInitialDetentIndex: 1,
    }),
    screen('bill-text/[key]', '', untitled),
    screen('recent-records', 'Just added', {}, false, true),
    screen('record-list', 'Records', {}, false, true),
    screen('bill-text-contents/[key]', 'Contents', sheetOptions),
  ];
}
