import { mockVic, renderVic, resetVic, words } from './vic-election-render';
import { vicCopy as c } from '../src/features/vic-election/copy';
import { decodeSeat } from '../src/features/vic-election/decoders';
import { RegionRow, SeatRow } from '../src/features/vic-election/rows';
import Seat from '../src/features/vic-election/Seat';
import region from '../scripts/fixtures/vic-election/southern-metropolitan.json';

beforeEach(resetVic);
const overview = () => mockVic.overview.record!.data;
const label = (r: ReturnType<typeof renderVic>, id: string) =>
  r.root.find((n) => typeof n.type === 'string' && n.props.testID === id).props
    .accessibilityLabel as string;

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

  test('a district row draws "Last held by <name>", as its spoken label says', () => {
    const district = overview().districts.find((d) => !!d.member.party)!;
    const plain = renderVic(<SeatRow district={district} />);
    expect(words(plain)).toContain(`Last held by ${district.member.name}`);
    expect(label(plain, `vic-election-district-${district.slug}`)).toContain(
      `${district.name}. Last held by ${district.member.name}, ${district.member.party}.`,
    );
    // The finder's row, with a share of a place's residents.
    const found = renderVic(
      <SeatRow district={district} share={0.55} place="St Kilda" />,
    );
    expect(words(found)).toContain(`Last held by ${district.member.name}`);
    expect(label(found, `vic-election-district-${district.slug}`)).toContain(
      `Last held by ${district.member.name}`,
    );
  });

  test('a district row with a 2026 result draws the result, not who last held it', () => {
    const district = overview().districts[0]!;
    const result = mockVic.seat.record!.data.result!.general;
    const r = renderVic(<SeatRow district={district} currentResult={result} />);
    expect(words(r)).not.toContain('Last held by');
    expect(words(r)).not.toContain(district.member.name);
    expect(label(r, `vic-election-district-${district.slug}`)).not.toContain(
      'Last held by',
    );
  });

  test('a region row leads its people with "Last members:", drawn and spoken', () => {
    const row = overview().regions.find((r) => r.members.length === 5)!;
    const names = row.members.map((m) => m.name);
    const r = renderVic(<RegionRow region={row} />);
    const text = words(r);
    expect(text).toContain(`Last members: ${names.slice(0, 3).join(', ')}`);
    expect(text).toContain('and 2 more');
    expect(text).not.toContain(names[3]!);
    expect(label(r, `vic-election-region-${row.slug}`)).toBe(
      `${row.name}. Last members: ${names.join(', ')}.`,
    );
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
