import { mockVic, renderVic, resetVic, words } from './vic-election-render';
import { ContentUnavailable } from '../src/design/states';
import Seat from '../src/features/vic-election/Seat';
import { ElectionUnavailable } from '../src/features/vic-election/reads';
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
  const s = mockVic.seat.record!.data;
  s.name = 'Test district';
  s.result!.since = {
    ...s.result!.general,
    date: '2025-02-08',
    kind: 'by-election',
    margin: 0.82,
  };
  const text = words(renderVic(<Seat />));
  expect(text.indexOf('2025 by-election')).toBeLessThan(
    text.indexOf('2022 election'),
  );
  expect(text.match(/Winning margin/g)).toHaveLength(1);
});
test('candidate order, ballot numbers and plain unlinked names', () => {
  mockVic.seat.record!.data.candidates = {
    published: '2026-11-09',
    url: 'https://www.vec.vic.gov.au/',
    list: [
      { name: 'Test Zed', party: null },
      { name: 'Test Ada', party: 'Test Party' },
    ],
  };
  const r = renderVic(<Seat />);
  const text = words(r);
  expect(text.indexOf('Test Zed')).toBeLessThan(text.indexOf('Test Ada'));
  const row = r.root
    .findAllByProps({ testID: 'vic-seat-candidate-0' })
    .find((n) => typeof n.type === 'string')!;
  expect(row.props.accessibilityLabel).toBe('1. Test Zed.');
  expect(row.props.onPress).toBeUndefined();
});
test('Closed hides absent candidates and labels historical results', () => {
  mockVic.now = new Date('2026-11-28T19:00:00+11:00');
  const text = words(renderVic(<Seat />));
  expect(text).not.toContain('Candidates');
  expect(text).not.toContain('Key dates');
  expect(text).toContain('These are results from before the 2026 election.');
});
test('speech gap and absent vote count do not invent totals', () => {
  const m = mockVic.seat.record!.data.members[0]!;
  m.speeches = null;
  m.speech_gap = 'No speech count for this member.';
  const text = words(renderVic(<Seat />));
  expect(text).toContain(m.speech_gap);
});
test('region uses member and district rows', () => {
  const s = mockVic.seat.record!.data;
  s.kind = 'region';
  s.name = 'Test region';
  s.result = null;
  s.region = null;
  s.members = Array.from({ length: 5 }, (_, i) => ({
    name: `Test Member ${i + 1}`,
    party: null,
    slug: `test-member-${i + 1}`,
    href: `/subject/person/test-member-${i + 1}`,
    source_url: `https://example.test/member-${i + 1}`,
    speeches: null,
    speech_gap: null,
    votes: null,
    recent_votes: [],
  }));
  s.districts = mockVic.overview.record!.data.districts;
  const text = words(renderVic(<Seat />));
  expect(text).toContain('Test region Region');
  expect(text).toContain('Upper house region with five members');
  for (let i = 1; i <= 5; i++) expect(text).toContain(`Test Member ${i}`);
  expect(text).toContain('Members, 2022 to 2026');
  expect(text).toContain('Districts in this region');
  expect(text).not.toContain('Last result');
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
});

test('absent votes do not show an invented count', () => {
  mockVic.seat.record!.data.members[0]!.votes = null;
  expect(words(renderVic(<Seat />))).not.toContain('Votes recorded');
});
