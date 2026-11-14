import { mockVic, renderVic, resetVic, words } from './vic-election-render';
import { TodayBlock } from '../src/features/vic-election/TodayBlock';
import { ElectionUnavailable } from '../src/features/vic-election/reads';
import type { Electorate } from '../src/api/catalogs';
const choice = { version: 1 as const, seatId: 'vic', stateSeatIds: [] };
const seats = [
  { electorate_id: 'vic', state_code: 'VIC', jurisdiction: 'federal' },
] as Electorate[];
beforeEach(resetVic);
for (const [instant, text] of [
  ['2026-11-20T10:00:00+11:00', 'Early voting runs 18–27 November'],
  ['2026-11-28T10:00:00+11:00', 'Voting is open until 6 pm AEDT.'],
  ['2026-11-28T19:00:00+11:00', 'Voting has closed'],
])
  test(`Today ${text}`, () => {
    mockVic.now = new Date(instant!);
    const r = renderVic(<TodayBlock choice={choice} seats={seats} />);
    expect(words(r)).toContain(text);
    expect(words(r)).toContain(mockVic.overview.record!.data.authorisation);
    expect(words(r)).toContain('Find your district');
  });
test('names the matched district, and marks a saved copy', () => {
  const d = mockVic.overview.record!.data.districts[0]!;
  mockVic.overview.record!.stale = true;
  const r = renderVic(
    <TodayBlock
      choice={{ ...choice, stateSeatIds: ['state'] }}
      seats={[
        ...seats,
        {
          electorate_id: 'state',
          chamber: 'vic_la',
          url: d.electorate_url,
        } as Electorate,
      ]}
    />,
  );
  expect(words(r)).toContain(d.name);
  expect(words(r)).toContain('Your state district');
  expect(words(r)).toContain('Saved 12 Nov 2026');
});
for (const error of [
  new ElectionUnavailable('not_published'),
  new Error('offline'),
])
  test(`collapses without saved content: ${error.message}`, () => {
    mockVic.overview = { record: null, error, loading: false };
    const r = renderVic(<TodayBlock choice={choice} seats={seats} />);
    expect(
      r.root.findAllByProps({ testID: 'today-vic-election' }),
    ).toHaveLength(0);
  });
test('retires on 6 December', () => {
  mockVic.now = new Date('2026-12-06T00:00:00+11:00');
  expect(words(renderVic(<TodayBlock choice={choice} seats={seats} />))).toBe(
    '',
  );
});
