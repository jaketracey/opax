// A member's firsts: /people/firsts.json decoded, joined to a roster row and
// worded for the profile. The sample is the portal export's own output for
// its synthetic database (scripts/test_export_people_firsts.py on the portal
// branch), copied byte for byte: the digest below is the one the portal's
// people-firsts.test.mjs pins, so the two sides cannot drift apart unseen.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeRoster } from '../src/api/catalog-decoders';
import {
  forgetCatalogs,
  keepCatalog,
  keptCatalogs,
} from '../src/api/kept-catalogs';
import {
  decodePeopleFirsts,
  memberFirsts,
  PEOPLE_FIRSTS_PATH,
} from '../src/api/people-firsts';
import { assertAllowedPath } from '../src/api/policy';
import { isRecordSlug } from '../src/api/record-policy';
import { isPartialCatalog } from '../src/api/validation';
import { firstRows } from '../src/features/people/firsts';
import {
  PROFILE_PRELOAD,
  TODAY_PRELOAD,
} from '../src/features/people/profile-preload';

const text = readFileSync(
  join(__dirname, 'fixtures', 'people-firsts.sample.json'),
  'utf8',
);
const sample = () => JSON.parse(text) as Record<string, any>;

test('the sample is the portal export’s own, byte for byte', () => {
  expect(createHash('sha256').update(text).digest('hex')).toBe(
    'e9409b8e200fb347ffcd43b48ddd6134303984ecf547f714d2a3c02320786393',
  );
});

test('the export decodes whole, and each fact carries its source and its claim', () => {
  const firsts = decodePeopleFirsts(sample());
  expect(isPartialCatalog(firsts)).toBe(false);
  // Entered the House inside its record: both are firsts.
  expect(memberFirsts(firsts, { name: 'Avery Example', pid: '90001' })).toEqual(
    {
      speech: {
        date: '2008-02-12',
        slug: 'speech-11',
        source: 'Hansard, as held in the OPAX record',
        first: true,
      },
      division: {
        date: '2008-02-13',
        url: 'https://theyvoteforyou.org.au/divisions/representatives/2008-02-13/1',
        source: 'They Vote For You',
        first: true,
      },
    },
  );
  // The speech opens in the record reader: its slug is a public record's.
  expect(isRecordSlug('speech-11')).toBe(true);
});

test('a member from before the record starts has an earliest speech and division, with the year each record starts, never a first', () => {
  const firsts = decodePeopleFirsts(sample());
  // Entered the Senate in 1996; its speeches are held from 2011 and its
  // divisions from 2006 in the sample.
  expect(memberFirsts(firsts, { name: 'Blair Sample', pid: '90002' })).toEqual({
    speech: expect.objectContaining({ first: false, recordFrom: 2011 }),
    division: expect.objectContaining({ first: false, recordFrom: 2006 }),
  });
  // A speech long after entering is not a first; the prompt division is.
  expect(memberFirsts(firsts, { name: 'Kai Late', pid: '90011' })).toEqual({
    speech: expect.objectContaining({ first: false, recordFrom: 1995 }),
    division: expect.objectContaining({ first: true }),
  });
  // No roster id: never a first.
  // No roster id: never a first. The NSW Assembly's speeches have a start
  // in the sample; its divisions have none, so that row is left out.
  expect(memberFirsts(firsts, { name: 'Casey Specimen' })).toEqual({
    speech: expect.objectContaining({ first: false, recordFrom: 2019 }),
  });
  // A member who returned after service from before the record, and one
  // who moved chamber: the export marks neither, so neither is a first.
  expect(memberFirsts(firsts, { name: 'Noel Returner', pid: '90014' })).toEqual(
    {
      speech: expect.objectContaining({
        date: '1998-11-10',
        first: false,
        recordFrom: 1995,
      }),
    },
  );
  expect(memberFirsts(firsts, { name: 'Oakley Both', pid: '90015' })).toEqual({
    speech: expect.objectContaining({ first: false, recordFrom: 2011 }),
  });
  // A chamber with no dense year has no start: nothing to say from when.
  expect(memberFirsts(firsts, { name: 'Drew Twin' })).toBeNull();
  expect(memberFirsts(firsts, { name: 'Emery Twin' })).toBeNull();
});

test('"first" is only ever the export’s flag, and an earliest fact with no coverage year is left out', () => {
  const doc = sample();
  // Anything but true is not the claim.
  doc.by_pid['90001'].first_speech.first = false;
  doc.by_pid['90011'].first_division.first = 'yes';
  // The chamber's coverage is missing, or later than the fact it holds.
  delete doc.meta.coverage.speeches.senate;
  doc.meta.coverage.divisions.senate = '2012-01-01';
  delete doc.by_name['Casey Specimen'].first_speech.chamber;
  const firsts = decodePeopleFirsts(doc);
  expect(
    memberFirsts(firsts, { name: 'A', pid: '90001' })?.speech,
  ).toMatchObject({ first: false, recordFrom: 1995 });
  // The unreadable flag drops that fact; the speech stands.
  expect(memberFirsts(firsts, { name: 'K', pid: '90011' })).toEqual({
    speech: expect.objectContaining({ first: false }),
  });
  expect(memberFirsts(firsts, { name: 'B', pid: '90002' })).toBeNull();
  expect(memberFirsts(firsts, { name: 'Casey Specimen' })).toBeNull();
  // A file with no coverage at all (never exported so): only flagged firsts.
  const bare = sample();
  delete bare.meta.coverage;
  const flagged = decodePeopleFirsts(bare);
  expect(
    memberFirsts(flagged, { name: 'A', pid: '90001' })?.speech?.first,
  ).toBe(true);
  expect(memberFirsts(flagged, { name: 'B', pid: '90002' })).toBeNull();
});

test('a row with a roster id is found by it and never by its name; a row without one by its exact name', () => {
  const firsts = decodePeopleFirsts(sample());
  expect(memberFirsts(firsts, { name: 'Casey Specimen' })?.speech?.date).toBe(
    '2019-05-07',
  );
  expect(
    memberFirsts(firsts, { name: 'Casey Specimen', pid: '777' }),
  ).toBeNull();
  expect(memberFirsts(firsts, { name: 'casey specimen' })).toBeNull();
  expect(memberFirsts(firsts, { name: 'Avery Example' })).toBeNull();
  expect(memberFirsts(firsts, { name: 'toString' })).toBeNull();
  expect(memberFirsts(firsts, { name: 'x', pid: 'constructor' })).toBeNull();
  expect(memberFirsts(firsts, null)).toBeNull();
  expect(
    memberFirsts(undefined, { name: 'Avery Example', pid: '90001' }),
  ).toBeNull();
  // Only one fact held: only that one.
  expect(memberFirsts(firsts, { name: 'L', pid: '90012' })).toEqual({
    speech: expect.objectContaining({ slug: 'speech-91' }),
  });
});

test('a fact that cannot be read or has no named source is left out; the other stands', () => {
  const doc = sample();
  doc.by_pid['90001'].first_speech.slug = 'legal-12';
  doc.by_pid['90002'].first_division.url = 'http://example.org/division';
  doc.by_name['Casey Specimen'].first_division.source = 'unnamed';
  doc.by_name['Emery Twin'].first_division.date = '11 Feb 2015';
  const firsts = decodePeopleFirsts(doc);
  expect(memberFirsts(firsts, { name: 'A', pid: '90001' })).toEqual({
    division: expect.objectContaining({ date: '2008-02-13' }),
  });
  expect(memberFirsts(firsts, { name: 'B', pid: '90002' })).toEqual({
    speech: expect.objectContaining({ slug: 'speech-21' }),
  });
  expect(memberFirsts(firsts, { name: 'Casey Specimen' })).toEqual({
    speech: expect.objectContaining({ slug: 'speech-30' }),
  });
  expect(memberFirsts(firsts, { name: 'Emery Twin' })).toBeNull();
  expect(isPartialCatalog(firsts)).toBe(false);
});

test('added fields are ignored, and a canonical id is never a key', () => {
  // The canonical key is dropped as a malformed row, which is logged.
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const doc = sample();
  doc.meta.extra = { anything: true };
  doc.by_pid['90001'].first_question = { date: '2008-02-20' };
  doc.by_pid['90001'].first_speech.topic = 'A bill';
  doc.by_pid.person_9c02d321caef54b2ba21a1f8 = doc.by_pid['90002'];
  const firsts = decodePeopleFirsts(doc);
  expect(Object.keys(firsts.by_pid)).not.toContain(
    'person_9c02d321caef54b2ba21a1f8',
  );
  expect(Object.keys(firsts.by_pid)).toContain('90002');
  expect(memberFirsts(firsts, { name: 'A', pid: '90001' })?.speech).toEqual({
    date: '2008-02-12',
    slug: 'speech-11',
    source: 'Hansard, as held in the OPAX record',
    first: true,
  });
  expect(() => decodePeopleFirsts({ ...doc, meta: {} })).toThrow();
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

test('the roster the apps already read is untouched: its decoder needs nothing from this file', () => {
  // The firsts are a side file; a roster row decodes exactly as before.
  const roster = decodeRoster({
    meta: { generated: '2026-11-14' },
    people: [{ name: 'Avery Example', pid: '90001' }],
  });
  expect(roster.people[0]).toMatchObject({
    name: 'Avery Example',
    pid: '90001',
  });
  expect(
    memberFirsts(decodePeopleFirsts(sample()), roster.people[0]!)?.speech?.slug,
  ).toBe('speech-11');
});

test('the rows say First only for a first, Earliest in the OPAX record with its year otherwise, and never rank or compare', () => {
  const firsts = decodePeopleFirsts(sample());
  const first = firstRows(memberFirsts(firsts, { name: 'A', pid: '90001' }));
  expect(first.map((row) => [row.kind, row.title, row.detail])).toEqual([
    [
      'first-speech',
      'First speech: 12\u00a0Feb\u00a02008',
      'Hansard, as held in the OPAX record',
    ],
    [
      'first-division',
      'First division: 13\u00a0Feb\u00a02008',
      'They Vote For You',
    ],
  ]);
  expect(first[0]!.href).toEqual({
    pathname: '/doc/[slug]',
    params: { slug: 'speech-11' },
  });
  expect(first[0]!.external).toBeUndefined();
  expect(first[1]!.external?.url).toBe(
    'https://theyvoteforyou.org.au/divisions/representatives/2008-02-13/1',
  );
  // VoiceOver hears the long date and the source, with plain spaces.
  expect(first.map((row) => row.accessibilityLabel)).toEqual([
    'First speech, 12 February 2008. Source: Hansard, as held in the OPAX record',
    'First division, 13 February 2008. Source: They Vote For You',
  ]);
  const earliest = firstRows(memberFirsts(firsts, { name: 'B', pid: '90002' }));
  expect(earliest.map((row) => row.title)).toEqual([
    'Earliest speech in the OPAX record (from 2011): 16\u00a0Aug\u00a02011',
    'Earliest division in the OPAX record (from 2006): 17\u00a0Aug\u00a02011',
  ]);
  expect(earliest.map((row) => row.accessibilityLabel)).toEqual([
    'Earliest speech in the OPAX record, which starts in 2011, 16 August 2011. Source: Hansard, as held in the OPAX record',
    'Earliest division in the OPAX record, which starts in 2006, 17 August 2011. Source: They Vote For You',
  ]);
  for (const row of [...first, ...earliest]) {
    const words = [
      row.title,
      row.detail,
      row.accessibilityLabel,
      row.accessibilityHint,
    ].join(' ');
    expect(words).not.toMatch(
      /first ever|youngest|oldest|longest|\bmost\b|\u2014/i,
    );
    // An earliest fact is never called a first.
    if (/Earliest/.test(row.title)) expect(words).not.toMatch(/first/i);
  }
  expect(firstRows(null)).toEqual([]);
  expect(
    firstRows(memberFirsts(firsts, { name: 'L', pid: '90012' })),
  ).toHaveLength(1);
});

test('the file is a public static read, kept in memory, and read ahead by Today after the profile’s four', () => {
  expect(() => assertAllowedPath(PEOPLE_FIRSTS_PATH)).not.toThrow();
  expect(() => assertAllowedPath('/people/other.json')).toThrow();
  forgetCatalogs();
  const firsts = decodePeopleFirsts(sample());
  keepCatalog(PEOPLE_FIRSTS_PATH, firsts);
  expect(keptCatalogs().firsts).toBe(firsts);
  forgetCatalogs();
  expect(keptCatalogs().firsts).toBeUndefined();
  expect(TODAY_PRELOAD.map(({ path }) => path)).toEqual([
    ...PROFILE_PRELOAD.map(({ path }) => path),
    PEOPLE_FIRSTS_PATH,
  ]);
  expect(PROFILE_PRELOAD.map(({ path }) => path)).not.toContain(
    PEOPLE_FIRSTS_PATH,
  );
});
