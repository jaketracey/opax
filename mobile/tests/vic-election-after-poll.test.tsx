import { Platform } from 'react-native';
import { mockVic, renderVic, resetVic, words } from './vic-election-render';
import * as accessibility from '../src/design/accessibility';
import Hub from '../src/features/vic-election/Hub';
import Seat from '../src/features/vic-election/Seat';
import { SeatRow } from '../src/features/vic-election/rows';
import { TodayBlock } from '../src/features/vic-election/TodayBlock';
import { ElectionSearchRow } from '../src/features/vic-election/SearchRow';
import { electionCopy } from '../src/features/vic-election/model';
import {
  decodeOverview,
  decodeSeat,
} from '../src/features/vic-election/decoders';
import overview from '../scripts/fixtures/vic-election/overview.json';
import seat from '../scripts/fixtures/vic-election/albert-park.json';
import region from '../scripts/fixtures/vic-election/southern-metropolitan.json';
import type { Electorate } from '../src/api/catalogs';

// Synthetic results for rendering only. These are not election predictions.
const result = {
  date: '2026-11-28',
  kind: 'general',
  party: 'Example party',
  share: 55,
  against: 'Other party',
  against_share: 45,
  margin: 5,
  url: 'https://www.vec.vic.gov.au/results/state-election-results/2026-state-election-results',
};
const results = (final = false) => ({
  election_day: '2026-11-28',
  fetched: final ? '2026-12-15' : '2026-11-29',
  status: final ? 'final' : 'partial',
  url: result.url,
  districts: (final ? overview.districts : overview.districts.slice(0, 1)).map(
    (d) => ({ name: d.name, result }),
  ),
});
const moments = [
  [
    '2026-11-17T21:59:00Z',
    'pre_poll',
    'Early voting begins on Wednesday 18 November.',
  ],
  ['2026-11-17T22:00:00Z', 'early_voting', 'Early voting runs 18–27 November'],
  ['2026-11-17T22:01:00Z', 'early_voting', 'Early voting runs 18–27 November'],
  ['2026-11-27T06:59:00Z', 'early_voting', 'Early voting runs 18–27 November'],
  ['2026-11-27T07:00:00Z', 'early_voting', 'Early voting has closed.'],
  ['2026-11-27T08:00:00Z', 'early_voting', 'Early voting has closed.'],
  [
    '2026-11-27T20:59:00Z',
    'election_day',
    'Voting runs from 8 am to 6 pm AEDT.',
  ],
  ['2026-11-27T21:00:00Z', 'election_day', 'Voting is open until 6 pm AEDT.'],
  ['2026-11-27T21:01:00Z', 'election_day', 'Voting is open until 6 pm AEDT.'],
  ['2026-11-28T06:59:00Z', 'election_day', 'Voting is open until 6 pm AEDT.'],
  ['2026-11-28T07:00:00Z', 'polls_closed', 'The count is under way.'],
  ['2026-11-28T07:01:00Z', 'polls_closed', 'The count is under way.'],
  ['2026-11-29T01:00:00Z', 'polls_closed', 'The count is under way.'],
  ['2026-12-15T01:00:00Z', 'polls_closed', 'The count is under way.'],
  [
    '2026-11-29T01:00:00Z',
    'results',
    'Published lower house district results are available.',
  ],
  [
    '2026-12-15T01:00:00Z',
    'results_final',
    'Final lower house district results are available.',
  ],
] as const;
const choice = { version: 1 as const, seatId: 'vic', stateSeatIds: [] };
const seats = [
  { electorate_id: 'vic', state_code: 'VIC', jurisdiction: 'federal' },
] as Electorate[];
beforeEach(resetVic);
function payload(instant: string, state: string, additive = true) {
  mockVic.now = new Date(instant);
  const current = state === 'results' || state === 'results_final';
  mockVic.overview.record!.data = decodeOverview({
    ...overview,
    ...(additive ? { state } : {}),
    current_results: current ? results(state === 'results_final') : null,
  });
  mockVic.seat.record!.data = decodeSeat({
    ...seat,
    ...(additive ? { state } : {}),
    current_result: current ? result : null,
  });
}
function assertMoment(
  instant: string,
  state: string,
  expected: string,
  additive: boolean,
) {
  payload(instant, state, additive);
  const hub = renderVic(<Hub />);
  const district = renderVic(<Seat />);
  const today = renderVic(<TodayBlock choice={choice} seats={seats} />);
  for (const tree of [hub, district]) expect(words(tree)).toContain(expected);
  if (instant.startsWith('2026-12-15')) expect(words(today)).toBe('');
  else
    expect(words(today)).toContain(
      state === 'pre_poll' ? 'In 10 days' : expected,
    );
  const current = state === 'results' || state === 'results_final';
  for (const tree of [hub, district]) {
    expect(
      tree.root.findAllByProps({ testID: 'vic-election-current-results' })
        .length > 0,
    ).toBe(current);
    if (current) {
      expect(words(tree)).toContain(
        'Example party 55.0%, Other party 45.0% after preferences',
      );
      const row = tree.root
        .findAllByType(SeatRow)
        .find((node) => node.props.currentResult);
      expect(row).toBeDefined();
      const text = words({ root: row! } as never);
      expect(text).toContain('Example party by 5.0');
      expect(text).not.toContain('Nina Taylor');
      expect(text).toContain('2026 election');
    }
  }
  if (['polls_closed', 'results', 'results_final'].includes(state)) {
    for (const tree of [hub, district, today])
      expect(words(tree)).not.toMatch(
        /Victorians vote|Voting is open|days until|Key dates/,
      );
    expect(words(district)).toContain(
      'These are results from before the 2026 election.',
    );
  }
  if (
    instant >= '2026-11-27T07:00:00Z' &&
    ['early_voting', 'election_day'].includes(state)
  ) {
    for (const tree of [hub, district]) {
      const early = tree.root.findByProps({
        testID: 'vic-election-date-early',
      });
      expect(words({ root: early } as never)).toContain('Early voting closed');
      expect(words({ root: early } as never)).not.toContain('18–27 November');
    }
  }
}
for (const os of ['ios', 'android'])
  for (const large of [false, true])
    for (const additive of [false, true]) {
      describe(`${os}, ${large ? 'AX5 structure' : 'Large structure'}, API state ${additive}`, () => {
        let descriptor: PropertyDescriptor;
        let size: jest.SpyInstance;
        beforeEach(() => {
          descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
          Object.defineProperty(Platform, 'OS', {
            configurable: true,
            value: os,
          });
          size = jest
            .spyOn(accessibility, 'useAccessibilitySize')
            .mockReturnValue(large);
        });
        afterEach(() => {
          size.mockRestore();
          Object.defineProperty(Platform, 'OS', descriptor);
        });
        test.each(moments)('%s: %s', (instant, state, expected) =>
          assertMoment(instant, state, expected, additive),
        );
      });
    }
// These use existing component exports, so reverting fails on rendered behaviour.
test.each([
  moments[0],
  moments[1],
  moments[7],
  moments[10],
  moments[14],
  moments[15],
])('revert sentinel %s: %s', (instant, state, expected) =>
  assertMoment(instant, state, expected, true),
);
test.each([null, 'future_state', {}, 42])(
  'invalid API state %p falls back to the clock',
  (state) => {
    mockVic.now = new Date('2026-11-28T07:00:00Z');
    mockVic.overview.record!.data = decodeOverview({ ...overview, state });
    expect(words(renderVic(<Hub />))).toContain('The count is under way.');
  },
);
test('API state takes precedence over the device clock, including on a seat', () => {
  payload('2026-11-20T01:00:00Z', 'polls_closed');
  expect(words(renderVic(<Hub />))).toContain('The count is under way.');
  mockVic.overview.record!.data = decodeOverview(overview);
  const text = words(renderVic(<Seat />));
  expect(text).toContain('The count is under way.');
  expect(text).not.toContain('Key dates');
});
test.each(['results', 'results_final'])(
  '%s without data has no half state or results section',
  (state) => {
    payload('2026-11-29T01:00:00Z', 'polls_closed');
    mockVic.overview.record!.data = decodeOverview({
      ...overview,
      title: 'Victorian election 2026: results',
      state,
      current_results: null,
    });
    mockVic.seat.record!.data = decodeSeat({
      ...seat,
      state,
      current_result: null,
    });
    for (const tree of [
      renderVic(<Hub />),
      renderVic(<Seat />),
      renderVic(<TodayBlock choice={choice} seats={seats} />),
    ]) {
      expect(words(tree)).toContain('The count is under way.');
      expect(words(tree)).not.toMatch(
        /: results|lower house district results are available/,
      );
      expect(
        tree.root.findAllByProps({ testID: 'vic-election-current-results' }),
      ).toHaveLength(0);
    }
  },
);
test('empty current results have no results section', () => {
  mockVic.now = new Date('2026-11-29T01:00:00Z');
  mockVic.overview.record!.data = decodeOverview({
    ...overview,
    state: 'results',
    current_results: { ...results(), districts: [] },
  });
  expect(words(renderVic(<Hub />))).toContain('The count is under way.');
});
test('current results do not leak before polling close in a legacy response', () => {
  payload('2026-11-28T06:59:00Z', 'results', false);
  for (const tree of [renderVic(<Hub />), renderVic(<Seat />)]) {
    expect(words(tree)).toContain('Voting is open until 6 pm AEDT.');
    expect(words(tree)).not.toContain('Example party');
    expect(
      tree.root.findAllByProps({ testID: 'vic-election-current-results' }),
    ).toHaveLength(0);
  }
});
test('an unpublished district stays empty while other district results are present', () => {
  payload('2026-11-29T01:00:00Z', 'results');
  mockVic.overview.record!.data = decodeOverview({
    ...overview,
    state: 'results',
    current_results: {
      ...results(),
      districts: [{ name: overview.districts[1]!.name, result }],
    },
  });
  mockVic.seat.record!.data = decodeSeat({
    ...seat,
    state: 'results',
    current_result: null,
  });
  const tree = renderVic(<Seat />);
  expect(words(tree)).toContain(
    'No result for this district has been published here yet.',
  );
  expect(
    tree.root.findAllByProps({ testID: 'vic-election-current-results' }),
  ).toHaveLength(0);
  expect(words(tree)).not.toContain('Example party');
});
test('a current seat result survives an unavailable overview', () => {
  payload('2026-11-29T01:00:00Z', 'results');
  mockVic.overview = {
    record: null,
    error: new Error('offline'),
    loading: false,
  };
  const tree = renderVic(<Seat />);
  expect(words(tree)).toContain(
    'Example party 55.0%, Other party 45.0% after preferences',
  );
  expect(
    tree.root.findAllByProps({ testID: 'vic-election-current-albert-park' })
      .length,
  ).toBeGreaterThan(0);
});
test('a region shows only published results for its own districts', () => {
  payload('2026-11-29T01:00:00Z', 'results');
  const own = region.districts[0]!;
  const outside = overview.districts.find(
    (d) => !region.districts.some((s) => s.name === d.name),
  )!;
  mockVic.overview.record!.data = decodeOverview({
    ...overview,
    state: 'results',
    current_results: {
      ...results(),
      districts: [own, outside].map((d) => ({ name: d.name, result })),
    },
  });
  mockVic.seat.record!.data = decodeSeat({ ...region, state: 'results' });
  const tree = renderVic(<Seat />);
  const current = tree.root
    .findAllByType(SeatRow)
    .filter((node) => node.props.currentResult);
  expect(current.map((node) => node.props.district.name)).toEqual([own.name]);
});
test('portal midnight election_day state describes scheduled voting before 8 am', () => {
  payload('2026-11-27T13:01:00Z', 'election_day');
  for (const tree of [
    renderVic(<Hub />),
    renderVic(<Seat />),
    renderVic(<TodayBlock choice={choice} seats={seats} />),
  ]) {
    expect(words(tree)).toContain('Voting runs from 8 am to 6 pm AEDT.');
    expect(words(tree)).not.toContain('Voting is open');
  }
});
test.each([
  { ...results(), status: 'final' },
  { ...results(), districts: [...results().districts, ...results().districts] },
  { ...results(), districts: [{ name: 'Unknown district', result }] },
  { ...results(), fetched: '2026-11-27' },
  { ...results(), url: 'https://example.com/results' },
  {
    ...results(),
    districts: [{ name: seat.name, result: { ...result, share: 49 } }],
  },
  {
    ...results(),
    districts: [{ name: seat.name, result: { ...result, margin: 4 } }],
  },
])(
  'invalid results are discarded as a whole, retaining the overview (%#)',
  (current_results) => {
    const decoded = decodeOverview({ ...overview, current_results });
    expect(decoded.current_results).toBeUndefined();
    expect(decoded.districts).toEqual(overview.districts);
    expect(decoded.authorisation).toBe(overview.authorisation);
  },
);

test.each([
  {},
  [],
  'unavailable',
  { ...result, share: 49 },
  { ...result, margin: 4 },
  { ...result, against_share: 40 },
  { ...result, date: '2026-11-27' },
  { ...result, kind: 'by-election' },
  { ...result, url: 'https://example.com/results' },
  { ...result, url: 'not a URL' },
])(
  'a bad current seat result is discarded while the district page loads (%#)',
  (current_result) => {
    payload('2026-11-29T01:00:00Z', 'results');
    const decoded = decodeSeat({ ...seat, state: 'results', current_result });
    expect(decoded).toEqual({
      ...decodeSeat({ ...seat, state: 'results' }),
      current_result: undefined,
    });
    mockVic.seat.record!.data = decoded;
    const page = renderVic(<Seat />);
    expect(words(page)).toContain(seat.name);
    expect(words(page)).toContain(seat.members[0]!.name);
  },
);

test.each([undefined, null, result])(
  'an optional valid current seat result is retained (%#)',
  (current_result) => {
    expect(decodeSeat({ ...seat, current_result }).current_result).toEqual(
      current_result ?? undefined,
    );
  },
);

test('a district result on a region is discarded without losing its members', () => {
  expect(decodeSeat({ ...region, current_result: result })).toEqual({
    ...decodeSeat(region),
    current_result: undefined,
  });
});

test('bad required seat fields still fail when the current result is also bad', () => {
  expect(() =>
    decodeSeat({ ...seat, members: [], current_result: {} }),
  ).toThrow();
});

test('published results override an ageing polls_closed state once voting is closed', () => {
  payload('2026-11-29T01:00:00Z', 'results');
  mockVic.overview.record!.data = decodeOverview({
    ...overview,
    state: 'polls_closed',
    current_results: results(),
  });
  expect(words(renderVic(<Hub />))).toContain(
    'Published lower house district results are available.',
  );
});
test('a final API label cannot promote partial result data to final', () => {
  payload('2026-11-29T01:00:00Z', 'results');
  mockVic.overview.record!.data = decodeOverview({
    ...overview,
    state: 'results_final',
    current_results: results(),
  });
  const tree = renderVic(<Hub />);
  expect(words(tree)).toContain(
    'Published lower house district results are available.',
  );
  expect(words(tree)).not.toContain('Final lower house');
});

for (const os of ['ios', 'android']) {
  describe(`review regressions on ${os}`, () => {
    let descriptor: PropertyDescriptor;
    beforeEach(() => {
      descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
      Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    });
    afterEach(() => {
      Object.defineProperty(Platform, 'OS', descriptor);
    });
    test.each([
      '2026-11-27T13:00:00Z',
      '2026-11-27T13:01:00Z',
      '2026-11-27T20:59:00Z',
    ])(
      'review fix 1: legacy API matches portal election day at %s',
      (instant) => {
        payload(instant, 'election_day', false);
        for (const tree of [
          renderVic(<Hub />),
          renderVic(<Seat />),
          renderVic(<TodayBlock choice={choice} seats={seats} />),
        ]) {
          expect(words(tree)).toContain('Election day is today');
          expect(words(tree)).toContain('Voting runs from 8 am to 6 pm AEDT.');
          expect(words(tree)).not.toContain('Voting is open');
        }
      },
    );
    test.each(['2026-11-27T13:00:00Z', '2026-11-27T21:00:00Z'])(
      'review fix 2: election-day heading is said once at %s',
      (instant) => {
        payload(instant, 'election_day');
        for (const tree of [
          renderVic(<Hub />),
          renderVic(<Seat />),
          renderVic(<TodayBlock choice={choice} seats={seats} />),
        ])
          expect(words(tree).match(/Election day is today/g)).toHaveLength(1);
      },
    );
    test('review fix 3: Friday evening heading says early voting closed', () => {
      const o = decodeOverview(overview);
      expect(electionCopy(o, new Date('2026-11-27T06:59:00Z')).heading).toBe(
        'Early voting',
      );
      expect(electionCopy(o, new Date('2026-11-27T07:00:00Z')).heading).toBe(
        'Early voting closed',
      );
      expect(electionCopy(o, new Date('2026-11-27T08:00:00Z')).heading).toBe(
        'Early voting closed',
      );
    });
    test('review fix 4: a malformed result row preserves the overview and hides results', () => {
      mockVic.now = new Date('2026-11-29T01:00:00Z');
      const decoded = decodeOverview({
        ...overview,
        state: 'results',
        current_results: {
          ...results(),
          districts: [
            ...results().districts,
            { name: overview.districts[1]!.name, result: null },
          ],
        },
      });
      expect(decoded.current_results).toBeUndefined();
      expect(decoded.districts).toEqual(overview.districts);
      expect(decoded.key_dates).toEqual(overview.key_dates);
      expect(decoded.authorisation).toBe(overview.authorisation);
      mockVic.overview.record!.data = decoded;
      const tree = renderVic(<Hub />);
      expect(words(tree)).toContain('Lower house: 88 districts');
      expect(words(tree)).toContain('The count is under way.');
      expect(
        tree.root.findAllByProps({ testID: 'vic-election-current-results' }),
      ).toHaveLength(0);
      expect(words(tree)).not.toContain(': results');
      expect(() =>
        decodeOverview({
          ...overview,
          districts: null,
          current_results: { districts: null },
        }),
      ).toThrow();
    });
    test('review fix 5: an external result row explains that it opens the VEC website', () => {
      payload('2026-11-29T01:00:00Z', 'results');
      const tree = renderVic(<Seat />);
      const external = tree.root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.testID === 'vic-election-current-albert-park' &&
          node.props.accessible,
      );
      expect(external.length).toBeGreaterThan(0);
      for (const row of external) {
        expect(row.props.accessibilityHint).toBe('Opens the VEC website.');
        expect(row.props.accessibilityRole).toBe('link');
        expect(row.props.accessibilityLabel).toContain('Example party');
      }
      const internal = renderVic(
        <SeatRow
          district={mockVic.overview.record!.data.districts[0]!}
          currentResult={mockVic.seat.record!.data.current_result!}
        />,
      );
      for (const row of internal.root.findAll(
        (node) => typeof node.type === 'string' && node.props.accessible,
      ))
        expect(row.props.accessibilityHint).toBeUndefined();
    });
    test.each(['2026-11-28T07:00:00Z', '2026-12-28T01:00:00Z'])(
      'review fix 6: Search uses neutral candidate wording after voting at %s',
      (instant) => {
        mockVic.now = new Date(instant);
        const text = words(renderVic(<ElectionSearchRow />));
        expect(text).toContain('Find your district and its candidates');
        expect(text).not.toContain('who is standing');
      },
    );
  });
}
