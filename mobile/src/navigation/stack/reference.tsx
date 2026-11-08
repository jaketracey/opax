import { screen } from './screen';
import { closeSheetItem, headerItems } from '../chrome';
export function referenceScreens() {
  return [
    screen('about', 'About OPAX', {}, false, true),
    screen('coverage', 'Coverage', {}, false, true),
    screen('methods', 'Methods', {}, false, true),
    screen('sources', 'Sources and licences', {}, false, true),
    screen('sources/datasets', 'Datasets', {}, false, true),
    screen('sources/dataset/[id]', 'Dataset', {}, false, true),
    screen('sources/portraits', 'Portraits', {}, false, true),
    screen('sources/photos', 'Time machine photographs', {}, false, true),
    screen('sources/fonts', 'Fonts', {}, false, true),
  ];
}
export function licenceScreens() {
  return [
    screen(
      '[id]',
      'Licence',
      headerItems(() => [closeSheetItem()]),
    ),
    screen(
      'sources/[...path]',
      'Sources and licences',
      headerItems(() => [closeSheetItem()]),
    ),
  ];
}
export function legacyReferenceScreens() {
  return [screen('stats', 'Coverage'), screen('methods', 'Methods')];
}
