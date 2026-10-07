import { act } from 'react';
import { Image } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { bills, catalogs, pinned } from './pinned';
import {
  catalogSources,
  decodeRecentInterests,
  recentDeclarationsFor,
  recentBillsFor,
  suggestionProvenanceFor,
} from '../src/api/catalogs';
import { Portrait } from '../src/design/primitives';
import { FeedRow } from '../src/features/declarations/FeedRow';
import { originalLabel } from '../src/features/today/DeclarationRow';
import { formatDate } from '../src/design/format';
jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn(async () => null) },
}));

jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
const recent = decodeRecentInterests(pinned('/interests/recent.json'));
const items = recentDeclarationsFor(recent, 300, catalogs).data!;
const rowLabel = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root.find(
    (n) =>
      typeof n.type !== 'string' && n.props.testID === 'declaration-person-0',
  ).props.accessibilityLabel as string;
const render = (item: (typeof items)[number]) => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<FeedRow item={item} index={0} />);
  });
  return renderer;
};
test('the feed names the actual category, change, party, chamber and date in its whole row', () => {
  const item = items[0]!;
  expect(item).toMatchObject({
    name: 'Susan McDonald',
    party: 'LNP',
    category: 'Sponsored travel or hospitality',
  });
  const renderer = render(item);
  const label = rowLabel(renderer);
  expect(label.startsWith(item.name)).toBe(true);
  expect(label).toContain('LNP');
  expect(label).toContain('Senate');
  expect(label).toContain(
    `Sponsored travel or hospitality, added ${formatDate(item.date)}`,
  );
  // No source row: the register page is a "View original" action.
  expect(JSON.stringify(renderer.toJSON())).not.toContain('Register of');
  expect(originalLabel(item)).toContain('Register of Senators’ Interests');
  act(() => renderer.unmount());
});
test('all 176 pinned House declarations name the Members register', () => {
  const house = items.filter((item) => item.chamber === 'house');
  expect(house).toHaveLength(176);
  expect(
    house.every(
      (item) => item.sourceLabel === 'Register of Members’ Interests',
    ),
  ).toBe(true);
  expect(originalLabel(house[0]!)).toContain('Register of Members’ Interests');
});
test('unresolved local portrait bytes keep the blank fallback', () => {
  for (const item of items.slice(0, 6)) {
    const renderer = render(item);
    expect(renderer.root.findAllByType(Image)).toHaveLength(0);
    expect(renderer.root.findAllByType(Portrait)).toHaveLength(1);
    act(() => renderer.unmount());
  }
});
test('conflicting roster observations never choose an invented party', () => {
  const item = recent.items[0]!;
  const row = catalogs.roster.people.find((r) => r.pid === item.person_id)!;
  const conflict = {
    ...catalogs,
    roster: {
      ...catalogs.roster,
      people: [
        { ...row, name: 'First Example' },
        { ...row, name: 'Second Example' },
      ],
    },
  };
  expect(
    recentDeclarationsFor({ ...recent, items: [item] }, 1, conflict).data![0]!
      .party,
  ).toBeUndefined();
});
test('suggestion and bill selectors cite the shared source object', () => {
  const sources = suggestionProvenanceFor({
    people: null,
    electorates: null,
    bills: bills.generated_at,
  });
  expect(Object.values(sources).map((source) => source.status)).toEqual([
    'ready',
    'ready',
    'ready',
  ]);
  expect(sources.bills.asAt).toBe(bills.generated_at);
  expect(sources.people.sources[0]).toBe(catalogSources.people);
  expect(sources.electorates.sources[0]).toBe(catalogSources.electorates);
  expect(sources.bills.sources[0]).toBe(recentBillsFor(bills).sources[0]);
});

test('missing Today identities leave the party line absent, including the pinned misspelling', () => {
  expect(
    recentDeclarationsFor(recent, 300).data!.every(
      (item) => item.party === undefined,
    ),
  ).toBe(true);
  const missing = items.filter((item) => item.name === 'Alison Brynes');
  expect(missing).toHaveLength(5);
  expect(missing.every((item) => item.party === undefined)).toBe(true);
  const renderer = render(missing[0]!);
  expect(rowLabel(renderer).startsWith('Alison Brynes, ')).toBe(true);
  expect(rowLabel(renderer)).not.toMatch(/Labor|Liberal|LNP|Greens/);
  act(() => renderer.unmount());
});
