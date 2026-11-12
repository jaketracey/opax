import type { NativeStackHeaderItem } from 'expo-router';
import { openOnOpaxItem, pageItems, pageMenu } from '../src/navigation/chrome';
import { pageActions } from '../src/features/people/PageActions';
import { recordBarItems } from '../src/features/records/RecordActions';
import { exploreWebPath } from '../src/navigation/routes/explore';
import { expectPublicSiteAction } from './more-menu-web';

jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('../src/features/records/runtime', () => ({ records: {} }));

const personPath = '/subject/person/anne-example';
const cases: [string, () => NativeStackHeaderItem | undefined, string][] = [
  [
    'More with no page destination',
    () => pageMenu({ name: 'Following', items: [] }),
    '/',
  ],
  [
    'shared page bars',
    () =>
      pageItems({ name: 'Public money', menu: [] })().find(
        (item) => item.type === 'menu',
      ),
    '/',
  ],
  [
    'Your MP',
    () => pageMenu({ name: 'Anne Example', webPath: personPath, items: [] }),
    personPath,
  ],
  [
    'subject actions',
    () =>
      pageItems({
        name: 'Anne Example',
        menu: pageActions({
          kind: 'person',
          name: 'Anne Example',
          webPath: personPath,
        }),
      })().find((item) => item.type === 'menu'),
    personPath,
  ],
  [
    'record actions',
    () => recordBarItems({ slug: 'speech-123', title: 'A speech' })()[0],
    '/doc/speech-123',
  ],
];

test.each(cases)(
  '%s ends with a public-site action accepted by webPageUrl',
  (_name, build, path) => {
    const menu = build();
    if (menu?.type !== 'menu') throw new Error('Expected a More menu');
    expectPublicSiteAction(menu.menu.items, path);
  },
);

test('the photo menu public-site action accepts the current Time machine year', () => {
  const path = exploreWebPath('tm', { year: '2025' });
  expectPublicSiteAction([openOnOpaxItem(path, 'Time machine')], path);
});
