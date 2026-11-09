import { ActionSheetIOS } from 'react-native';
import { haptic } from '../src/design/haptics';
import { confirmAction } from '../src/design/menu';
import {
  menuLeaves,
  menuSections,
  rowAccessibilityActions,
  rowMenus,
  type RowMenuAction,
} from '../src/design/row-link';
import { pageActions } from '../src/features/people/PageActions';
import { copyText } from '../src/features/records/actions';
import {
  recordActions,
  recordBarItems,
} from '../src/features/records/RecordActions';
import { canonicalUrl } from '../src/navigation/external';

jest.mock('../src/design/haptics', () => ({ haptic: jest.fn() }));
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('../src/features/records/runtime', () => ({ records: {} }));
jest.mock('../src/features/records/actions', () => ({
  copyText: jest.fn(async () => true),
}));
const onFollow = jest.fn();
const common = { following: false, onFollow };
const builders = (
  following: boolean,
): Record<keyof typeof rowMenus, RowMenuAction[]> => ({
  person: rowMenus.person({
    name: 'Anne Example',
    slug: 'anne-example',
    ...common,
    following,
  }),
  bill: rowMenus.bill({
    billKey: 'au-federal-example',
    title: 'Example Bill',
    onAsk: jest.fn(),
    ...common,
    following,
  }),
  record: rowMenus.record({ slug: 'speech-123', title: 'A speech' }),
  place: rowMenus.place({
    title: 'Grayndler',
    path: '/subject/electorate/grayndler',
    ...common,
    following,
  }),
  following: rowMenus.following({
    title: 'Anne Example',
    path: '/subject/person/anne-example',
    onUnfollow: jest.fn(),
  }),
  division: rowMenus.division({
    billKey: 'au-federal-example',
    billTitle: 'Example Bill',
    ...common,
    following,
  }),
});

afterEach(() => jest.clearAllMocks());
for (const following of [false, true]) {
  test.each(Object.keys(builders(following)) as (keyof typeof rowMenus)[])(
    '%s has identical menu and accessibility choices, following=' + following,
    (kind) => {
      const items = builders(following)[kind];
      const leaves = menuLeaves(items);
      expect(rowAccessibilityActions(items)).toEqual(
        leaves.map(({ title }) => ({ name: title, label: title })),
      );
      expect(new Set(leaves.map(({ title }) => title)).size).toBe(
        leaves.length,
      );
      const destructive = leaves.filter((item) => item.destructive);
      if (destructive.length) {
        expect(items.at(-1)).toEqual({
          title: '',
          inline: true,
          items: destructive,
        });
        expect(
          menuLeaves(items.slice(0, -1)).every((item) => !item.destructive),
        ).toBe(true);
      }
    },
  );
}
test('nested destructive choices are gathered into one final section', () => {
  const items = menuSections([
    { title: 'Remove', destructive: true, onPress: jest.fn() },
    {
      title: 'Cite',
      items: [
        { title: 'Copy citation', onPress: jest.fn() },
        { title: 'Delete', destructive: true, onPress: jest.fn() },
      ],
    },
  ]);
  expect(items.map((item) => item.title)).toEqual(['Cite', '']);
  expect(menuSections(items)).toEqual(items);
  expect(menuLeaves(items).map((item) => item.title)).toEqual([
    'Copy citation',
    'Remove',
    'Delete',
  ]);
});
test('seat choices appear above Share only when the caller supplies one', () => {
  const setSeat = {
    label: 'Set Grayndler as my electorate',
    onSelect: jest.fn(),
  };
  for (const items of [
    rowMenus.person({ name: 'Anne', slug: 'anne', ...common, setSeat }),
    rowMenus.place({
      title: 'Grayndler',
      path: '/subject/electorate/grayndler',
      ...common,
      setSeat,
    }),
  ]) {
    const leaves = menuLeaves(items);
    expect(leaves.map((item) => item.title).slice(0, 3)).toEqual([
      'Follow',
      setSeat.label,
      'Share',
    ]);
    leaves[1]!.onPress();
  }
  expect(setSeat.onSelect).toHaveBeenCalledTimes(2);
  expect(
    menuLeaves(builders(false).person).map((item) => item.title),
  ).not.toContain(setSeat.label);
});
test('division menus follow the bill and use its canonical link', () => {
  expect(
    menuLeaves(builders(false).division).map((item) => item.title),
  ).toEqual(['Follow bill', 'Copy link', 'Share']);
  expect(menuLeaves(builders(true).division).map((item) => item.title)).toEqual(
    ['Unfollow bill', 'Copy link', 'Share'],
  );
});
test('Follow and successful Copy link confirm with the success haptic', async () => {
  const leaves = menuLeaves(builders(false).person);
  leaves[0]!.onPress();
  expect(onFollow).toHaveBeenCalledTimes(1);
  expect(haptic).toHaveBeenLastCalledWith('success');
  jest.mocked(haptic).mockClear();
  leaves.find((item) => item.title === 'Copy link')!.onPress();
  await Promise.resolve();
  expect(copyText).toHaveBeenCalledWith(
    canonicalUrl('/subject/person/anne-example'),
  );
  expect(haptic).toHaveBeenCalledWith('success');
  jest.mocked(haptic).mockClear();
  jest.mocked(copyText).mockResolvedValueOnce(false);
  leaves.find((item) => item.title === 'Copy link')!.onPress();
  await Promise.resolve();
  expect(haptic).not.toHaveBeenCalled();
});
test('confirmation marks destructive choices and always adds Cancel', () => {
  const sheet = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => undefined);
  confirmAction('Remove follow?', [
    { title: 'Unfollow', destructive: true, onPress: jest.fn() },
  ]);
  expect(sheet.mock.calls[0]![0]).toMatchObject({
    options: ['Unfollow', 'Cancel'],
    cancelButtonIndex: 1,
    destructiveButtonIndex: [0],
  });
  sheet.mockRestore();
});

test('page bar actions keep Ask, Copy link and Open on web without a second Follow or Share', () => {
  const actions = pageActions({
    kind: 'person',
    name: 'Anne',
    webPath: '/subject/person/anne',
    onAsk: jest.fn(),
  });
  expect(menuLeaves(actions).map((action) => action.title)).toEqual([
    'Ask about Anne',
    'Copy link',
    'Open on opax.com.au',
  ]);
});
test('record bar actions expose Cite in an inline section and remove the in-content menu', () => {
  const target = { slug: 'speech-123', title: 'A speech' };
  const actions = recordActions(target);
  expect(actions[0]).toMatchObject({ title: 'Cite', inline: true });
  expect(menuLeaves(actions).map((action) => action.title)).toEqual([
    'Copy APA 7',
    'Copy AGLC',
    'Copy BibTeX',
    'Copy RIS',
    'Citation formats…',
    'Copy link',
    'Open on opax.com.au',
  ]);
  expect(recordBarItems(target)()[0]).toMatchObject({
    type: 'menu',
    label: 'More',
  });
  expect(recordActions({ slug: '../bad', title: 'A speech' })).toEqual([]);
});

for (const following of [false, true]) {
  test.each(['person', 'bill', 'place', 'division'] as const)(
    '%s keeps Follow or Unfollow first, following=' + following,
    (kind) => {
      const leaves = menuLeaves(builders(following)[kind]);
      expect(leaves.map((item) => item.title)).toEqual([
        `${following ? 'Unfollow' : 'Follow'}${kind === 'division' ? ' bill' : ''}`,
        ...(kind === 'division'
          ? ['Copy link', 'Share']
          : ['Share', 'Copy link']),
        ...(kind === 'bill'
          ? ['Ask about this bill']
          : kind === 'division'
            ? []
            : ['Open on opax.com.au']),
      ]);
      expect(leaves.every((item) => !item.destructive)).toBe(true);
      leaves[0]!.onPress();
      expect(onFollow).toHaveBeenCalledTimes(1);
      if (following) expect(haptic).not.toHaveBeenCalled();
      else expect(haptic).toHaveBeenCalledWith('success');
    },
  );
}
test.each([
  ['person', 'Anne', 'Ask about Anne'],
  ['party', 'Labor', 'Ask about Labor'],
  ['electorate', 'Grayndler', 'Ask about Grayndler'],
] as const)('page Ask title for %s', (kind, name, title) => {
  expect(
    pageActions({ kind, name, webPath: '/', onAsk: jest.fn() })[0]!.title,
  ).toBe(title);
});
