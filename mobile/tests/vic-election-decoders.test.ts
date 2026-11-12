import overview from '../scripts/fixtures/vic-election/overview.json';
import seat from '../scripts/fixtures/vic-election/albert-park.json';
import finder from '../scripts/fixtures/vic-election/find-st-kilda.json';
import { AUTHORISATION_LINE } from '../src/design/authorisation';
import {
  decodeFind,
  decodeOverview,
  decodeSeat,
} from '../src/features/vic-election/decoders';
test('portal pins decode, ignore new keys and pin authorisation', () => {
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
    const decoded =
      'hits' in raw
        ? decodeFind(raw)
        : 'kind' in raw
          ? decodeSeat(raw)
          : decodeOverview(raw);
    expect(decoded).toEqual(raw);
  }
});

test('required nullable seat and member fields accept null but reject omission', () => {
  const nullableSeat = {
    ...seat,
    division_start: null,
    result: null,
    candidates: null,
  };
  expect(decodeSeat(nullableSeat)).toMatchObject({
    division_start: null,
    result: null,
    candidates: null,
  });
  for (const key of [
    'candidates',
    'result',
    'region',
    'formerly',
    'boundary_note',
    'division_start',
  ]) {
    const missing: Record<string, unknown> = { ...seat };
    delete missing[key];
    expect(() => decodeSeat(missing)).toThrow();
  }
  const member = {
    ...seat.members[0]!,
    party: null,
    speeches: null,
    speech_gap: null,
    votes: null,
  };
  expect(decodeSeat({ ...seat, members: [member] }).members[0]).toMatchObject(
    member,
  );
  for (const key of ['party', 'speeches', 'speech_gap', 'votes']) {
    const missing: Record<string, unknown> = { ...member };
    delete missing[key];
    expect(() => decodeSeat({ ...seat, members: [missing] })).toThrow();
  }
});

test('Council group metadata is optional, nullable and typed', () => {
  const withCandidate = (extra: Record<string, unknown>) => ({
    ...seat,
    candidates: {
      published: '2026-11-10',
      url: seat.source_url,
      list: [{ name: 'Test Candidate', party: null, ...extra }],
    },
  });
  for (const extra of [
    {},
    { group: 'A', group_name: 'Example Group' },
    { group: 'M', group_name: null },
    { group: null, group_name: null },
    { group: '', group_name: '' },
  ])
    expect(decodeSeat(withCandidate(extra)).candidates!.list[0]).toMatchObject(
      extra,
    );
  for (const extra of [{ group: 1 }, { group_name: [] }, { party: '' }])
    expect(() => decodeSeat(withCandidate(extra))).toThrow();
});
