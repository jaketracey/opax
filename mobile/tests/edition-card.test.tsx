import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, type ReactElement } from 'react';
import { Alert } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import snapshot from '../scripts/fixture-snapshot.json';
import {
  decodeEdition,
  editionFor,
  type Block,
  type EditionView,
} from '../src/api/catalogs';
import { ApiError } from '../src/api/errors';
import { editionPath } from '../src/api/policy';
import { catalogs } from '../src/api/runtime';
import { webOrigin } from '../src/design/environment';
import {
  ErrorState,
  LoadingState,
  OfflineBanner,
  StaleNotice,
} from '../src/design/primitives';
import { router } from 'expo-router';
import { light, partyColors } from '../src/design/tokens';
import { CachedPortrait } from '../src/features/CachedPortrait';
import { EditionCard, EditionSection } from '../src/features/EditionCard';
import {
  editionAccent,
  editionFigures,
  personFacts,
} from '../src/features/today/EditionHero';
import { webPageUrl } from '../src/navigation/external';
import { billRoute, personRoute } from '../src/navigation/routes';
import Today from '../src/features/Today';
import { responseBytes } from './fixture-bytes';
import { replaceAt, roster, slugs } from './pinned';

jest.mock('../src/features/reports/TodayReports', () => ({
  Spotlight: () => null,
  ReportsEntry: () => null,
  FromRecord: () => null,
  TodayCoverage: () => null,
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { today: jest.fn(), todayEdition: jest.fn(), directory: jest.fn() },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const pinned = JSON.parse(responseBytes(snapshot, editionPath).toString());
const ready = editionFor(decodeEdition(pinned));
const edition = ready.data!;
const failed = (
  code: ApiError['code'],
  message: string,
): Block<EditionView> => ({
  data: null,
  status: 'error',
  error: new ApiError(code, message),
  asAt: null,
  sources: [],
  stale: false,
  savedAt: null,
});

function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}
const host = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
const textOf = (root: ReactTestInstance, testID: string) =>
  host(root, testID)
    .flatMap((node) => node.findAll((n) => n.type === 'Text'))
    .flatMap((node) =>
      ([] as unknown[])
        .concat(node.props.children)
        .filter((child): child is string => typeof child === 'string'),
    )
    .join('');
const labelOf = (root: ReactTestInstance, testID: string) =>
  host(root, testID)[0]?.props.accessibilityLabel as string | undefined;
const renderToJSON = (root: ReactTestInstance) =>
  root
    .findAll((node) => typeof node.type === 'string')
    .map((node) =>
      ([] as unknown[])
        .concat(node.props.children)
        .filter((child) => typeof child === 'string'),
    );

const politicianJSON = JSON.parse(
  readFileSync(
    join(__dirname, '../scripts/fixtures/edition-politician.json'),
    'utf8',
  ),
);
const politician = editionFor(decodeEdition(politicianJSON)).data!;
const ids = (root: ReactTestInstance, pattern: RegExp) =>
  root
    .findAll(
      (node) =>
        typeof node.type === 'string' && pattern.test(node.props.testID ?? ''),
    )
    .map((node) => node.props.testID as string);
const press = async (root: ReactTestInstance, testID: string) =>
  act(async () =>
    root
      .find(
        (node) =>
          node.props.testID === testID &&
          typeof node.props.onPress === 'function',
      )
      .props.onPress(),
  );

describe('the edition card', () => {
  test('a bill edition: kicker, title, the model label before its text, the timeline and one native action; no sources', () => {
    const { root } = render(<EditionCard edition={edition} />);
    expect(textOf(root, 'today-edition-kicker')).toMatch(
      /^DAILY EDITION · BILL · 4 OCT( 2026)?$/,
    );
    expect(textOf(root, 'today-edition-title')).toBe(pinned.edition.title);
    expect(textOf(root, 'today-edition-detail')).toBe('Education portfolio');
    expect(textOf(root, 'today-edition-machine')).toBe(
      'Machine-writtenWritten by a model from the explanatory memorandum; not the record.',
    );
    expect(textOf(root, 'today-edition-text')).toBe(
      'This bill would keep funding grants that support pay for early childhood education and care workers.Passed 18 Sep 2026.',
    );
    expect(labelOf(root, 'today-edition-events')).toBe(
      '12 Aug 2026, Introduced in the House of Representatives. 10 Sep 2026, Third reading, House of Representatives. 14 Sep 2026, Introduced in the Senate. 15 Sep 2026, Passed the Senate. 18 Sep 2026, Royal Assent',
    );
    // Sources and licences live on their own screen.
    expect(host(root, 'today-edition-sources')).toHaveLength(0);
    expect(JSON.stringify(renderToJSON(root))).not.toMatch(/CC BY|ParlInfo/);
    expect(host(root, 'today-edition-link')).toHaveLength(0);
    // The model's label comes before the model's text.
    expect(
      ids(root, /^today-edition-(?:head|machine|text|events|open)$/),
    ).toEqual([
      'today-edition-head',
      'today-edition-machine',
      'today-edition-text',
      'today-edition-events',
      'today-edition-open',
    ]);
    expect(host(root, 'today-edition-stale')).toHaveLength(0);
    expect(host(root, 'today-edition-as-at')).toHaveLength(0);
  });
  test('VoiceOver labels are set by props, with the title as a header', () => {
    const { root } = render(<EditionCard edition={edition} />);
    expect(host(root, 'today-edition-head')[0]!.props.accessibilityRole).toBe(
      'header',
    );
    expect(labelOf(root, 'today-edition-head')).toBe(
      `Daily edition, Bill, 4 October 2026: ${pinned.edition.title}, Education portfolio`,
    );
    expect(labelOf(root, 'today-edition-machine')).toBe(
      'Machine-written. Written by a model from the explanatory memorandum; not the record.',
    );
    expect(labelOf(root, 'today-edition-text')).toBe(
      edition.paragraphs.join('\n'),
    );
    const open = host(root, 'today-edition-open')[0]!;
    expect(open.props.accessibilityRole).toBe('button');
    expect(open.props.accessibilityLabel).toBe('Open the bill');
    expect(open.props.accessibilityHint).toBe('Opens the record in the app');
  });
  test('a parliamentarian: party colour, portrait, the figures and topic labels in place of the text', () => {
    const { root } = render(<EditionCard edition={politician} />);
    expect(textOf(root, 'today-edition-kicker')).toMatch(
      /^DAILY EDITION · PARLIAMENTARIAN · 6 OCT( 2026)?$/,
    );
    expect(textOf(root, 'today-edition-title')).toBe('Alex Hawke');
    expect(textOf(root, 'today-edition-party')).toBe('Liberal');
    expect(textOf(root, 'today-edition-detail')).toBe('Mitchell, NSW');
    expect(labelOf(root, 'today-edition-head')).toBe(
      'Daily edition, Parliamentarian, 6 October 2026: Alex Hawke, Liberal, Mitchell, NSW',
    );
    expect(root.findByType(CachedPortrait).props).toMatchObject({
      name: 'Alex Hawke',
      size: 'profile',
    });
    // The Liberal blue, deepened only as far as white text needs.
    const head = host(root, 'today-edition-head')[0]!;
    expect([head.props.style].flat()).toContainEqual({
      backgroundColor: editionAccent(politician).deep,
    });
    expect(editionAccent(politician).base).toBe(partyColors.liberal);
    expect(labelOf(root, 'today-edition-figure-0')).toBe(
      '768, speeches in the Opax record',
    );
    expect(labelOf(root, 'today-edition-figure-1')).toBe(
      '2008–2026, Years in the record',
    );
    expect(labelOf(root, 'today-edition-topics')).toBe(
      'Most common topic labels: Tax & budget, 19 percent; Climate & environment, 12 percent. Shares of labelled speeches; a speech can carry several labels.',
    );
    expect(textOf(root, 'today-edition-topics')).toContain('Tax & budget 19%');
    // The post says the same in words; the figures replace it.
    expect(host(root, 'today-edition-text')).toHaveLength(0);
    expect(host(root, 'today-edition-machine')).toHaveLength(0);
    expect(textOf(root, 'today-edition-open')).toBe("Open Alex Hawke's record");
  });
  test('an edition without slides keeps its own words, and a cover line that names no party colours nothing', () => {
    const bare = {
      ...politician,
      facts: {
        ...politician.facts,
        figures: [],
        bars: null,
        line: 'House of Representatives · records 2008 to 2026',
      },
    };
    expect(personFacts(bare).party).toBeNull();
    expect(editionAccent(bare).base).toBe(light.navy);
    const none = {
      ...politician,
      facts: {
        kicker: null,
        line: null,
        figures: [],
        bars: null,
        events: [],
        division: null,
      },
    };
    const { root } = render(<EditionCard edition={none} />);
    expect(textOf(root, 'today-edition-text')).toBe(
      'Alex Hawke: 768 speeches in the Opax record.Top topic labels: Tax & budget 19%; Climate & environment 12%.Shares of labelled speeches; labels overlap.Records: 2008–2026.',
    );
    expect(host(root, 'today-edition-figures')).toHaveLength(0);
    expect(host(root, 'today-edition-party')).toHaveLength(0);
  });
  test('a division gives the hero its ayes and noes', () => {
    const counted = {
      ...edition,
      facts: { ...edition.facts, division: { ayes: 85, noes: 50 } },
    };
    expect(editionFigures(counted)).toEqual([
      { value: '85', label: 'Ayes' },
      { value: '50', label: 'Noes' },
    ]);
  });
  test('nothing in the card limits lines or fixes the height of content, so it reads to AX5', () => {
    for (const shown of [edition, politician]) {
      const { root } = render(
        <EditionCard edition={shown} stale savedAt={1} />,
      );
      expect(
        root.findAll((node) => node.props.numberOfLines !== undefined),
      ).toHaveLength(0);
      // Fixed sizes only on empty decorative marks (dots, rails); SF Symbols
      // are sized by the design system's Icon, which scales them.
      expect(
        root.findAll(
          (node) =>
            typeof node.type === 'string' &&
            !node.type.includes('Symbol') &&
            node.children.length > 0 &&
            [node.props.style]
              .flat(Infinity)
              .some(
                (style) => style && ('height' in style || 'maxHeight' in style),
              ),
        ),
      ).toHaveLength(0);
      expect(
        root.findAll((node) => node.props.adjustsFontSizeToFit === true),
      ).toHaveLength(0);
    }
  });
  test('server text is plain text: markup is shown as written, never parsed', () => {
    const marked = editionFor(
      decodeEdition(
        replaceAt(
          pinned,
          ['edition', 'text'],
          '<b>Bold</b> <script>x</script>',
        ),
      ),
    ).data!;
    const { root } = render(<EditionCard edition={marked} />);
    expect(textOf(root, 'today-edition-text')).toBe(
      '<b>Bold</b> <script>x</script>',
    );
    expect(root.findAll((node) => node.type === 'b')).toHaveLength(0);
  });
  test('a bill opens on its native screen', async () => {
    const { root } = render(<EditionCard edition={edition} />);
    await press(root, 'today-edition-open');
    expect(router.push).toHaveBeenLastCalledWith(billRoute('au-federal-r7529'));
  });
  test('a parliamentarian opens natively when the name settles on one roster person and slug', async () => {
    jest.mocked(catalogs.directory).mockResolvedValue({
      roster: { data: roster },
      slugs: { data: slugs },
    } as unknown as Awaited<ReturnType<typeof catalogs.directory>>);
    const { root } = render(<EditionCard edition={politician} />);
    await press(root, 'today-edition-open');
    expect(router.push).toHaveBeenLastCalledWith(personRoute('alex-hawke'));
  });
  test('a parliamentarian the directory cannot settle opens on the web through the link guard', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(router.push).mockClear();
    jest.mocked(catalogs.directory).mockRejectedValue(new Error('offline'));
    const { root } = render(<EditionCard edition={politician} />);
    await press(root, 'today-edition-open');
    expect(router.push).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      "Opens on opax.com.au: Read the parliamentarian's record",
      `${webOrigin}/subject/person/Alex%20Hawke`,
    );
    alert.mockRestore();
  });
  test('the community-funding report opens through the public money lane', async () => {
    jest.mocked(router.push).mockClear();
    const report = {
      ...edition,
      kind: 'topic' as const,
      kindLabel: 'Topic',
      machineWritten: null,
      path: '/reports/grants-allocation',
    };
    const { root } = render(<EditionCard edition={report} />);
    await press(root, 'today-edition-open');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/grants-allocation',
    });
  });
  test('a standing report opens through the shared native resolver', async () => {
    jest.mocked(router.push).mockClear();
    const { root } = render(
      <EditionCard
        edition={{
          ...edition,
          kind: 'topic',
          kindLabel: 'Topic',
          machineWritten: null,
          path: '/reports/housing',
        }}
      />,
    );
    await press(root, 'today-edition-open');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/report/[slug]',
      params: { slug: 'housing' },
    });
  });
  test.each([
    '/subject/person/Tony%20Abbott',
    '/bill/au-federal-r7529',
    '/money/grants/federal/recipient/abn:83140439239?award=GA12345',
    '/money/grants?jur=federal&program=abc',
    '/money/grants?jur=federal&largest=2026-08',
    '/reports/housing',
  ])(
    "the guard passes the publisher's page %s on the build's origin",
    (path) => {
      expect(webPageUrl(path)).toBe(`${webOrigin}${path}`);
    },
  );
  test('a link the guard refuses is not drawn', () => {
    const { root } = render(
      <EditionCard
        edition={{
          ...edition,
          kind: 'topic',
          path: '/reports/housing?token=abc',
        }}
      />,
    );
    expect(host(root, 'today-edition-link')).toHaveLength(0);
    expect(host(root, 'today-edition-open')).toHaveLength(0);
    expect(textOf(root, 'today-edition-title')).toBe(pinned.edition.title);
  });
  test('a stale copy says it is saved, beside the edition date', () => {
    const savedAt = Date.parse('2026-10-04T01:00:00Z');
    const { root } = render(
      <EditionSection
        block={{ ...ready, stale: true, savedAt }}
        onRetry={() => {}}
        refreshing
      />,
    );
    expect(root.findAllByType(OfflineBanner)).toHaveLength(1);
    expect(root.findByType(StaleNotice).props).toMatchObject({
      savedAt,
      refreshing: true,
    });
    expect(textOf(root, 'today-edition-as-at')).toMatch(
      /^Updated 4 Oct( 2026)? · Saved 4 Oct( 2026)?$/,
    );
    expect(textOf(root, 'today-edition-title')).toBe(pinned.edition.title);
  });
});

describe('the edition section states', () => {
  test('loading shows a placeholder VoiceOver can name', () => {
    const { root } = render(<EditionSection block={null} onRetry={() => {}} />);
    expect(root.findByType(LoadingState).props.label).toBe(
      'Loading the daily edition',
    );
    expect(host(root, 'today-edition')).toHaveLength(1);
  });
  test('no edition published (404) draws nothing at all', () => {
    const renderer = render(
      <EditionSection
        block={{
          data: null,
          status: 'missing',
          asAt: null,
          sources: [],
          stale: false,
          savedAt: null,
        }}
        onRetry={() => {}}
      />,
    );
    expect(renderer.toJSON()).toBeNull();
  });
  test('offline with nothing saved says so and offers Try again', () => {
    const onRetry = jest.fn();
    const { root } = render(
      <EditionSection
        block={failed(
          'offline',
          'This record is not saved on this iPhone yet. It will load when you are back online.',
        )}
        onRetry={onRetry}
      />,
    );
    expect(root.findByType(OfflineBanner).props.cached).toBe(false);
    act(() => root.findByType(ErrorState).props.onRetry());
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(host(root, 'today-edition-card')).toHaveLength(0);
  });
  test('an unreadable edition is an error without an offline banner', () => {
    const { root } = render(
      <EditionSection
        block={failed(
          'invalid-data',
          'The catalog response could not be read.',
        )}
        onRetry={() => {}}
      />,
    );
    expect(root.findAllByType(OfflineBanner)).toHaveLength(0);
    expect(root.findByType(ErrorState).props.message).toBe(
      'The catalog response could not be read.',
    );
  });
});

describe('Today', () => {
  const feeds = {
    bills: {
      data: [],
      status: 'ready' as const,
      asAt: null,
      sources: [],
      stale: false,
      savedAt: null,
    },
    declarations: {
      data: [],
      status: 'ready' as const,
      asAt: null,
      sources: [],
      stale: false,
      savedAt: null,
    },
  };
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(catalogs.today)
      .mockResolvedValue(
        feeds as unknown as Awaited<ReturnType<typeof catalogs.today>>,
      );
  });
  async function renderToday() {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<Today />);
    });
    return renderer.root;
  }
  test('shows the edition above the feeds, and pull to refresh asks again', async () => {
    jest.mocked(catalogs.todayEdition).mockResolvedValue(ready);
    const root = await renderToday();
    expect(catalogs.todayEdition).toHaveBeenCalledWith(false);
    const sections = root
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          ['today-edition', 'today-bills', 'today-declarations'].includes(
            node.props.testID,
          ),
      )
      .map((node) => node.props.testID);
    expect(sections).toEqual([
      'today-edition',
      'today-bills',
      'today-declarations',
    ]);
    const scroll = root.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.testID === 'today-screen' &&
        node.props.refreshControl,
    );
    await act(async () => scroll.props.refreshControl.props.onRefresh());
    expect(catalogs.todayEdition).toHaveBeenLastCalledWith(true);
    expect(catalogs.today).toHaveBeenLastCalledWith(6, true);
  });
  test('with no edition published the section is absent and the feeds remain', async () => {
    jest.mocked(catalogs.todayEdition).mockResolvedValue({
      data: null,
      status: 'missing',
      asAt: null,
      sources: [],
      stale: false,
      savedAt: null,
    });
    const root = await renderToday();
    expect(host(root, 'today-edition')).toHaveLength(0);
    expect(host(root, 'today-bills')).toHaveLength(1);
    expect(host(root, 'today-declarations')).toHaveLength(1);
  });
});
