import { act } from 'react';
import { mockVic, renderVic, resetVic, words } from './vic-election-render';
import { ContentUnavailable } from '../src/design/states';
import Hub from '../src/features/vic-election/Hub';
import { Finder } from '../src/features/vic-election/Finder';
import { ElectionUnavailable } from '../src/features/vic-election/reads';
import { decodeFind } from '../src/features/vic-election/decoders';
import finder from '../scripts/fixtures/vic-election/find-st-kilda.json';
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
  expect(text.indexOf('Lower house:')).toBeLessThan(
    text.indexOf('Upper house:'),
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
