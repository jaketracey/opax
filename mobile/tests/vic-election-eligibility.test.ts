import type { Electorate } from '../src/api/catalogs';
import overview from '../scripts/fixtures/vic-election/overview.json';
import { decodeOverview } from '../src/features/vic-election/decoders';
import {
  savedDistrict,
  todayEligible,
} from '../src/features/vic-election/model';
const o = decodeOverview(overview);
const seats = [
  { electorate_id: 'vic', state_code: 'VIC', jurisdiction: 'federal' },
  { electorate_id: 'nsw', state_code: 'NSW', jurisdiction: 'federal' },
  {
    electorate_id: 'state',
    state_code: 'VIC',
    jurisdiction: 'vic',
    chamber: 'vic_la',
    url: o.districts[0]!.electorate_url,
  },
] as Electorate[];
const choice = (seatId: string, stateSeatIds: string[] = []) => ({
  version: 1 as const,
  seatId,
  stateSeatIds,
});
test('eligibility follows the saved choice before the device zone', () => {
  expect(todayEligible(choice('vic'), seats, 'UTC')).toBe(true);
  expect(todayEligible(choice('', ['state']), seats, 'UTC')).toBe(true);
  expect(todayEligible(null, seats, 'Australia/Melbourne')).toBe(true);
  expect(todayEligible(null, seats, 'Australia/Sydney')).toBe(false);
  expect(todayEligible(choice('nsw'), seats, 'Australia/Melbourne')).toBe(
    false,
  );
});
test('saved district requires a saved vic_la directory URL match', () => {
  expect(savedDistrict(['state'], seats, o)?.slug).toBe('albert-park');
  expect(savedDistrict([], seats, o)).toBeNull();
  expect(
    savedDistrict(['state'], [{ ...seats[2]!, chamber: 'vic_lc' }], o),
  ).toBeNull();
});
