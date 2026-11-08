import { screen, sheetOptions } from './screen';

export function recordsScreens() {
  return [
    screen('doc/[slug]', 'Record'),
    screen('doc-cite/[slug]', 'Citation formats', sheetOptions),
    screen('bill-text/[key]', 'Bill text'),
    screen('recent-records', 'Just added'),
    screen('record-list', 'Records'),
    screen('bill-text-contents/[key]', 'Contents', sheetOptions),
  ];
}
