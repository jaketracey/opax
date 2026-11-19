import { mockVic, renderVic, resetVic, words } from './vic-election-render';
import { vicCopy as c } from '../src/features/vic-election/copy';
import { decodeSeat } from '../src/features/vic-election/decoders';
import Seat from '../src/features/vic-election/Seat';
import region from '../scripts/fixtures/vic-election/southern-metropolitan.json';

beforeEach(resetVic);

describe('the election hub names nobody as a member of the Victorian Parliament', () => {
  test('the copy: a region elects five members, and its people are its last members', () => {
    expect(c.regionHead(5, 11)).toBe(
      'Upper house region that elects five members, with 11 districts.',
    );
    expect(c.records).toBe('Last members and their records');
    expect(c.memberList).toBe('Last members');
    expect(c.placesMissing).toBe(
      'Suburbs and postcodes couldn’t be searched just now. Districts and who last held them are shown.',
    );
    // The dated heading stays.
    expect(c.members('2022', '2026')).toBe('Members, 2022 to 2026');
  });

  test('the district page’s region link and the region page’s line and headings', () => {
    expect(words(renderVic(<Seat />))).toContain(
      'Last members and their records',
    );
    mockVic.seat.record!.data = decodeSeat(region);
    const dated = words(renderVic(<Seat />));
    expect(dated).toContain(
      `Upper house region that elects five members, with ${region.districts.length} districts.`,
    );
    expect(dated).not.toContain('with five members');
    expect(dated).toContain('Members, 2022 to 2026');
    // The overview cannot be read: the heading has no years to stand on.
    mockVic.overview = { record: null, error: null, loading: false } as never;
    const fallback = words(renderVic(<Seat />));
    expect(fallback).toContain('Last members');
    expect(fallback).not.toContain('Members, 2022 to 2026');
    for (const member of region.members)
      expect(fallback).toContain(member.name);
  });
});
