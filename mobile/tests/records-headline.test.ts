// records.md 2.4: one cleaned title and one meta line for every record,
// wherever OPAX shows it (reader, Citation formats, Just added, Similar
// speeches, the ⋯ menu and Share).
import fixtures from '../scripts/fixtures/records/contracts.json';
import {
  decodeDocument,
  decodeRecent,
  firstSentences,
  metaLine,
  recentRecord,
  recordHeadline,
  shortStage,
} from '../src/features/records/model';
import { recordCaveat } from '../src/features/records/source';

const responses: Record<string, unknown> = fixtures.responses;
const doc = (slug: string) =>
  decodeDocument(responses[`/api/resource/${slug}`]);
const recent = decodeRecent(responses['/api/recent']);
const ISO = /\b\d{4}-\d{2}-\d{2}\b/;

test('no fixture title keeps an em dash or an ISO date', () => {
  const titles = [
    ...Object.entries(responses)
      .filter(([path]) => path.startsWith('/api/resource/'))
      .map(([path]) => recordHeadline(decodeDocument(responses[path]))),
    ...recent.map((item) => recordHeadline(recentRecord(item))),
  ];
  expect(titles.length).toBeGreaterThan(8);
  for (const title of titles) {
    expect(title).not.toContain('—');
    expect(title).not.toMatch(ISO);
    expect(title).not.toMatch(/division, \d{4}/);
  }
});

test('a speech title drops its dash; a speaker-and-date title says kind and date', () => {
  expect(recordHeadline(doc('speech-1205524'))).toBe(
    'Synthetic reader layout fixture: not a parliamentary quotation',
  );
  expect(recordHeadline(doc('speech-18098'))).toBe('Speech · 9 February 1999');
  expect(
    recordHeadline({
      slug: 'speech-1',
      title: 'Tony Burke — Budget speech — 2026-08-18',
    }),
  ).toBe('Budget speech');
  expect(
    recordHeadline({
      slug: 'press-1',
      title: 'Release — part two — and three',
    }),
  ).toBe('Release: part two, and three');
});

test('the records-07 division row reads its question; with no question, the chamber', () => {
  const row = recentRecord(
    recent.find((item) => item.slug === 'division-federal-senate-10701')!,
  );
  expect(recordHeadline(row)).toBe(
    'That the amendment on sheet 4005 be agreed to',
  );
  expect(metaLine(row)).toBe('Division · Senate · 19 Aug 2026');
  const stripped = {
    ...row,
    title:
      'Senate division, 2026-08-19: Sue Lines Pursuant to the order agreed to on 18 August, the time allotted has expired. I will now put the question.',
  };
  expect(recordHeadline(stripped)).toBe('Senate division');
  expect(metaLine(stripped)).toBe('19 Aug 2026');
  expect(metaLine(stripped, { date: false })).toBe('');
});

test('a division that carries its bill is titled by the bill', () => {
  const division = doc('division-federal-senate-10701');
  expect(recordHeadline(division)).toBe(
    'Interactive Gambling (Cost Recovery Levy) Bill 2026',
  );
  expect(metaLine(division, { date: false })).toBe('Division · Senate');
  const item = decodeRecent({
    items: [
      {
        slug: 'division-federal-senate-10701',
        title:
          'Senate division, 2026-08-19: The question is that the bill be read a second time.',
        indexed: '2026-10-07',
        bill_ref: 'Interactive Gambling (Cost Recovery Levy) Bill 2026',
      },
    ],
  })[0]!;
  expect(recordHeadline(recentRecord(item))).toBe(
    'Interactive Gambling (Cost Recovery Levy) Bill 2026',
  );
});

test('a reader meta line carries no date; rows keep theirs', () => {
  const speech = doc('speech-1205524');
  expect(metaLine(speech, { date: false })).toBe(
    'Speech · House of Representatives',
  );
  expect(metaLine(speech)).toBe(
    'Speech · House of Representatives · 18 Aug 2026',
  );
  expect(metaLine(doc('press-pmt-reader-fixture'), { date: false })).toBe(
    'Government release',
  );
  expect(
    metaLine(doc('bill-text-au-federal-r7534-aspassed'), { date: false }),
  ).toMatch(/^Bill text · /);
  expect(metaLine(doc('speech-18098'))).toBe('House of Representatives');
});

test('Just added reads the kind from the slug and tolerates one bad row', () => {
  const rows = recent.map(recentRecord);
  expect(rows.map((row) => metaLine(row).split(' · ')[0])).toEqual([
    'Speech',
    'Division',
    'Government release',
  ]);
  const feed = decodeRecent({
    items: [
      { slug: 'speech-1205524', title: 'A speech', indexed: '2026-10-07' },
      { slug: '../bad', title: 'Bad' },
    ],
  });
  expect(feed).toHaveLength(1);
  expect(feed.partial).toBe(true);
  expect(recent.partial).toBeUndefined();
});

test('the transcription caveat is one short line', () => {
  const caveat = recordCaveat({
    ...doc('speech-1205524'),
    labels: { kind: 'speech', source: 'openaustralia' },
  });
  expect(caveat).toBe(
    'Third-party transcription. Check Hansard before quoting.',
  );
  expect(caveat!.length).toBeLessThanOrEqual(60);
  expect(recordCaveat(doc('speech-1205524'))).toBeNull();
});

test('short stages and the three-sentence clamp', () => {
  expect(shortStage({ stage_label: 'As passed by both houses' })).toBe(
    'As passed',
  );
  expect(shortStage({ stage_label: 'First reading — synthetic fixture' })).toBe(
    'As introduced',
  );
  expect(shortStage({ stage_label: 'Exposure draft' })).toBe('Exposure draft');
  expect(
    firstSentences([
      'One thing. Two things.',
      'Three things in the Act 2026. Four.',
    ]),
  ).toEqual(['One thing.', 'Two things.', 'Three things in the Act 2026.']);
});
