import { Platform } from 'react-native';
import { AndroidReadingHeader } from '../AndroidReadingHeader';
import { screen, screenInStack } from './screen';

const android =
  Platform.OS === 'android' ? { header: AndroidReadingHeader } : {};

/**
 * The Account stack's reference pages. Each is the sheet's root when opened
 * from content (a source sheet, a topic page, `opax://methods`) and then has
 * Done; pushed from Account or About, it has Back. Titles here name the
 * Back button of the screen pushed next; the pages set their bar titles by
 * scroll.
 */
export function referenceScreens() {
  const screen = screenInStack('Account');
  return [
    screen('about', 'About OPAX', android, false, true),
    screen('coverage', 'Coverage', android, false, true),
    screen('stats', 'Coverage', android, false, true),
    screen('methods', 'Methods', android, false, true),
    screen('sources/index', 'Sources and licences', android, false, true),
    screen('sources/datasets', 'Datasets', android, false, true),
    screen('sources/dataset/[id]', 'Dataset', android, false, true),
    screen('sources/portraits', 'Portraits', android, false, true),
    screen('sources/photos', 'Time machine photographs', android, false, true),
    screen('sources/fonts', 'Fonts', android, false, true),
  ];
}

/**
 * The Licence sheet (account.md 4.4): a dataset at the root with Done and no
 * Back; Sources and licences and its lists push beneath it.
 */
export function licenceScreens() {
  const screen = screenInStack('Dataset');
  return [
    screen('[id]', 'Dataset', android, false, true),
    screen('sources/index', 'Sources and licences', android, false, true),
    screen('sources/[...path]', 'Sources and licences', android, false, true),
  ];
}

/** `/stats` and `/methods` in a tab stack redirect into the Account stack. */
export function referenceSharedScreens() {
  return [screen('stats', 'Coverage'), screen('methods', 'Methods')];
}
