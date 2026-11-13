import { mockVic, renderVic, resetVic, words } from './vic-election-render';
import { StyleSheet } from 'react-native';
import * as accessibility from '../src/design/accessibility';
import { ValueRow } from '../src/design/rows';
import { ContentUnavailable } from '../src/design/states';
import Seat from '../src/features/vic-election/Seat';
import { ElectionUnavailable } from '../src/features/vic-election/reads';
import { decodeSeat } from '../src/features/vic-election/decoders';
import published from '../scripts/fixtures/vic-election/albert-park-candidates.json';
import werribee from '../scripts/fixtures/vic-election/werribee.json';
import bendigoWest from '../scripts/fixtures/vic-election/bendigo-west.json';
import eureka from '../scripts/fixtures/vic-election/eureka.json';
import region from '../scripts/fixtures/vic-election/southern-metropolitan.json';
beforeEach(resetVic);
test('district has Last held by, a dated result, candidates and record', () => {
  const r = renderVic(<Seat />);
  const text = words(r);
  for (const id of [
    'vic-seat-result',
    'vic-seat-held',
    'vic-seat-contest-0',
    'vic-seat-margin',
    'vic-seat-candidates',
    'vic-seat-record',
    'vic-seat-vote-0',
    'vic-seat-speeches',
    'vic-seat-region',
    'vic-seat-map',
  ])
    expect(r.root.findAllByProps({ testID: id }).length).toBeGreaterThan(0);
  for (const value of [
    'Last held by',
    '2022 election',
    'Labor 61.1%, Liberal 38.9% after preferences',
    '11.2 points',
    'Candidates aren’t listed here yet.',
    '367',
    '15',
    'Authorised by',
  ])
    expect(text).toContain(value);
  expect(text).not.toMatch(/(?:^|\s)Held by/);
});
test('latest contest first, with one winning margin', () => {
  mockVic.seat.record!.data = decodeSeat(werribee);
  const text = words(renderVic(<Seat />));
  expect(text.indexOf('2025 by-election')).toBeLessThan(
    text.indexOf('2022 election'),
  );
  expect(text.match(/Winning margin/g)).toHaveLength(1);
});
test('candidate order, ballot numbers and plain unlinked names', () => {
  mockVic.seat.record!.data = decodeSeat(published);
  const r = renderVic(<Seat />);
  const text = words(r);
  const names = published.candidates.list.map((candidate) => candidate.name);
  expect(text.indexOf(names[0]!)).toBeLessThan(text.indexOf(names[1]!));
  expect(text.indexOf(names[1]!)).toBeLessThan(text.indexOf(names[2]!));
  expect(text).toContain('Published 10 Nov 2026');
  const row = r.root
    .findAllByProps({ testID: 'vic-seat-candidate-0' })
    .find((n) => typeof n.type === 'string')!;
  expect(row.props.accessibilityLabel).toBe(`1. ${names[0]}.`);
  expect(row.props.onPress).toBeUndefined();
  const independent = r.root
    .findAllByProps({ testID: 'vic-seat-candidate-1' })
    .find((n) => typeof n.type === 'string')!;
  expect(independent.props.accessibilityLabel).toBe(`2. ${names[1]}.`);
  const partyIndex = published.candidates.list.findIndex(
    (candidate) => candidate.party && candidate.party !== 'Independent',
  );
  const partyCandidate = r.root
    .findAllByProps({ testID: `vic-seat-candidate-${partyIndex}` })
    .find((node) => typeof node.type === 'string')!;
  expect(partyCandidate.props.accessibilityActions).toEqual([
    {
      name: 'openParty',
      label: `Open ${published.candidates.list[partyIndex]!.party} party page`,
    },
  ]);
  expect(
    r.root.findAllByProps({ testID: 'vic-seat-candidates-none' }),
  ).toHaveLength(0);
});
test('Closed hides absent candidates and labels historical results', () => {
  mockVic.now = new Date('2026-11-28T19:00:00+11:00');
  const text = words(renderVic(<Seat />));
  expect(text).not.toContain('Candidates');
  expect(text).not.toContain('Key dates');
  expect(text).toContain('These are results from before the 2026 election.');
});
test('speech gap and absent vote count do not invent totals', () => {
  mockVic.seat.record!.data = decodeSeat(bendigoWest);
  const r = renderVic(<Seat />);
  const text = words(r);
  expect(text).toContain(bendigoWest.members[0]!.speech_gap);
  expect(text).not.toContain('Speeches in Parliament');
  expect(text).not.toContain('Votes recorded');
  expect(r.root.findAllByProps({ testID: 'vic-seat-speeches' })).toHaveLength(
    0,
  );
});
test('region uses member and district rows', () => {
  mockVic.seat.record!.data = decodeSeat(region);
  const text = words(renderVic(<Seat />));
  expect(text).toContain('Southern Metropolitan Region');
  expect(text).toContain('Upper house region with five members');
  for (const member of region.members) expect(text).toContain(member.name);
  for (const district of region.districts)
    expect(text).toContain(district.name);
  expect(text).toContain('Members, 2022 to 2026');
  expect(text).toContain('Districts in this region');
  expect(text).not.toContain('Last result');
});
test('Eureka keeps its former district name', () => {
  mockVic.seat.record!.data = decodeSeat(eureka);
  expect(words(renderVic(<Seat />))).toContain('Called Buninyong before 2022.');
});
test('published candidates stay visible after voting closes', () => {
  mockVic.seat.record!.data = decodeSeat(published);
  mockVic.now = new Date('2026-11-28T19:00:00+11:00');
  const text = words(renderVic(<Seat />));
  for (const candidate of published.candidates.list)
    expect(text).toContain(candidate.name);
});
test('seat not found has an All districts action and no foot', () => {
  mockVic.seat = {
    record: null,
    error: new ElectionUnavailable('not_found'),
    loading: false,
  };
  const r = renderVic(<Seat />);
  expect(r.root.findByType(ContentUnavailable).props.title).toBe(
    'No district or region by that name',
  );
  expect(r.root.findByType(ContentUnavailable).props.action.label).toBe(
    'All districts',
  );
  expect(r.root.findAllByProps({ testID: 'vic-seat-foot' })).toHaveLength(0);
});

test('a loaded seat survives an unavailable overview, with key dates collapsed', () => {
  mockVic.overview = {
    record: null,
    error: new Error('offline'),
    loading: false,
  };
  const r = renderVic(<Seat />);
  const text = words(r);
  expect(text).toContain('Last held by');
  expect(text).toContain('Authorised by');
  expect(text).not.toContain('Key dates');
  expect(text).not.toContain(
    'These are results from before the 2026 election.',
  );
});

test('absent votes do not show an invented count', () => {
  mockVic.seat.record!.data.members[0]!.votes = null;
  expect(words(renderVic(<Seat />))).not.toContain('Votes recorded');
});

test.each([
  ['Large', false],
  ['AX', true],
] as const)(
  "at %s the vote split is the count row's detail, one element, not a loose line",
  (_size, large) => {
    const size = jest
      .spyOn(accessibility, 'useAccessibilitySize')
      .mockReturnValue(large);
    try {
      mockVic.seat.record!.data = decodeSeat(published);
      const r = renderVic(<Seat />);
      const row = r.root.find(
        (node) =>
          typeof node.type === 'string' &&
          node.props.testID === 'vic-seat-votes',
      );
      const year = mockVic.seat.record!.data.division_end.slice(0, 4);
      expect(row.props.accessible).toBe(true);
      expect(row.props.accessibilityLabel).toBe(
        `Votes recorded in ${year}, 15. 12 for, 3 against`,
      );
      // Label, its detail under it, then the count: all inside the row.
      expect(
        row
          .findAll((node) => typeof node.props.children === 'string')
          .map((node) => node.props.children)
          .filter((text, i, all) => all.indexOf(text) === i),
      ).toEqual([`Votes recorded in ${year}`, '12 for, 3 against', '15']);
      // It is the shared ValueRow, with the split as its detail; the pair
      // sits beside the count, or over it at accessibility sizes.
      expect(r.root.findByProps({ testID: 'vic-seat-votes' }).type).toBe(
        ValueRow,
      );
      const content = row.find(
        (node) =>
          typeof node.type === 'string' &&
          node !== row &&
          node.findAll((child) => child.props.children === '15').length > 0 &&
          node.findAll((child) => child.props.children === '12 for, 3 against')
            .length > 0,
      );
      expect(StyleSheet.flatten(content.props.style).flexDirection).toBe(
        large ? 'column' : 'row',
      );
      // Said once on the page.
      expect(words(r).match(/12 for, 3 against/g)).toHaveLength(1);
    } finally {
      size.mockRestore();
    }
  },
);
