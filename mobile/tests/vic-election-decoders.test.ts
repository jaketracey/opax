import overview from '../scripts/fixtures/vic-election/overview.json';
import seat from '../scripts/fixtures/vic-election/albert-park.json';
import finder from '../scripts/fixtures/vic-election/find-st-kilda.json';
import { AUTHORISATION_LINE } from '../src/design/authorisation';
import {
  decodeFind,
  decodeOverview,
  decodeSeat,
} from '../src/features/vic-election/decoders';
test('contract examples decode, ignore new keys and pin authorisation', () => {
  expect(decodeOverview({ ...overview, new_field: 1 }).authorisation).toBe(
    AUTHORISATION_LINE,
  );
  expect(decodeSeat(seat).name).toBe('Albert Park');
  expect(decodeFind(finder).hits).toHaveLength(3);
  const { notice: _notice, ...withoutNotice } = overview;
  expect(decodeOverview(withoutNotice).notice).toBeNull();
});
test('missing required fields and incompatible versions fail closed', () => {
  const { authorisation: _authorisation, ...bad } = overview;
  expect(() => decodeOverview(bad)).toThrow();
  expect(() => decodeOverview({ ...overview, schema_version: 2 })).toThrow();
  const { members: _members, kind: _kind, ...badSeat } = seat;
  expect(() => decodeSeat(badSeat)).toThrow();
  expect(() =>
    decodeSeat({
      ...seat,
      candidates: {
        published: '2026-11-09',
        url: 'https://www.vec.vic.gov.au/',
        list: [{ name: 'Test Candidate', party: 42 }],
      },
    }),
  ).toThrow();
  expect(() =>
    decodeOverview({
      ...overview,
      notice: {
        text: 'Notice',
        link: { label: 'More', url: 'http://bad.test' },
      },
    }),
  ).toThrow();
});

test('every saved API response in the fixture directory decodes without dropping rows', () => {
  const fs = jest.requireActual('node:fs') as typeof import('node:fs');
  const path = jest.requireActual('node:path') as typeof import('node:path');
  const dir = path.join(__dirname, '../scripts/fixtures/vic-election');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    expect(() =>
      'hits' in raw
        ? decodeFind(raw)
        : 'kind' in raw
          ? decodeSeat(raw)
          : decodeOverview(raw),
    ).not.toThrow();
  }
});
