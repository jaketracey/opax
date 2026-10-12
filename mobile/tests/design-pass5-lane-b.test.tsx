// Design pass 5, lane B (docs/design/review-2026-10/pass5-app-critique.md):
// profiles and places. Each test names the critique item it holds.
import { catalogs as runtime } from '../src/api/runtime';
import { act, type ReactElement } from 'react';
import TestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import * as c from '../src/api/catalogs';
import {
  catalogs,
  index,
  manifest,
  people,
  roster,
  slugs,
  pinned,
} from './pinned';
import Person from '../src/features/Person';
import YourMP from '../src/features/YourMP';
import Electorate, { censusCaveat } from '../src/features/Electorate';
import {
  BigFigure,
  Portrait,
  ReadableColumn,
  Section,
  SourceLine,
  Text,
} from '../src/design/primitives';
import {
  BlockSource,
  isOpaxDataset,
  opaxDatasetNote,
  representationBlock,
  sourceLicence,
} from '../src/features/your-mp/Evidence';
import {
  rosterName,
  serviceSpan,
} from '../src/features/directories/ElectorateHistory';
import { loadChoice } from '../src/features/your-mp/choice-store';
jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn() },
  catalogs: {
    person: jest.fn(),
    profileFor: jest.fn(),
    rosterProfileFor: jest.fn(),
    directory: jest.fn(),
    yourMP: jest.fn(),
    electorateFor: jest.fn(),
  },
}));
jest.mock('../src/features/your-mp/choice-store', () => ({
  loadChoice: jest.fn(),
  saveChoice: jest.fn(),
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
const mockParams: { slug?: string; id?: string } = {};
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), setParams: jest.fn() },
  Stack: { Screen: () => null },
}));
const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const directory = {
  manifest: result(manifest),
  people: result(people),
  roster: result(roster),
  slugs: result(slugs),
  electorates: result(index),
};
const mock = runtime as jest.Mocked<typeof runtime>;
async function render(element: ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  return r;
}
const pressable = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.findAll(
    (n) => n.props.testID === testID && typeof n.props.onPress === 'function',
  )[0]!;
const has = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.findAll((n) => n.props.testID === testID).length > 0;
const text = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(Text)
    .flatMap((n) => n.props.children)
    .filter((v) => typeof v === 'string')
    .join(' ')
    .replace(/\s+/g, ' ');
// Every source line's drawn words, by test ID.
const lines = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(SourceLine).map((n) => ({
    id: n.props.testID as string | undefined,
    words: text({ root: n } as unknown as TestRenderer.ReactTestRenderer),
  }));
const seat = () => index.electorates.find((s) => s.name === 'Grayndler')!;
async function albanese() {
  mockParams.slug = 'anthony-albanese';
  const identity = c.joinPerson(
    'anthony-albanese',
    slugs,
    roster,
    people,
    manifest,
  );
  mock.person.mockResolvedValue(result(identity));
  mock.profileFor.mockResolvedValue(
    c.profileFor(identity.canonicalPersonId!, catalogs),
  );
  return render(<Person />);
}
async function grayndler() {
  mockParams.id = seat().electorate_id;
  mock.electorateFor.mockResolvedValue(
    result(c.electorateFor(c.decodeElectorate(pinned(seat().detail_url)))),
  );
  return render(<Electorate />);
}
beforeEach(() => {
  jest.clearAllMocks();
  Object.values(mock).forEach((fn) => fn.mockReset());
  mock.directory.mockResolvedValue(directory);
});

describe('profile', () => {
  test('P1-4: the portrait wears no party ring; the colour is the PartyLabel dot', async () => {
    const r = await albanese();
    const portrait = r.root.findAllByType(Portrait)[0]!;
    expect(portrait.props).not.toHaveProperty('ring');
    for (const view of r.root.findAll(
      (n) => typeof n.type === 'string' && n.props.style,
    ))
      expect(StyleSheet.flatten(view.props.style)?.borderWidth).not.toBe(3);
    await act(async () => r.unmount());
  });

  test('P2-1: topics, speeches, mentions and news are rows of one section, not four one-row sections', async () => {
    const r = await albanese();
    const titles = r.root.findAllByType(Section).map((s) => s.props.title);
    expect(titles).toContain('More from the record');
    for (const one of [
      'What they talk about',
      'Latest indexed speeches',
      'Mentions in parliament',
      'News headlines',
    ])
      expect(titles).not.toContain(one);
    expect(text(r)).not.toMatch(/\bShow (topics|speeches|news|mentions)\b/);
    for (const id of [
      'person-topics-toggle',
      'person-speeches-toggle',
      'person-mentions-toggle',
      'people-news-toggle',
    ])
      expect(has(r, id)).toBe(true);
    // The block order is otherwise unchanged (P2-2 waits for a decision):
    // receipts, votes, interests, then pay and expenses, then the rows.
    const order = titles.filter((t) =>
      [
        'Party receipts',
        'Voting record',
        'Declared interests',
        'Pay for the posts held',
        'Claimed expenses',
        'More from the record',
      ].includes(t),
    );
    expect(order).toEqual([
      'Party receipts',
      'Voting record',
      'Declared interests',
      'Pay for the posts held',
      'Claimed expenses',
      'More from the record',
    ]);
    await act(async () => r.unmount());
  });

  test('P3-4: declared ties fold into Declared interests, with no source line of their own', async () => {
    mockParams.slug = 'penny-wong';
    const person = c.joinPerson('penny-wong', slugs, roster, people, manifest);
    mock.person.mockResolvedValue(result(person));
    mock.profileFor.mockResolvedValue(
      c.profileFor(person.canonicalPersonId!, {
        ...catalogs,
        interest: c.decodeInterest(pinned('/interests/10678.json')),
      }),
    );
    const r = await render(<Person />);
    const titles = r.root.findAllByType(Section).map((s) => s.props.title);
    expect(titles).not.toContain('Declared ties');
    expect(has(r, 'person-ties-source')).toBe(false);
    const interests = r.root.find((n) => n.props.testID === 'person-interests');
    expect(
      interests.findAll(
        (n) =>
          n.props.testID === 'person-ties' ||
          n.props.testID === 'person-ties-missing',
      ).length,
    ).toBeGreaterThan(0);
    await act(async () => r.unmount());
  });

  test('P2-4: the identity sheet names OPAX’s people list in its notes, never as an original record', async () => {
    const r = await albanese();
    const identity = lines(r).find((l) => l.id === 'person-source')!;
    expect(identity.words).not.toContain('OPAX existing parliamentary person');
    await act(async () => pressable(r, 'person-source').props.onPress());
    const sheet = text(r);
    expect(sheet).toContain('Matched to OPAX’s people list.');
    expect(sheet).not.toContain(
      'OPAX existing parliamentary person identifiers',
    );
    const originals = r.root
      .findAllByType(SourceLine)
      .find((n) => n.props.testID === 'person-source')!.props.originals as {
      url: string;
    }[];
    expect(originals.some((o) => o.url.includes('opax.com.au'))).toBe(false);
    await act(async () => r.unmount());
  });

  test('P3-3: money figures take the money accent (expenses, and pay where it is drawn)', async () => {
    const r = await albanese();
    const money = r.root
      .findAllByType(BigFigure)
      .filter((f) => String(f.props.value).startsWith('$'));
    expect(money.length).toBeGreaterThan(0);
    for (const figure of money) expect(figure.props.accent).toBe('money');
    await act(async () => r.unmount());
  });

  test('P2-22: the figure strip keeps the readable width', async () => {
    const r = await albanese();
    const strip = r.root.find((n) => n.props.testID === 'person-figures');
    let node: TestRenderer.ReactTestInstance | null = strip;
    let inColumn = false;
    while (node) {
      if (node.type === ReadableColumn) inColumn = true;
      node = node.parent;
    }
    expect(inColumn).toBe(true);
    await act(async () => r.unmount());
  });

  test('P2-5: profile source lines carry no ISO dates or pipeline words', async () => {
    const r = await albanese();
    for (const { words } of lines(r)) {
      expect(words).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(words).not.toMatch(/\btcp\b|parli\.db|OPAX import/);
    }
    await act(async () => r.unmount());
  });
});

describe('electorate', () => {
  test('P2-7: the header has no source line; the outline has one, with no ⓘ or bare View original', async () => {
    const r = await grayndler();
    expect(has(r, 'electorate-source')).toBe(false);
    expect(has(r, 'outline-info')).toBe(false);
    const outline = lines(r).find((l) => l.id === 'outline-source')!;
    expect(outline.words).toMatch(/2025 election boundary/);
    expect(outline.words).toContain('AEC');
    expect(text(r)).not.toContain('View original');
    await act(async () => pressable(r, 'outline-source').props.onPress());
    expect(text(r)).toContain('Not for address allocation.');
    await act(async () => r.unmount());
  });

  test('P2-7: one Census heading and one caveat; representation names its own sources', async () => {
    const r = await grayndler();
    const titles = r.root.findAllByType(Section).map((s) => s.props.title);
    expect(titles).toContain('Census 2021');
    expect(titles).not.toContain('Local context');
    expect(text(r)).not.toContain('2021 Census geography');
    expect(text(r)).toContain(
      'Values have not been redistributed to current boundaries.',
    );
    const representation = lines(r).find(
      (l) => l.id === 'electorate-representatives-source',
    )!;
    expect(representation.words).not.toContain('AEC election results');
    for (const { words } of lines(r))
      expect(words).not.toMatch(/\d{4}-\d{2}-\d{2}|\btcp\b/);
    await act(async () => r.unmount());
  });

  test('P3-5: open service periods and capitalised roster names read as written', async () => {
    const r = await grayndler();
    expect(text(r)).not.toContain('end not recorded');
    expect(text(r)).toMatch(/Since \d+ \w+ \d{4} \(current at /);
    expect(text(r)).not.toMatch(/\b[A-Z]{3,} Mc[A-Z]{3,}\b/);
    await act(async () => r.unmount());
  });
});

describe('Your MP chooser', () => {
  test('P2-20 and P3-1: the field comes first, with no helper line repeating its label; location follows with one privacy line', async () => {
    (loadChoice as jest.Mock).mockResolvedValue(null);
    const r = await render(<YourMP />);
    const ids = r.root
      .findAll((n) => typeof n.props.testID === 'string')
      .map((n) => n.props.testID as string);
    const field = ids.indexOf('seat-search');
    const location = ids.indexOf('use-my-location');
    expect(field).toBeGreaterThanOrEqual(0);
    expect(location).toBeGreaterThan(field);
    expect(ids).not.toContain('seat-empty');
    expect(text(r)).not.toContain('Search by electorate or member name.');
    expect(text(r)).toContain('Used once on this iPhone; not sent or saved.');
    expect(text(r)).not.toContain('It is not sent, saved or logged.');
    await act(async () => pressable(r, 'location-privacy').props.onPress());
    expect(text(r)).toContain('It is not sent, saved or logged.');
    await act(async () => r.unmount());
  });
});

describe('source helpers', () => {
  test('OPAX’s own datasets are notes; an OPAX label over an outside record stays an original', () => {
    expect(isOpaxDataset({ url: 'https://opax.com.au/subject/person' })).toBe(
      true,
    );
    expect(isOpaxDataset({ url: '/subject/person' })).toBe(true);
    expect(
      isOpaxDataset({ url: 'https://www.aph.gov.au/Senators_and_Members' }),
    ).toBe(false);
    expect(
      opaxDatasetNote('OPAX existing parliamentary person identifiers'),
    ).toBe('Matched to OPAX’s people list.');
    expect(opaxDatasetNote('OPAX parliamentary roster')).toBe(
      'Matched to OPAX’s parliamentary roster.',
    );
    expect(opaxDatasetNote('OPAX electorate release')).toBe(
      'From OPAX’s electorate release.',
    );
  });

  test('P2-6: a licence appended to a source name goes to the licence row', async () => {
    expect(
      sourceLicence({ label: 'AEC disclosure returns, CC BY 4.0' }),
    ).toEqual({ label: 'AEC disclosure returns', licence: 'CC BY 4.0' });
    expect(
      sourceLicence({ label: 'Register, CC BY 3.0 AU', licence: null }),
    ).toEqual({ label: 'Register', licence: 'CC BY 3.0 AU' });
    expect(sourceLicence({ label: 'They Vote For You' })).toEqual({
      label: 'They Vote For You',
      licence: null,
    });
    const r = await render(
      <BlockSource
        testID="fixture-source"
        block={{
          asAt: '2026-09-09',
          sources: [
            { label: 'OPAX parliamentary roster', url: '/subject/person' },
            {
              label: 'AEC disclosure returns, CC BY 4.0',
              url: 'https://transparency.aec.gov.au/',
            },
          ],
          stale: false,
          savedAt: null,
        }}
      />,
    );
    const line = r.root.findByType(SourceLine).props;
    expect(line.citation).toEqual(['AEC disclosure returns']);
    expect(line.licence).toBe('CC BY 4.0');
    expect(line.originals).toEqual([
      {
        label: 'AEC disclosure returns',
        url: 'https://transparency.aec.gov.au/',
      },
    ]);
    expect(line.notes).toContain('Matched to OPAX’s parliamentary roster.');
    await act(async () => r.unmount());
  });

  test('representation drops the election, Census and boundary files', () => {
    const block = representationBlock({
      asAt: null,
      stale: false,
      savedAt: null,
      sources: [
        { label: 'AEC 2019-05-18 tcp votes', url: 'https://results.aec' },
        { label: 'ABS Census 2021 federal electorate profiles', url: 'x' },
        {
          label: 'AEC national boundaries used at the 2025 election',
          url: 'y',
        },
        { label: 'OpenAustralia parliamentary service records', url: 'z' },
      ],
    });
    expect(block.sources.map((s) => s.label)).toEqual([
      'OpenAustralia parliamentary service records',
    ]);
  });

  test('P3-5 and P2-7 copy helpers', () => {
    expect(
      serviceSpan({
        start: '1996-03-02',
        end: null,
        observed_through: '2026-09-09',
      }),
    ).toBe('Since 2 Mar 1996 (current at 9 Sep 2026)');
    expect(serviceSpan({ start: '1993-03-13', end: '1996-01-29' })).toBe(
      '13 Mar 1993 to 29 Jan 1996',
    );
    expect(rosterName('LEO McLEAY')).toBe('Leo McLeay');
    expect(rosterName('Jeannette McHugh')).toBe('Jeannette McHugh');
    expect(rosterName('Anthony Albanese')).toBe('Anthony Albanese');
    expect(
      censusCaveat(
        '2021 Census geography; values have not been redistributed to current boundaries.',
        '2021 Census geography',
      ),
    ).toBe('Values have not been redistributed to current boundaries.');
    expect(censusCaveat('Other note.', '2021 Census geography')).toBe(
      'Other note.',
    );
  });
});
