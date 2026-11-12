import { act } from 'react';
import { SectionList } from 'react-native';
import {
  mockVic,
  renderVic,
  rerenderVic,
  resetVic,
  words,
} from './vic-election-render';
import type { SearchBarProps } from 'react-native-screens';
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
  const ids = r.root
    .findAll(
      (n) =>
        typeof n.type === 'string' &&
        /^vic-election-hit-\d+-(district|region)-/.test(n.props.testID ?? ''),
    )
    .map((n) => n.props.testID);
  expect(ids).toHaveLength(
    finder.hits.reduce((n, hit) => n + hit.seats.length, 0),
  );
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toContain('vic-election-hit-0-district-albert-park');
  expect(ids).toContain('vic-election-hit-2-district-albert-park');
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
test.each(['q', 'place'])(
  'a mounted hub follows a changed %s place without stale rows or remounting',
  async (param) => {
    jest.useFakeTimers();
    try {
      let searchBar!: SearchBarProps;
      const setText = jest.fn();
      const observe = (options: Record<string, unknown>) => {
        searchBar = options.headerSearchBarOptions as SearchBarProps;
        (searchBar.ref as { current: unknown }).current = { setText };
      };
      mockVic.params = { [param]: '3350' };
      mockVic.find.mockImplementation(async (q: string) => ({
        data: decodeFind(q === '3350' ? postcode : finder),
        stale: false,
      }));
      const r = renderVic(<Hub />, observe);
      const hub = r.root.findByType(Hub);
      const mountedFinder = r.root.findByType(Finder);
      await act(async () => jest.advanceTimersByTime(0));
      expect(words(r)).toContain('Wendouree');
      expect(mountedFinder.props.submit).toBe(1);
      act(() => {
        searchBar.onChangeText!({ nativeEvent: { text: '3350' } } as never);
      });
      expect(mountedFinder.props.submit).toBe(0);
      const previousSignal = mockVic.find.mock.calls[0]![1] as AbortSignal;

      mockVic.params = { [param]: 'St Kilda' };
      rerenderVic(r, <Hub />, observe);
      expect(r.root.findByType(Hub)).toBe(hub);
      expect(r.root.findByType(Finder)).toBe(mountedFinder);
      expect(mountedFinder.props.q).toBe('St Kilda');
      expect(mountedFinder.props.submit).toBe(1);
      expect(previousSignal.aborted).toBe(true);
      expect(setText).toHaveBeenLastCalledWith('St Kilda');
      for (const old of ['Wendouree', 'Eureka', 'Ripon'])
        expect(words(r)).not.toContain(old);
      await act(async () => jest.advanceTimersByTime(0));
      expect(mockVic.find).toHaveBeenLastCalledWith(
        'St Kilda',
        expect.any(AbortSignal),
      );
      expect(words(r)).toContain('St Kilda');
      expect(words(r)).toContain('Albert Park');
      expect(words(r)).not.toContain('Wendouree');

      // A normal local edit survives rerenders with the same route parameter.
      act(() => {
        searchBar.onChangeText!({ nativeEvent: { text: 'Bass' } } as never);
      });
      rerenderVic(r, <Hub />, observe);
      expect(mountedFinder.props.q).toBe('Bass');
      mockVic.params = {};
      rerenderVic(r, <Hub />, observe);
      expect(setText).toHaveBeenLastCalledWith('');
      expect(r.root.findAllByType(Finder)).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  },
);
test('an old place response cannot replace the current place results', async () => {
  jest.useFakeTimers();
  try {
    let resolveOld!: (record: unknown) => void;
    mockVic.find.mockImplementation((q: string) =>
      q === '3350'
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve({ data: decodeFind(finder), stale: false }),
    );
    mockVic.params = { q: '3350' };
    const r = renderVic(<Hub />);
    await act(async () => jest.advanceTimersByTime(0));
    mockVic.params = { q: 'St Kilda' };
    rerenderVic(r, <Hub />);
    await act(async () => jest.advanceTimersByTime(0));
    await act(async () => {
      resolveOld({ data: decodeFind(postcode), stale: false });
    });
    expect(words(r)).toContain('St Kilda');
    expect(words(r)).not.toContain('Wendouree');
  } finally {
    jest.useRealTimers();
  }
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
