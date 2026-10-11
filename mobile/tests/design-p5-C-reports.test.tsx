/* eslint-disable @typescript-eslint/no-require-imports -- Jest factories build isolated fixture clients before app imports. */
import { act } from 'react';
import { useWindowDimensions } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  Button,
  LinkRow,
  PartyLabel,
  Section,
  SourceLine,
  Text,
  ViewOriginal,
} from '../src/design/primitives';
import ReportPage from '../src/features/reports/ReportPage';
import TopicsIndex from '../src/features/reports/TopicsIndex';
import TopicPage from '../src/features/reports/TopicPage';
import {
  FromRecord,
  TodayCoverage,
} from '../src/features/reports/TodayReports';
import {
  ExplorePhotoCredits,
  photoOriginals,
} from '../src/features/explore/PhotoCredits';
import {
  numberedSections,
  partyName,
  sectionHeading,
  decodeReport,
} from '../src/features/reports/model';
import type { YearPicture } from '../src/features/explore/pictures';

// Design programme pass 5, lane C (docs/design/review-2026-10/
// pass5-app-critique.md): topic parties by name (P2-14), report section
// headings by short name (P3-13), topics no speech carries yet apart
// (P3-12), and the last provenance recipes in reports and Explore drawn as
// one source line (guard census).
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: { Screen: jest.fn(() => null) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../src/api/runtime', () => {
  const { ReportsRepository } = require('../src/features/reports/repository');
  const { pinnedBytes } = require('./pinned');
  const fixture = require('../scripts/reports-fixture').reportsFixture(
    pinnedBytes,
  );
  // The live topic facet gives parties as dense codes, not names.
  const coded = (path: string, raw: unknown) =>
    path === '/api/topic/gambling'
      ? {
          ...(raw as object),
          parties: [
            ['IND', 129],
            ['ALP', 41],
            ['LP', 7],
          ],
        }
      : raw;
  const get = jest.fn(
    async (path: string, decode: (v: unknown) => unknown) => ({
      data: decode(
        coded(
          path,
          JSON.parse((fixture(path) ?? pinnedBytes(path)).toString()),
        ),
      ),
      stale: false,
      savedAt: 100,
      asOf: null,
    }),
  );
  return {
    reports: new ReportsRepository({ get, getForAction: get }),
    apiClient: { get },
  };
});
const picture = (over: Partial<YearPicture>): YearPicture => ({
  file: 'years/pictures/2001/one.webp',
  width: 4,
  height: 3,
  caption: 'Parliament House at dusk',
  event: 'Example event',
  date: null,
  author: 'A Commons contributor',
  credit: 'Wikimedia Commons',
  licence: 'CC BY-SA 4.0',
  licence_url: 'http://creativecommons.org/licenses/by-sa/4.0/',
  source_url: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
  original_url: 'https://upload.wikimedia.org/example.jpg',
  ...over,
});
jest.mock('../src/features/explore/runtime', () => ({
  explore: {
    pictures: jest.fn(async () => ({
      data: {
        '2001': [
          picture({}),
          picture({
            file: 'years/pictures/2001/two.webp',
            caption: 'A second photograph',
            licence: 'Public domain',
            licence_url: null,
          }),
        ],
      },
      stale: false,
      savedAt: 100,
      asOf: null,
    })),
  },
}));

beforeEach(() => {
  Object.keys(mockParams).forEach((k) => delete mockParams[k]);
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
});
async function render(Screen: () => React.ReactElement | null) {
  let rendered!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    rendered = TestRenderer.create(<Screen />);
  });
  for (let i = 0; i < 3; i++)
    await act(async () => {
      await Promise.resolve();
    });
  return rendered;
}
type Instance = TestRenderer.ReactTestInstance;
const words = (node: Instance) =>
  node
    .findAllByType(Text)
    .flatMap((t) => [t.props.children].flat())
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .join(' ');

describe('P2-14: topic parties are named, never coded', () => {
  test('known codes read as the party name; anything else as recorded', () => {
    expect(partyName('ALP')).toBe('Labor');
    expect(partyName('IND')).toBe('Independent');
    expect(partyName('GRN')).toBe('Greens');
    expect(partyName('ONP')).toBe('One Nation');
    expect(partyName('CLP')).toBe('Country Liberal Party');
    // Names already given stay as given; unknown codes are not guessed.
    expect(partyName('Labor')).toBe('Labor');
    expect(partyName('LP')).toBe('Liberal');
    expect(partyName('Some Local Party')).toBe('Some Local Party');
    expect(partyName(' Nationals ')).toBe('Nationals');
  });

  test('the party rows draw PartyLabel with the name, and open by the code', async () => {
    mockParams.slug = 'gambling';
    const r = await render(TopicPage);
    const block = r.root
      .findAllByType(Section)
      .find((s) => s.props.testID === 'topic-parties')!;
    const labels = block.findAllByType(PartyLabel);
    expect(labels.map((l) => l.props.party)).toEqual([
      'Independent',
      'Labor',
      'Liberal',
    ]);
    for (const label of labels) {
      // Not the dense form ("IND"): the dot and the party's name.
      expect(label.props.dense).toBeFalsy();
      expect(label.props.nested).toBe(true);
    }
    const drawn = words(block);
    expect(drawn).toContain('Independent');
    expect(drawn).toContain('Labor');
    expect(drawn).not.toMatch(/\b(IND|ALP)\b/);
    const rows = block
      .findAllByType(LinkRow)
      .filter((row) => String(row.props.testID).startsWith('topic-party-row'));
    expect(rows[1]!.props.accessibilityLabel).toBe('Labor, 41 speeches');
    await act(async () => r.unmount());
  });
});

describe('P3-13: report section headings take the short name', () => {
  const { pinnedBytes } = require('./pinned');
  const fixture = require('../scripts/reports-fixture').reportsFixture(
    pinnedBytes,
  );
  const report = decodeReport(
    JSON.parse(
      (
        fixture('/reports/gambling.json') ??
        pinnedBytes('/reports/gambling.json')
      ).toString(),
    ),
  );

  test('an era is headed by its span; the question is said first, in full', () => {
    expect(
      sectionHeading({
        label: '2010–2019',
        question:
          'How did policy and public debate develop between 2010 and 2019? The debates of the period included one bill.',
      }),
    ).toEqual({
      heading: '2010–2019',
      lead: 'How did policy and public debate develop between 2010 and 2019? The debates of the period included one bill.',
    });
  });

  test('without a short name, the heading is the first sentence and the rest leads', () => {
    expect(
      sectionHeading({
        question: 'What has parliament said? The debates included two bills.',
      }),
    ).toEqual({
      heading: 'What has parliament said?',
      lead: 'The debates included two bills.',
    });
    expect(sectionHeading({ question: 'What has parliament said?' })).toEqual({
      heading: 'What has parliament said?',
      lead: null,
    });
  });

  test('every section in the export gets a heading of one sentence', () => {
    for (const { item } of numberedSections(report)) {
      const { heading, lead } = sectionHeading(item);
      expect(heading).not.toMatch(/[?.!]\s+\S/);
      // Nothing is dropped: the heading and lead together say the question.
      expect(
        item.label ? lead : [heading, lead].filter(Boolean).join(' '),
      ).toBe(item.question.trim());
    }
  });

  test('an era section draws its span as heading and the question as its first sentence', async () => {
    const era = numberedSections(report).find((s) => s.tab === 'over')!;
    Object.assign(mockParams, {
      slug: 'gambling',
      section: String(era.number),
    });
    const r = await render(ReportPage);
    const section = r.root
      .findAllByType(Section)
      .find((s) => s.props.testID === `report-section-${era.number}`)!;
    expect(section.props.title).toBe(era.item.label);
    const question = section
      .findAllByType(Text)
      .find((t) => t.props.testID === `report-question-${era.number}`)!;
    expect(question.props.children).toBe(era.item.question);
    await act(async () => r.unmount());
  });

  test('the sections index names each section by its short heading', async () => {
    mockParams.slug = 'gambling';
    const r = await render(ReportPage);
    const rows = r.root
      .findAllByType(LinkRow)
      .filter((row) =>
        String(row.props.testID).startsWith('report-open-section-'),
      );
    const sections = numberedSections(report);
    expect(rows.map((row) => row.props.title)).toEqual(
      sections.map((s) => `${s.number}. ${sectionHeading(s.item).heading}`),
    );
    await act(async () => r.unmount());
  });
});

test('P3-12: topics no speech carries yet are listed apart, without a zero count', async () => {
  const r = await render(TopicsIndex);
  const unlabelled = r.root
    .findAllByType(Section)
    .find((s) => s.props.testID === 'topics-unlabelled')!;
  expect(unlabelled.props.title).toBe('Not yet labelled');
  const all = r.root
    .findAllByType(LinkRow)
    .filter((row) => String(row.props.testID).startsWith('topic-open-'));
  const apart = unlabelled
    .findAllByType(LinkRow)
    .filter((row) => String(row.props.testID).startsWith('topic-open-'));
  expect(apart.length).toBeGreaterThan(0);
  expect(apart.length).toBeLessThan(all.length);
  for (const row of all)
    expect(String(row.props.detail ?? '')).not.toMatch(/^0 speeches/);
  for (const row of apart)
    expect(String(row.props.detail ?? '')).not.toMatch(/speeches|%/);
  // The list's one source line sits under the counted list, not under the
  // topics without a count.
  expect(
    unlabelled
      .findAllByType(SourceLine)
      .filter((s) => s.props.testID === 'topics-as-at'),
  ).toHaveLength(0);
  expect(
    r.root
      .findAllByType(SourceLine)
      .filter((s) => s.props.testID === 'topics-as-at'),
  ).toHaveLength(1);
  await act(async () => r.unmount());
});

describe('guard census: one source line per block', () => {
  test('Today coverage: the notes are in the source line, not an ⓘ', async () => {
    const r = await render(TodayCoverage);
    const section = r.root.findByType(Section);
    expect(section.props.info).toBeUndefined();
    expect(section.props.title).toBe('Collection and coverage');
    const line = r.root
      .findAllByType(SourceLine)
      .find((s) => s.props.testID === 'today-coverage-as-at')!;
    expect(line.props.notes).toHaveLength(2);
    await act(async () => r.unmount());
  });

  test('From the record: one source line with its notes and, off OPAX, the original', async () => {
    const r = await render(FromRecord);
    expect(r.root.findByType(Section).props.info).toBeUndefined();
    expect(r.root.findAllByType(ViewOriginal)).toHaveLength(0);
    const line = () =>
      r.root
        .findAllByType(SourceLine)
        .filter((s) => s.props.testID === 'from-record-source');
    expect(line()).toHaveLength(1);
    expect(line()[0]!.props.notes).toHaveLength(1);
    expect(line()[0]!.props.originals).toBeUndefined();
    // The second entry lives on GrantConnect: its original is in the sheet.
    const button = r.root
      .findAllByType(Button)
      .find((n) => n.props.testID === 'from-record-next')!;
    await act(async () => button.props.onPress());
    expect(line()).toHaveLength(1);
    expect(line()[0]!.props.originals).toEqual([
      expect.objectContaining({
        url: expect.stringMatching(/^https:\/\/www\.grants\.gov\.au\//),
      }),
    ]);
    expect(
      r.root.findAll((n) => n.props.testID === 'from-record-open'),
    ).toHaveLength(0);
    await act(async () => r.unmount());
  });

  test('photo credits: one source line per photograph, the licence over https', async () => {
    expect(photoOriginals(picture({}))).toEqual([
      {
        label: 'Photo source',
        record: 'Wikimedia Commons',
        url: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
      },
      {
        label: 'Licence',
        record: 'CC BY-SA 4.0',
        url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      },
    ]);
    expect(photoOriginals(picture({ licence_url: null }))).toHaveLength(1);
    const r = await render(ExplorePhotoCredits);
    const toggle = r.root.findAll(
      (n) =>
        n.props.testID === 'explore-photo-credits' &&
        typeof n.props.onPress === 'function',
    )[0]!;
    await act(async () => toggle.props.onPress());
    for (let i = 0; i < 3; i++)
      await act(async () => {
        await Promise.resolve();
      });
    const lines = r.root
      .findAllByType(SourceLine)
      .filter((s) =>
        String(s.props.testID).startsWith('explore-photo-source-'),
      );
    expect(lines.map((l) => l.props.label)).toEqual([
      'Photo source and licence',
      'Photo source',
    ]);
    await act(async () => r.unmount());
  });
});
