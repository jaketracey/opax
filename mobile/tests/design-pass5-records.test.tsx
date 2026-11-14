import { withNavigationOptions } from './navigation-options';
import { router } from 'expo-router';
import { RouteOptions } from '../src/navigation/preview';
import { menuLeaves } from '../src/design/row-link';
import {
  recordActions,
  recordBarItems,
} from '../src/features/records/RecordActions';
// Records, Apple-design wave 4 (records.md 2 to 5), after design pass 5:
// the reader has one meta line, the title in the record face, the speaker as
// a PersonRow, one SourceLine holding the original, notes and licence, and
// Cite / Copy link / Open on opax.com.au under the bar's ⋯. Bill text opens
// on its text with the version as a bar menu. Just added is a list of
// record rows grouped by the day they were added.
import { NavigationContext } from 'expo-router/react-navigation';
import { act } from 'react';
import {
  Text as NativeText,
  Platform,
  RefreshControl,
  type View,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { ApiError } from '../src/api/errors';
import fixtures from '../scripts/fixtures/records/contracts.json';
import { catalogs } from '../src/api/runtime';
import {
  BillRow,
  Button,
  ContentUnavailable,
  Heading,
  InsetGroup,
  MachinePill,
  PersonRow,
  RegionProvider,
  RecordRow,
  SourceLine,
  StatusCapsule,
  VoteSplit,
} from '../src/design/primitives';
import BillTextReader from '../src/features/records/BillTextReader';
import BillTextContents from '../src/features/records/BillTextContents';
import { useBillTextPane } from '../src/features/records/billTextPane';
import { ReaderList } from '../src/features/records/ReaderList';
import DocumentReader from '../src/features/records/DocumentReader';
import {
  decodeBillText,
  decodeBillTextManifest,
  decodeDocument,
  decodeRecent,
  metaLine,
} from '../src/features/records/model';
import RecentRecords from '../src/features/records/RecentRecords';
import { records } from '../src/features/records/runtime';
import { recordSource } from '../src/features/records/source';
import { barTitleWidth } from '../src/navigation/useTitleOnScroll';
import { billTextContentsRoute, personRoute } from '../src/navigation/routes';
import { bills, index, manifest, people, roster, slugs } from './pinned';

const responses: Record<string, unknown> = fixtures.responses;
const doc = (path: string) => decodeDocument(responses[path]);
const speech = doc('/api/resource/speech-1205524');
const record = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
jest.mock('../src/features/records/runtime', () => ({
  records: {
    document: jest.fn(),
    recent: jest.fn(),
    similar: jest.fn(),
    billManifest: jest.fn(),
    billVersion: jest.fn(),
  },
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    billFor: jest.fn(),
    directory: jest.fn(),
    bills: jest.fn(),
    corpus: jest.fn(),
  },
}));
jest.mock('../src/design/menu', () => ({ showMenu: jest.fn() }));
let mockOptions: Record<string, unknown> = {};
jest.mock('expo-router', () => {
  const { createElement } = jest.requireActual<typeof React>('react');
  const part = (name: string) => (props: { children?: React.ReactNode }) =>
    createElement(name, props, props.children);
  return {
    useSegments: () => [],
    router: { push: jest.fn(), setParams: jest.fn(), back: jest.fn() },
    Link: Object.assign(part('Link'), {
      Trigger: part('LinkTrigger'),
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
    Stack: {
      Screen: ({ options }: { options?: Record<string, unknown> }) => {
        if (options) mockOptions = options;
        return null;
      },
      Toolbar: Object.assign(part('Toolbar'), {
        Button: part('ToolbarButton'),
        Spacer: () => null,
        View: part('ToolbarView'),
      }),
    },
    useLocalSearchParams: () => ({
      slug: 'speech-1205524',
      key: 'au-federal-r7534',
    }),
  };
});

async function mount(component: React.ReactElement) {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      withNavigationOptions(component, (options) => {
        mockOptions = options;
      }),
    );
  });
  return view;
}
const text = (view: TestRenderer.ReactTestRenderer) =>
  view.root
    .findAllByType(NativeText)
    .map((n) => n.props.children)
    .flat(Infinity)
    .filter((c) => typeof c === 'string')
    .join('\n');
const barLabels = () => {
  const items = (
    mockOptions.unstable_headerRightItems as
      | (() => { label: string }[])
      | undefined
  )?.();
  return items?.map((item) => item.label) ?? [];
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(records.recent).mockReset();
  mockOptions = {};
  jest.mocked(catalogs.directory).mockResolvedValue({
    roster: record(roster),
    slugs: record(slugs),
    people: record(people),
    manifest: record(manifest),
    electorates: record(index),
  } as never);
  jest.mocked(catalogs.bills).mockResolvedValue(record({ bills: [] }) as never);
  jest.mocked(catalogs.billFor).mockRejectedValue(new Error('none'));
  jest.mocked(records.document).mockResolvedValue(record(speech));
  jest.mocked(records.similar).mockResolvedValue(record([]) as never);
});

test.each([
  ['before_parliament', 'Before parliament'],
  ['assented', 'Assented'],
  ['awaiting_review', 'Awaiting review'],
])(
  'a linked bill renders %s as readable status words',
  async (status, label) => {
    const bill = { ...bills.bills[0]!, status };
    jest
      .mocked(catalogs.bills)
      .mockResolvedValue(record({ bills: [bill] }) as never);
    jest.mocked(records.document).mockResolvedValue(
      record({
        ...speech,
        metadata: { ...speech.metadata, bill_ref: bill.title },
      }),
    );
    const view = await mount(<DocumentReader />);
    const row = view.root
      .findAllByType(BillRow)
      .find((node) => node.props.testID === 'doc-bill-open')!;
    expect(row.props.status).toBe(label);
    expect(row.findByType(StatusCapsule).props).toMatchObject({
      status,
      label,
    });
    expect(textOfId(view, 'doc-bill-open')).toContain(label);
  },
);

test('one meta line says the kind and the chamber; the date is in the source line', async () => {
  expect(metaLine(speech, { date: false })).toBe(
    'Speech · House of Representatives',
  );
  const view = await mount(<DocumentReader />);
  expect(textOfId(view, 'doc-meta')).toBe('Speech · House of Representatives');
  const drawn = text(view);
  expect(drawn).not.toMatch(/Speech date|View original|More by this speaker/);
  expect(view.root.findAllByProps({ testID: 'doc-date' })).toHaveLength(0);
  // The title is the record's own words, in the record face.
  const title = view.root
    .findAllByType(Heading)
    .find((node) => node.props.testID === 'doc-title')!;
  expect(title.props).toMatchObject({ level: 1, testID: 'doc-title' });
  expect(title.props.kind).toBeUndefined();
  await act(async () => view.unmount());
});

test('the speaker is a person row with their party, opening their profile', async () => {
  const view = await mount(<DocumentReader />);
  const row = view.root.findByType(PersonRow);
  expect(row.props).toMatchObject({
    name: speech.speaker,
    testID: 'doc-more',
  });
  expect(row.props.party).toBeTruthy();
  expect(row.props.href ?? row.props.onPress).toBeTruthy();
  expect(typeof row.props.yourMP).toBe('boolean');
  await act(async () => view.unmount());
});

test.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])(
  'the record has one source line at the end, holding the original, notes and licence (embedded %s, long text %s)',
  async (embedded, longText) => {
    if (longText)
      jest
        .mocked(records.document)
        .mockResolvedValue(record({ ...speech, text: speech.text.repeat(20) }));
    const view = await mount(<DocumentReader embedded={embedded} />);
    const line = view.root
      .findAllByType(SourceLine)
      .find((node) => node.props.testID === 'doc-source')!;
    expect(line.props).toMatchObject({
      dateRole: 'recorded',
      citation: [{ label: 'Hansard', title: 'Hansard' }],
      licence: 'CC BY-NC-ND',
      licenceDataset: 'hansard',
      originals: [expect.objectContaining({ url: speech.url })],
    });
    expect(
      view.root
        .findAllByType(SourceLine)
        .filter((node) => node.props.testID === 'doc-source'),
    ).toHaveLength(1);
    expect(view.root.findAllByType(SourceLine).at(-1)).toBe(line);
    const ids = view.root
      .findAll((node) => typeof node.type === 'string' && node.props.testID)
      .map((node) => node.props.testID);
    expect(ids.indexOf('doc-source')).toBeGreaterThan(
      ids.indexOf('reader-text-0'),
    );
    const target = view.root.find(
      (node) =>
        node.props.testID === 'doc-source' &&
        typeof node.props.onPress === 'function',
    );
    expect(target.props.accessibilityLabel).toContain('Hansard');
    expect(target.props.accessibilityHint).toBe('Opens the sources');
    await act(async () => target.props.onPress());
    expect(jest.mocked(router.push).mock.calls.at(-1)![0]).toMatchObject({
      pathname: '/source',
    });
    await act(async () => view.unmount());
  },
);

test.each([false, true])(
  'division provenance stays after the vote and text in a narrow pane (embedded %s)',
  async (embedded) => {
    const division = doc('/api/resource/division-federal-senate-10701');
    jest.mocked(records.document).mockResolvedValue(record(division));
    const view = await mount(
      <RegionProvider value={{ width: 540, height: 800 }}>
        <DocumentReader embedded={embedded} />
      </RegionProvider>,
    );
    const lines = view.root.findAllByType(SourceLine);
    expect(
      lines.filter((node) => node.props.testID === 'doc-source'),
    ).toHaveLength(1);
    expect(lines.at(-1)!.props).toMatchObject({
      testID: 'doc-source',
      citation: [expect.objectContaining({ label: 'They Vote For You' })],
    });
    const ids = view.root
      .findAll((node) => typeof node.type === 'string' && node.props.testID)
      .map((node) => node.props.testID);
    expect(ids.indexOf('doc-source')).toBeGreaterThan(ids.indexOf('doc-votes'));
    expect(ids.indexOf('doc-source')).toBeGreaterThan(ids.indexOf('doc-title'));
    await act(async () => view.unmount());
  },
);

// The Worker's /api/resource voted_against_party for Senate division 9535 (portal
// public/division-against-party.js), in the web page's words.
const against9535 = {
  title: 'Voted against their party',
  help: 'Voting against your own party is often called crossing the floor.',
  member_list_complete: true,
  note: null,
  members: [
    {
      name: 'Alex Antic',
      person_slug: 'alex-antic',
      party: 'Liberal',
      vote: 'no',
      party_vote: 'aye',
      party_ayes: 8,
      party_noes: 1,
      text: 'Voted no; the other 8 Liberal senators voted aye',
    },
  ],
};

test('a division shows who voted against their party, linked, in the web page words', async () => {
  const raw = responses['/api/resource/division-federal-senate-10701'] as Record<string, unknown>;
  const division = decodeDocument({ ...raw, voted_against_party: against9535 });
  expect(division.votedAgainstParty).toEqual({
    title: 'Voted against their party',
    help: 'Voting against your own party is often called crossing the floor.',
    note: null,
    members: [
      {
        name: 'Alex Antic',
        personSlug: 'alex-antic',
        party: 'Liberal',
        text: 'Voted no; the other 8 Liberal senators voted aye',
        partyNote: null,
      },
    ],
  });
  jest.mocked(records.document).mockResolvedValue(record(division));
  const view = await mount(<DocumentReader />);
  const shown = text(view);
  expect(shown).toContain('Voted against their party');
  expect(shown).toContain('Voting against your own party is often called crossing the floor.');
  expect(shown).toContain('Liberal. Voted no; the other 8 Liberal senators voted aye.');
  const row = view.root.findAll(
    (node) => node.props.testID === 'doc-against-party-0' && node.props.title === 'Alex Antic',
  )[0]!;
  expect(row.props.href).toEqual(personRoute('alex-antic'));
  await act(async () => view.unmount());
});

test('a division with nobody against their party, or an older response, shows no section', async () => {
  const raw = responses['/api/resource/division-federal-senate-10701'] as Record<string, unknown>;
  for (const value of [undefined, null, { ...against9535, members: [] }, 'bad', { members: [{ name: 1 }] }]) {
    const division = decodeDocument({ ...raw, voted_against_party: value });
    expect(division.votedAgainstParty).toBeUndefined();
    jest.mocked(records.document).mockResolvedValue(record(division));
    const view = await mount(<DocumentReader />);
    expect(view.root.findAllByProps({ testID: 'doc-against-party' })).toHaveLength(0);
    expect(text(view)).not.toMatch(/against their party|crossing the floor/i);
    await act(async () => view.unmount());
  }
});

test('an embedded reader draws Ask about this in the header', async () => {
  const view = await mount(<DocumentReader embedded />);
  expect(
    view.root.findAllByProps({ testID: 'doc-ask' }).length,
  ).toBeGreaterThan(0);
  await act(async () => view.unmount());
});

test('each record kind names its own source and only a verified licence', () => {
  expect(recordSource(speech)).toMatchObject({
    citation: { label: 'Hansard' },
    licenceDataset: 'hansard',
  });
  const division = recordSource(
    doc('/api/resource/division-federal-senate-10701'),
  );
  expect(division).toMatchObject({
    citation: { label: 'They Vote For You' },
    licence: 'ODbL',
  });
  const zenodo = recordSource(doc('/api/resource/speech-18098'));
  expect(zenodo.citation.title).toMatch(/Zenodo/);
  const bill = recordSource(
    doc('/api/resource/bill-text-au-federal-r7534-aspassed'),
  );
  expect(bill).toMatchObject({ licenceDataset: 'bills' });
  expect(bill.licence).toBeUndefined();
  expect(bill.notes.join(' ')).toMatch(/bill text/i);
  // A state speech never borrows federal Hansard's terms.
  const state = recordSource({
    ...speech,
    labels: { ...speech.labels, state: 'nsw' },
  });
  expect(state.licence).toBeUndefined();
});

test.each(['', '  ', false, -1, 1.5, 'unavailable', null, undefined])(
  'a division with an invalid count (%j) does not draw a vote split',
  async (ayes) => {
    const division = doc('/api/resource/division-federal-senate-10701');
    jest.mocked(records.document).mockResolvedValue(
      record({
        ...division,
        metadata: { ...division.metadata, ayes_count: ayes, noes_count: 20 },
      }),
    );
    const view = await mount(<DocumentReader />);
    expect(view.root.findAllByType(VoteSplit).length).toBe(0);
    await act(async () => view.unmount());
  },
);

test.each([0, '0', 42, '42'])(
  'a division keeps a recorded integer count (%j), including zero',
  async (ayes) => {
    const division = doc('/api/resource/division-federal-senate-10701');
    jest.mocked(records.document).mockResolvedValue(
      record({
        ...division,
        metadata: { ...division.metadata, ayes_count: ayes, noes_count: '20' },
      }),
    );
    const view = await mount(<DocumentReader />);
    expect(view.root.findByType(VoteSplit).props).toMatchObject({
      ayes: Number(ayes),
      noes: 20,
    });
    await act(async () => view.unmount());
  },
);

const textOfId = (view: TestRenderer.ReactTestRenderer, testID: string) =>
  view.root
    .findAll((node) => node.props.testID === testID)
    .slice(0, 1)
    .flatMap((node) => node.findAllByType(NativeText))
    .map((n) => n.props.children)
    .flat(Infinity)
    .filter((c) => typeof c === 'string')
    .join('');

function mockBillText() {
  jest
    .mocked(records.billManifest)
    .mockResolvedValue(
      record(
        decodeBillTextManifest(
          responses['/bill-texts/au-federal-r7534/index.json'],
        ),
      ) as never,
    );
  jest
    .mocked(records.billVersion)
    .mockImplementation(
      (_key, id) =>
        Promise.resolve(
          record(
            decodeBillText(
              responses[`/bill-texts/au-federal-r7534/${id}.json`],
            ),
          ),
        ) as never,
    );
}

test('bill text opens on its text with the stage, one source line and the bar items', async () => {
  mockBillText();
  const view = await mount(<BillTextReader />);
  const shortTitle = decodeBillTextManifest(
    responses['/bill-texts/au-federal-r7534/index.json'],
  ).title;
  expect(mockOptions.title).toBe(shortTitle);
  expect(typeof mockOptions.headerTitle).toBe('function');
  expect(
    (mockOptions.headerTitle as () => React.ReactElement<{ title: string }>)()
      .props.title,
  ).toBe(shortTitle);
  expect(records.billVersion).toHaveBeenCalledWith(
    'au-federal-r7534',
    'r7534-aspassed',
    expect.any(AbortSignal),
  );
  expect(view.root.findAllByProps({ testID: 'bill-text-read' })).toHaveLength(
    0,
  );
  expect(textOfId(view, 'bill-text-meta')).toBe('Bill text');
  expect(textOfId(view, 'bill-text-stage')).toBe(
    'As passed: synthetic fixture',
  );
  expect(
    view.root.findAllByProps({ testID: 'reader-text-0' }).length,
  ).toBeGreaterThan(0);
  const source = view.root
    .findAllByType(SourceLine)
    .find((node) => node.props.testID === 'bill-text-source')!;
  expect(source.props).toMatchObject({
    dateRole: 'recorded',
    licenceDataset: 'bills',
  });
  expect(source.props.originals).toHaveLength(1);
  expect(
    view.root
      .findAllByType(SourceLine)
      .filter((node) => node.props.testID === 'bill-text-source'),
  ).toHaveLength(1);
  expect(view.root.findAllByType(SourceLine).at(-1)).toBe(source);
  const ids = view.root
    .findAll((node) => typeof node.type === 'string' && node.props.testID)
    .map((node) => node.props.testID);
  expect(ids.indexOf('bill-text-source')).toBeGreaterThan(
    ids.indexOf('reader-text-0'),
  );
  expect(barLabels()).toEqual(['As passed', 'More']);
  expect(
    (mockOptions.unstable_headerRightItems as () => object[])()[0],
  ).toMatchObject({
    type: 'menu',
    testID: 'bill-text-version',
    identifier: 'bill-text-version',
  });
  // iOS draws no bottom toolbar a tab bar would cover: Ask about this bill
  // is a button and Contents is first in ⋯, leaving Version in the bar.
  expect(
    view.root.findAll((node) => (node.type as unknown) === 'Toolbar'),
  ).toHaveLength(0);
  expect(
    view.root.findAllByProps({ testID: 'bill-text-ask' }).length,
  ).toBeGreaterThan(0);
  const more = (
    mockOptions.unstable_headerRightItems as () => {
      label: string;
      menu?: { items: { label: string; icon?: object; onPress: () => void }[] };
    }[]
  )().at(-1)!;
  expect(more.menu!.items[0]).toMatchObject({
    label: 'Contents',
    icon: { type: 'sfSymbol', name: 'list.bullet' },
  });
  expect(more.menu!.items.map((item) => item.label)).not.toContain('Version');
  await act(async () => more.menu!.items[0]!.onPress());
  expect(router.push).toHaveBeenCalledWith(
    billTextContentsRoute('au-federal-r7534', 'r7534-aspassed'),
  );
  expect(more.menu!.items.map((item) => item.label)).toContain('Share');
  // The overview is a closed disclosure with its machine pill inside.
  const overview = view.root.find(
    (node) =>
      node.props.testID === 'bill-text-overview' && !!node.props.onPress,
  );
  await act(async () => overview.props.onPress());
  expect(
    view.root
      .findAllByType(MachinePill)
      .some((pill) => pill.props.testID === 'bill-text-overview-label'),
  ).toBe(true);
  await act(async () => view.unmount());
});

test('bill text retains its source at the foot when the version cannot load', async () => {
  mockBillText();
  jest.mocked(records.billVersion).mockRejectedValue(new Error('unavailable'));
  const view = await mount(<BillTextReader embedded />);
  expect(
    view.root.findAllByProps({ testID: 'bill-text-version-error' }).length,
  ).toBeGreaterThan(0);
  const lines = view.root.findAllByType(SourceLine);
  expect(
    lines.filter((line) => line.props.testID === 'bill-text-source'),
  ).toHaveLength(1);
  expect(lines.at(-1)!.props).toMatchObject({
    testID: 'bill-text-source',
    originals: [expect.objectContaining({ label: 'Original bill document' })],
  });
  await act(async () => view.unmount());
});

test('bill text has no generic title before its text loads', async () => {
  jest.mocked(records.billManifest).mockReturnValue(new Promise(() => {}));
  const view = await mount(<BillTextReader />);
  expect(mockOptions.title).toBe('');
  await act(async () => view.unmount());
});

test('Contents announces its pending read and replaces it with the loaded section list', async () => {
  mockBillText();
  let finish!: (
    value: Awaited<ReturnType<typeof records.billManifest>>,
  ) => void;
  jest.mocked(records.billManifest).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = await mount(<BillTextContents />);
  expect(
    view.root.findAllByProps({ testID: 'bill-text-contents-loading' }).length,
  ).toBeGreaterThan(0);
  await act(async () =>
    finish(
      record(
        decodeBillTextManifest(
          responses['/bill-texts/au-federal-r7534/index.json'],
        ),
      ),
    ),
  );
  expect(
    view.root.findAllByProps({ testID: 'bill-text-contents-loading' }).length,
  ).toBe(0);
  expect(
    view.root.findAllByProps({ testID: 'bill-text-section-0' }).length,
  ).toBeGreaterThan(0);
  await act(async () => view.unmount());
});

test('the reader reveals the short bill name after most of its heading leaves, with room beside Bills', async () => {
  mockBillText();
  jest.mocked(catalogs.billFor).mockResolvedValue(
    record({
      identity: { data: { shortTitle: 'Synthetic short bill name' } },
      summary: { data: null },
    }) as never,
  );
  const view = await mount(<BillTextReader />);
  const inline = () => (mockOptions.headerTitle as () => React.ReactElement)();
  const heading =
    view.root.findByType(ReaderList).props.header.props.children[1];
  expect(heading.props.collapsable).toBe(false);
  const pending: Parameters<View['measure']>[0][] = [];
  (heading.props.ref.current as View).measure = (done) => {
    pending.push(done);
  };
  const answer = (request: number, pageY: number) =>
    act(async () => {
      await Promise.resolve();
      pending[request]!(0, 0, 300, 80, 0, pageY);
    });
  await act(async () =>
    heading.props.onLayout({ nativeEvent: { layout: { y: 28, height: 80 } } }),
  );
  expect(pending).toHaveLength(0);
  expect(inline().props.shown).toBe(false);
  const scroll = (y: number) =>
    act(async () =>
      view.root.findByType(ReaderList).props.onScroll({
        nativeEvent: { contentOffset: { y } },
      }),
    );
  await scroll(5000);
  await answer(0, 120);
  expect(inline().props.shown).toBe(false);
  await scroll(-1000);
  await answer(1, 6);
  expect(inline().props.shown).toBe(false);
  await scroll(-2000);
  expect(inline().props.shown).toBe(false);
  await answer(2, 4);
  expect(inline().props).toMatchObject({
    shown: true,
    title: 'Synthetic short bill name',
    trailing: 2,
    trailingWidth: 120 + 44,
  });
  const room = barTitleWidth(
    402,
    inline().props.trailing,
    inline().props.trailingWidth,
  );
  expect(room).toBe(90);
  expect(room).toBeGreaterThan(0);
  expect(barLabels()).toEqual(['As passed', 'More']);
  await scroll(9000);
  await answer(3, 120);
  expect(inline().props.shown).toBe(false);
  await act(async () => view.unmount());
});

test.each(['Synthetic short bill name', ''])(
  'bill text uses the actual short title, including an empty one, when it is %j',
  async (shortTitle) => {
    mockBillText();
    jest.mocked(catalogs.billFor).mockResolvedValue(
      record({
        identity: { data: { shortTitle } },
        summary: { data: null },
      }) as never,
    );
    const view = await mount(<BillTextReader />);
    const expected = shortTitle;
    expect(view.root.findByType(RouteOptions).props.options.title).toBe(
      expected,
    );
    expect(mockOptions.title).toBe(expected);
    if (expected) {
      expect(
        (
          mockOptions.headerTitle as () => React.ReactElement<{ title: string }>
        )().props.title,
      ).toBe(expected);
    } else expect(mockOptions.headerTitle).toBeUndefined();
    await act(async () => view.unmount());
  },
);

test('choosing another version from the bar menu loads it in place', async () => {
  mockBillText();
  const view = await mount(<BillTextReader />);
  const version = (
    mockOptions.unstable_headerRightItems as () => {
      label: string;
      menu?: { items: { label: string; state: string; onPress: () => void }[] };
    }[]
  )()[0]!;
  expect(version.label).toBe('As passed');
  expect(version.menu!.items.map((item) => [item.label, item.state])).toEqual([
    ['As passed: synthetic fixture, 1 Oct 2026', 'on'],
    ['First reading: synthetic fixture, 1 Oct 2026', 'off'],
  ]);
  await act(async () => version.menu!.items[1]!.onPress());
  expect(records.billVersion).toHaveBeenLastCalledWith(
    'au-federal-r7534',
    'r7534-first-reps',
    expect.any(AbortSignal),
  );
  expect(textOfId(view, 'bill-text-stage')).toBe(
    'First reading: synthetic fixture',
  );
  await act(async () => view.unmount());
});

test('In short retains the recorded version caveat when the reader changes bill text versions', async () => {
  mockBillText();
  const summary = Object.freeze({
    sentences: Object.freeze(['Fixture summary sentence.']),
    changes: Object.freeze(['Fixture change.']),
    attribution: 'Fixture attribution.',
    describes_version: 'as introduced',
  });
  jest.mocked(catalogs.billFor).mockResolvedValue(
    record({
      identity: { data: { shortTitle: 'Fixture bill' } },
      summary: { data: summary },
    }) as never,
  );
  const view = await mount(<BillTextReader />);
  expect(textOfId(view, 'bill-text-summary-version')).toBe(
    'Describes the bill as introduced.',
  );
  const version = (
    mockOptions.unstable_headerRightItems as () => {
      menu: { items: { onPress: () => void }[] };
    }[]
  )()[0]!;
  await act(async () => version.menu.items[1]!.onPress());
  expect(textOfId(view, 'bill-text-summary-version')).toBe(
    'Describes the bill as introduced.',
  );
  expect(textOfId(view, 'bill-text-summary-text')).toBe(
    'Fixture summary sentence.',
  );
  const ask = view.root
    .findAllByType(Button)
    .find((node) => node.props.testID === 'bill-text-ask')!;
  expect(ask.props).toMatchObject({
    variant: 'primary',
    label: 'Ask about this bill',
    accessibilityHint: 'Opens Ask with a question drafted',
  });
  const ids = view.root
    .findAll((node) => typeof node.type === 'string' && node.props.testID)
    .map((node) => node.props.testID);
  expect(ids.indexOf('bill-text-ask')).toBeGreaterThan(
    ids.indexOf('bill-text-summary-text'),
  );
  expect(summary.sentences).toEqual(['Fixture summary sentence.']);
  await act(async () => view.unmount());
});

test.each([
  [1, 1],
  [1, 2],
  [2, 1],
  [2, 2],
])(
  'the iPhone bar offers Version for %i versions and Contents for %i sections',
  async (versionCount, sectionCount) => {
    mockBillText();
    const manifest = decodeBillTextManifest(
      responses['/bill-texts/au-federal-r7534/index.json'],
    );
    const text = decodeBillText(
      responses['/bill-texts/au-federal-r7534/r7534-aspassed.json'],
    );
    jest.mocked(records.billManifest).mockResolvedValue(
      record({
        ...manifest,
        versions: manifest.versions.slice(0, versionCount),
      }),
    );
    jest
      .mocked(records.billVersion)
      .mockResolvedValue(
        record({ ...text, sections: text.sections.slice(0, sectionCount) }),
      );
    const view = await mount(<BillTextReader />);
    expect(barLabels()).toEqual(
      versionCount > 1 ? ['As passed', 'More'] : ['More'],
    );
    const more = (
      mockOptions.unstable_headerRightItems as () => {
        menu: { items: { label: string }[] };
      }[]
    )().at(-1)!;
    const labels = more.menu.items.map((item) => item.label);
    expect(labels).not.toContain('Version');
    if (sectionCount > 1) expect(labels[0]).toBe('Contents');
    else expect(labels).not.toContain('Contents');
    await act(async () => view.unmount());
  },
);

test('Android retains Version, Contents and More as bar items', async () => {
  const original = Platform.OS;
  let view: TestRenderer.ReactTestRenderer | undefined;
  try {
    Platform.OS = 'android';
    mockBillText();
    view = await mount(<BillTextReader />);
    expect(barLabels()).toEqual(['As passed', 'Contents', 'More']);
    const more = (
      mockOptions.unstable_headerRightItems as () => {
        menu?: { items: { label: string }[] };
      }[]
    )().at(-1)!;
    const labels = more.menu!.items.map((item) => item.label);
    expect(labels).not.toContain('Contents');
    expect(labels).not.toContain('Version');
    expect(labels).toContain('Ask about this bill');
  } finally {
    if (view) await act(async () => view!.unmount());
    Platform.OS = original;
  }
});

test('the embedded iPad reader retains its pane Version and Contents controls', async () => {
  mockBillText();
  let pane: ReturnType<typeof useBillTextPane> = null;
  function Probe() {
    pane = useBillTextPane('au-federal-r7534');
    return null;
  }
  const view = await mount(
    <>
      <BillTextReader embedded />
      <Probe />
    </>,
  );
  expect(pane).toMatchObject({
    version: { label: 'As passed' },
    contents: expect.any(Function),
  });
  expect(pane!.menu.map((item) => item.title)).not.toContain('Contents');
  expect(pane!.menu.map((item) => item.title)).not.toContain('Version');
  expect(mockOptions.unstable_headerRightItems).toBeUndefined();
  await act(async () => view.unmount());
});

test('Just added: rows are record rows grouped by the day added, with a source line', async () => {
  jest
    .mocked(records.recent)
    .mockResolvedValue(record(decodeRecent(responses['/api/recent'])));
  const view = await mount(<RecentRecords />);
  expect(textOfId(view, 'recent-title')).toBe('Just added');
  const rows = view.root.findAllByType(RecordRow);
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row.props.title).not.toMatch(/—|\d{4}-\d{2}-\d{2}/);
    expect(row.props.meta).toBeTruthy();
    expect(
      (row.props.menu as { title: string }[]).map((item) => item.title),
    ).toContain('Cite');
  }
  const line = view.root.findByProps({ testID: 'recent-source' });
  expect(line.props.citation).toBe('OPAX');
  expect(line.props.notes[0]).toMatch(/date.*added to OPAX/);
  expect(text(view)).not.toMatch(/indexed|Just added to the record/i);
  await act(async () => view.unmount());
});

test('Just added opened first in its stack titles the bar from the first frame, once', async () => {
  jest
    .mocked(records.recent)
    .mockResolvedValue(record(decodeRecent(responses['/api/recent'])));
  const setOptions = jest.fn();
  const navigation = {
    getState: () => ({ index: 0 }),
    setOptions,
    addListener: () => () => {},
    isFocused: () => true,
  } as unknown as React.ContextType<typeof NavigationContext>;
  const view = await mount(
    <NavigationContext.Provider value={navigation}>
      <RecentRecords />
    </NavigationContext.Provider>,
  );
  // No scroll rule: the stack's own title "Just added" stays in the bar,
  // never replaced by an empty renderer, and the page has no second title.
  expect(view.root.findAllByProps({ testID: 'recent-title' })).toHaveLength(0);
  for (const [options] of setOptions.mock.calls)
    expect(options).not.toHaveProperty('headerTitle');
  expect(view.root.findAllByType(RecordRow)).toHaveLength(3);
  await act(async () => view.unmount());
});

test('Just added says so when nothing is new, without a loading state', async () => {
  jest.mocked(records.recent).mockResolvedValue(record([]));
  const view = await mount(<RecentRecords />);
  expect(view.root.findByType(ContentUnavailable).props.title).toBe(
    'No new records yet',
  );
  expect(view.root.findAllByProps({ testID: 'recent-loading' })).toHaveLength(
    0,
  );
  await act(async () => view.unmount());
});

test('Just added shows its loading state before the first response', async () => {
  let finish!: (value: Awaited<ReturnType<typeof records.recent>>) => void;
  jest.mocked(records.recent).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = await mount(<RecentRecords />);
  expect(
    view.root.findAllByProps({ testID: 'recent-loading' }).length,
  ).toBeGreaterThan(0);
  expect(text(view)).not.toContain('No new records yet');
  await act(async () => finish(record([])));
  expect(view.root.findAllByProps({ testID: 'recent-loading' })).toHaveLength(
    0,
  );
  await act(async () => view.unmount());
});

test('Just added: a failed first read offers Try again', async () => {
  jest
    .mocked(records.recent)
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValue(record([]));
  const view = await mount(<RecentRecords />);
  const failure = view.root.findByType(ContentUnavailable);
  expect(failure.props).toMatchObject({
    title: 'New records couldn’t be loaded',
    testID: 'recent-error',
  });
  await act(async () => failure.props.action.onPress());
  expect(records.recent).toHaveBeenCalledTimes(2);
  await act(async () => view.unmount());
});

// Repeated pulls each start a read and only the newest answer is kept
// (recent-record-races.test.tsx owns the race rules); the spinner ends with it.
test('Just added keeps the newest refresh when pull events repeat before the next render', async () => {
  let finish!: (value: Awaited<ReturnType<typeof records.recent>>) => void;
  jest
    .mocked(records.recent)
    .mockResolvedValueOnce(record([]))
    .mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const view = await mount(<RecentRecords />);
  await act(async () => {
    const refresh = view.root.findByType(RefreshControl).props.onRefresh;
    refresh();
    refresh();
  });
  expect(records.recent).toHaveBeenCalledTimes(3);
  await act(async () => finish(record(decodeRecent(responses['/api/recent']))));
  expect(view.root.findByType(RefreshControl).props.refreshing).toBe(false);
  expect(view.root.findAllByType(RecordRow)).toHaveLength(3);
  await act(async () => view.unmount());
});

test('Just added explains a failed refresh of an empty feed and lets the reader retry', async () => {
  jest
    .mocked(records.recent)
    .mockResolvedValueOnce(record([]))
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce(record(decodeRecent(responses['/api/recent'])));
  const view = await mount(<RecentRecords />);
  await act(async () => view.root.findByType(RefreshControl).props.onRefresh());
  const error = view.root.find(
    (node) =>
      node.props.testID === 'recent-refresh-error' && !!node.props.onRetry,
  );
  expect(
    view.root.findAllByProps({ testID: 'recent-empty' }).length,
  ).toBeGreaterThan(0);
  await act(async () => error.props.onRetry());
  expect(
    view.root.findAllByProps({ testID: 'recent-refresh-error' }).length,
  ).toBe(0);
  expect(view.root.findAllByType(RecordRow)).toHaveLength(3);
  await act(async () => view.unmount());
});

test('Just added offline: the saved-copy banner speaks once, with no second refresh error', async () => {
  jest
    .mocked(records.recent)
    .mockResolvedValueOnce(record(decodeRecent(responses['/api/recent'])))
    .mockRejectedValueOnce(new ApiError('offline', 'Offline'));
  const view = await mount(<RecentRecords />);
  await act(async () => view.root.findByType(RefreshControl).props.onRefresh());
  expect(
    view.root.findAllByProps({ testID: 'recent-refresh-error' }).length,
  ).toBe(0);
  expect(view.root.findAllByType(RecordRow)).toHaveLength(3);
  await act(async () => view.unmount());
});

test('Just added: rows without a date added follow in a final group with no header', async () => {
  const feed = decodeRecent(responses['/api/recent']);
  jest
    .mocked(records.recent)
    .mockResolvedValue(
      record([{ ...feed[0]!, indexed: null }, ...feed.slice(1)]),
    );
  const view = await mount(<RecentRecords />);
  const headers = view.root
    .findAllByType(InsetGroup)
    .map((group) => group.props.header);
  expect(headers.at(-1)).toBeUndefined();
  expect(headers.slice(0, -1).every((h) => /^Added \d/.test(h))).toBe(true);
  expect(text(view)).not.toMatch(/not recorded/);
  await act(async () => view.unmount());
});

test('the bar holds Share and ⋯: Cite inline, Copy link, Open on opax.com.au', async () => {
  const view = await mount(<DocumentReader />);
  expect(barLabels()).toEqual(['Share', 'More']);
  // iOS draws no bottom toolbar, which the floating tab bar would cover:
  // Ask about this is a button, and Share (where it can) sits beside ⋯.
  expect(
    view.root.findAll((node) => (node.type as unknown) === 'Toolbar'),
  ).toHaveLength(0);
  expect(
    view.root.findAllByProps({ testID: 'doc-ask' }).length,
  ).toBeGreaterThan(0);
  await act(async () => view.unmount());
  const target = { slug: 'speech-1205524', title: 'A speech' };
  const actions = recordActions(target);
  expect(actions.map((a) => a.title)).toEqual([
    'Cite',
    'Copy link',
    'Open on opax.com.au',
  ]);
  expect(actions[0]).toMatchObject({ inline: true });
  expect(menuLeaves(actions).map((a) => a.title)).toEqual([
    'Copy APA 7',
    'Copy AGLC',
    'Copy BibTeX',
    'Copy RIS',
    'Citation formats…',
    'Copy link',
    'Open on opax.com.au',
  ]);
  const item = recordBarItems(target)()[0]!;
  expect(item).toMatchObject({
    type: 'menu',
    label: 'More',
    accessibilityLabel: 'More for this record',
  });
});
