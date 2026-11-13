import { act } from 'react';
import { Platform, SectionList, StyleSheet } from 'react-native';
import {
  mockVic,
  renderVic,
  rerenderVic,
  resetVic,
  words,
} from './vic-election-render';
import type { SearchBarProps } from 'react-native-screens';
import { router } from 'expo-router';
import { getPathFromState } from 'expo-router/react-navigation';
import { ContentUnavailable } from '../src/design/states';
import * as accessibility from '../src/design/accessibility';
import { PartyLabel } from '../src/design/people';
import { minimumTarget } from '../src/design/tokens';
import * as titleOnScroll from '../src/navigation/useTitleOnScroll';
import { SeatRow } from '../src/features/vic-election/rows';
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
test.each([
  ['q', 'field'],
  ['q', 'cancel'],
  ['place', 'field'],
  ['place', 'cancel'],
])(
  'submitting updates the %s route in place, %s clears it, and late old results stay hidden',
  async (param, clear) => {
    jest.useFakeTimers();
    try {
      let searchBar!: SearchBarProps;
      const setText = jest.fn();
      const observe = (options: Record<string, unknown>) => {
        searchBar = options.headerSearchBarOptions as SearchBarProps;
        (searchBar.ref as { current: unknown }).current = { setText };
      };
      let resolveOld!: (record: unknown) => void;
      mockVic.params = { [param]: '3350', fixture: 'ahead' };
      const routeURL = () =>
        new URL(
          getPathFromState({
            routes: [{ name: 'vic-election', params: mockVic.params }],
          }),
          'https://fixture.test',
        );
      mockVic.find.mockImplementation((q: string) =>
        q === '3350'
          ? new Promise((resolve) => {
              resolveOld = resolve;
            })
          : Promise.resolve({ data: decodeFind(finder), stale: false }),
      );
      jest.mocked(router.push).mockClear();
      jest.mocked(router.replace).mockClear();
      const r = renderVic(<Hub />, observe);
      const hub = r.root.findByType(Hub);
      const mountedFinder = r.root.findByType(Finder);
      await act(async () => jest.advanceTimersByTime(0));
      const oldSignal = mockVic.find.mock.calls[0]![1] as AbortSignal;
      act(() => {
        searchBar.onChangeText!({ nativeEvent: { text: 'St Kilda' } } as never);
      });
      expect(mockVic.params[param]).toBe('3350');
      act(() => {
        searchBar.onSearchButtonPress!({
          nativeEvent: { text: 'St Kilda' },
        } as never);
      });
      expect(mockVic.setParams).toHaveBeenLastCalledWith({
        q: 'St Kilda',
        place: undefined,
      });
      expect(mockVic.params.q).toBe('St Kilda');
      expect(routeURL().searchParams.get('q')).toBe('St Kilda');
      expect(routeURL().searchParams.has('place')).toBe(false);
      rerenderVic(r, <Hub />, observe);
      expect(r.root.findByType(Hub)).toBe(hub);
      expect(r.root.findByType(Finder)).toBe(mountedFinder);
      expect(mountedFinder.props.q).toBe('St Kilda');
      expect(setText).toHaveBeenLastCalledWith('St Kilda');
      await act(async () => jest.advanceTimersByTime(0));
      await act(async () => {
        resolveOld({ data: decodeFind(postcode), stale: false });
      });
      expect(oldSignal.aborted).toBe(true);
      expect(words(r)).toContain('St Kilda');
      expect(words(r)).not.toContain('Wendouree');
      expect(mockVic.setParams).toHaveBeenCalledTimes(1);

      act(() => {
        if (clear === 'cancel') searchBar.onCancelButtonPress!();
        else searchBar.onChangeText!({ nativeEvent: { text: '' } } as never);
      });
      expect(mockVic.setParams).toHaveBeenLastCalledWith({
        q: undefined,
        place: undefined,
      });
      expect(mockVic.params.q).toBeUndefined();
      expect(mockVic.params.place).toBeUndefined();
      expect(routeURL().searchParams.has('q')).toBe(false);
      expect(routeURL().searchParams.has('place')).toBe(false);
      expect(routeURL().searchParams.get('fixture')).toBe('ahead');
      rerenderVic(r, <Hub />, observe);
      await act(async () => jest.runOnlyPendingTimers());
      expect(setText).toHaveBeenLastCalledWith('');
      expect(r.root.findAllByType(Finder)).toHaveLength(0);
      expect(mockVic.setParams).toHaveBeenCalledTimes(2);
      expect(router.push).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  },
);
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

test.each([false, true])(
  'a seat row draws its party on the member line (accessibility size %s)',
  (large) => {
    const size = jest
      .spyOn(accessibility, 'useAccessibilitySize')
      .mockReturnValue(large);
    try {
      const district = mockVic.overview.record!.data.districts.find(
        (d) => d.slug === 'albert-park',
      )!;
      const r = renderVic(<SeatRow district={district} share={0.55} />);
      const party = r.root.findByType(PartyLabel);
      // Drawn only, as a row's party is: no 44 pt link box of its own to be
      // centred half a line below the name, and the row stays one element.
      expect(party.props.nested).toBe(true);
      expect(party.props.linked).toBeUndefined();
      const host = (test: (props: Record<string, unknown>) => boolean) =>
        r.root.findAll((n) => n.type === 'View' && test(n.props));
      expect(host((p) => p.accessible === true)).toHaveLength(1);
      // Only the row itself keeps the 44 pt minimum.
      expect(
        host(
          (p) =>
            StyleSheet.flatten(p.style as never)?.minHeight === minimumTarget,
        ),
      ).toHaveLength(1);
      // The name and party share one line, or at accessibility sizes the
      // party takes its own line under the name.
      const line = party.parent!;
      const style = StyleSheet.flatten(line.props.style);
      expect(words({ root: line } as never)).toContain(district.member.name);
      expect(style).toMatchObject(
        large
          ? { flexDirection: 'column', alignItems: 'flex-start' }
          : { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
      );
    } finally {
      size.mockRestore();
    }
  },
);
test('finder results start at the page top below the header, from a scrolled hub', async () => {
  jest.useFakeTimers();
  try {
    let searchBar!: SearchBarProps;
    const observe = (options: Record<string, unknown>) => {
      searchBar = options.headerSearchBarOptions as SearchBarProps;
      (searchBar.ref as { current: unknown }).current = { setText: jest.fn() };
    };
    mockVic.find.mockImplementation(async (q: string) => ({
      data: decodeFind(q.startsWith('3350') ? postcode : finder),
      stale: false,
    }));
    const r = renderVic(<Hub />, observe);
    const list = () => r.root.findByType(SectionList);
    const scrollTo = jest.fn();
    jest
      .spyOn(list().instance as SectionList, 'getScrollResponder')
      .mockReturnValue({ scrollTo } as never);
    const scrolled = (y: number) =>
      act(() =>
        list().props.onScroll({ nativeEvent: { contentOffset: { y } } }),
      );
    const type = async (text: string) => {
      act(() => {
        searchBar.onChangeText!({ nativeEvent: { text } } as never);
      });
      await act(async () => jest.runOnlyPendingTimers());
    };
    // No header height in the harness: status bar 47 plus a 44 pt bar.
    const top = { y: -(47 + 44), animated: false };

    // At its resting top the page is already where results belong.
    scrolled(top.y);
    await type('3350');
    expect(words(r)).toContain('Wendouree');
    expect(scrollTo).not.toHaveBeenCalled();
    await type('');
    expect(list().props.scrollToOverflowEnabled).toBe(false);

    // Far down the districts, the hub's offset is past the results' end.
    scrolled(2400);
    scrollTo.mockClear();
    await type('3350');
    expect(list().props.scrollToOverflowEnabled).toBe(true);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith(top);
    expect(words(r)).toContain('Wendouree');

    // A new query from scrolled results starts at the top again.
    scrolled(300);
    await type('St Kilda');
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenLastCalledWith(top);

    // Clearing still returns the hub to where the reader left it.
    await type('');
    expect(list().props.scrollToOverflowEnabled).toBe(false);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 2400, animated: false });
  } finally {
    jest.useRealTimers();
  }
});

test.each([
  ['android', true, 'Vic election'],
  ['android', false, 'Victorian election'],
  ['ios', true, 'Victorian election'],
] as const)(
  'the bar title on %s (accessibility size %s) is %s; the route keeps the full title',
  (os, accessible, bar) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    const size = jest
      .spyOn(accessibility, 'useAccessibilitySize')
      .mockReturnValue(accessible);
    const hook = jest.spyOn(titleOnScroll, 'useTitleOnScroll');
    try {
      renderVic(<Hub />);
      expect(hook).toHaveBeenLastCalledWith(expect.anything(), bar, {
        routeTitle: 'Victorian election',
      });
    } finally {
      hook.mockRestore();
      size.mockRestore();
      Object.defineProperty(Platform, 'OS', descriptor);
    }
  },
);
