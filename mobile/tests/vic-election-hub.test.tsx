import { act } from 'react';
import { SectionList } from 'react-native';
import { mockVic, renderVic, resetVic, words } from './vic-election-render';
import { ContentUnavailable } from '../src/design/states';
import Hub from '../src/features/vic-election/Hub';
import { Finder } from '../src/features/vic-election/Finder';
import { ElectionUnavailable } from '../src/features/vic-election/reads';
import { decodeFind } from '../src/features/vic-election/decoders';
import finder from '../scripts/fixtures/vic-election/find-st-kilda.json';
import postcode from '../scripts/fixtures/vic-election/find-3350.json';
import missingPostcode from '../scripts/fixtures/vic-election/find-9999.json';
import memberFind from '../scripts/fixtures/vic-election/find-allan.json';
import districtFind from '../scripts/fixtures/vic-election/find-bass.json';
beforeEach(resetVic);
test('Ahead puts status before dates, districts, regions and authorised foot', () => {
  const r = renderVic(<Hub />);
  const text = words(r);
  for (const id of [
    'vic-election-status',
    'vic-election-dates',
    'vic-election-sources',
    'vic-election-date-early',
  ])
    expect(r.root.findAllByProps({ testID: id }).length).toBeGreaterThan(0);
  expect(text).toContain('Key dates');
  expect(text).toContain(
    `Lower house: ${mockVic.overview.record!.data.districts.length} districts`,
  );
  expect(text.indexOf('Key dates')).toBeLessThan(text.indexOf('Lower house:'));
  // The full 88-row pin virtualises the region section offscreen.
  const sections = r.root.findByType(SectionList).props.sections;
  expect(sections.map((section: { title: string }) => section.title)).toEqual([
    'Lower house: 88 districts',
    'Upper house: 8 regions',
  ]);
  expect(
    sections.map((section: { data: unknown[] }) => section.data.length),
  ).toEqual([88, 8]);
  expect(r.root.findAllByProps({ testID: 'vic-election-notice' })).toHaveLength(
    0,
  );
  expect(text).toContain(mockVic.overview.record!.data.authorisation);
});
test('Closed removes countdown and every upcoming section', () => {
  mockVic.now = new Date('2026-11-28T18:00:00+11:00');
  const r = renderVic(<Hub />);
  const text = words(r);
  expect(text).toContain('Voting has closed');
  for (const value of [
    'Key dates',
    'days until',
    'Election day is',
    'Apply for',
    'Early voting',
  ])
    expect(text).not.toContain(value);
  expect(r.root.findAllByProps({ testID: 'vic-election-days' })).toHaveLength(
    0,
  );
  expect(text).toContain(mockVic.overview.record!.data.authorisation);
});
test('404 has no authorised foot', () => {
  mockVic.overview = {
    record: null,
    error: new ElectionUnavailable('not_published'),
    loading: false,
  };
  const r = renderVic(<Hub />);
  expect(r.root.findByType(ContentUnavailable).props.title).toBe(
    'This page isn’t available',
  );
  expect(r.root.findAllByProps({ testID: 'vic-election-foot' })).toHaveLength(
    0,
  );
});
async function find(q: string, response: unknown, fail = false) {
  mockVic.find.mockImplementation(() =>
    fail
      ? Promise.reject(new Error('offline'))
      : Promise.resolve({ data: response, stale: false }),
  );
  let r!: ReturnType<typeof renderVic>;
  jest.useFakeTimers();
  try {
    r = renderVic(
      <Finder q={q} submit={1} o={mockVic.overview.record!.data} />,
    );
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
  } finally {
    jest.useRealTimers();
  }
  return r;
}
test('finder draws split percentages and its foot', async () => {
  const r = await find('St Kilda', decodeFind(finder));
  const text = words(r);
  for (const id of [
    'vic-election-results',
    'vic-election-hit-0',
    'vic-election-address',
  ])
    expect(r.root.findAllByProps({ testID: id }).length).toBeGreaterThan(0);
  expect(text).toContain('67%');
  expect(text).toContain('of residents');
  expect(text).toContain('Some places cross district lines.');
  expect(text).toContain(mockVic.overview.record!.data.authorisation);
});
test('pinned postcode 3350 shows all three districts and resident shares', async () => {
  const text = words(await find('3350', decodeFind(postcode)));
  for (const value of [
    'Wendouree',
    '55%',
    'Eureka',
    '40%',
    'Ripon',
    '5%',
    'Some places cross district lines.',
  ])
    expect(text).toContain(value);
});
test('pinned postcode 9999 renders the postcode-specific empty state', async () => {
  const r = await find('9999', decodeFind(missingPostcode));
  expect(words(r)).toContain('No Victorian postcode area matches “9999”.');
  expect(
    r.root.findAllByProps({ testID: 'vic-election-address' }).length,
  ).toBeGreaterThan(0);
  expect(r.root.findAllByProps({ testID: 'vic-election-hit-0' })).toHaveLength(
    0,
  );
});
test.each([memberFind, districtFind])(
  'pinned name query $q keeps every returned hit',
  async (pin) => {
    const text = words(await find(pin.q, decodeFind(pin)));
    for (const hit of pin.hits)
      for (const seat of hit.seats) expect(text).toContain(seat.name);
  },
);
for (const empty of ['postcode', 'place'] as const)
  test(`finder empty ${empty}`, async () => {
    const q = empty === 'postcode' ? '9999' : 'Missing';
    const r = await find(q, {
      ...decodeFind(finder),
      q,
      hits: [],
      split: false,
      empty,
    });
    expect(words(r)).toContain(
      empty === 'postcode'
        ? 'PO box postcodes aren’t included'
        : 'Try a nearby suburb.',
    );
  });
test('finder failure keeps matching saved districts', async () => {
  const r = await find('Albert', null, true);
  expect(words(r)).toContain('Places couldn’t be searched.');
  expect(words(r)).toContain('Albert Park');
});
