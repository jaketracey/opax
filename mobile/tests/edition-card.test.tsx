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
import { EditionCard, EditionSection } from '../src/features/EditionCard';
import { webPageUrl } from '../src/navigation/external';
import Today from '../src/features/Today';
import { responseBytes } from './fixture-bytes';
import { replaceAt } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: { today: jest.fn(), todayEdition: jest.fn() },
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

describe('the edition card', () => {
  test('shows the frozen edition: kind and date, title, attribution, text, sources, link and as-at line', () => {
    const { root } = render(<EditionCard edition={edition} />);
    expect(textOf(root, 'today-edition-kicker')).toBe('Bill · 4 October 2026');
    expect(textOf(root, 'today-edition-title')).toBe(pinned.edition.title);
    expect(textOf(root, 'today-edition-machine')).toBe(
      'Machine-writtenWritten by a model from the explanatory memorandum; not the record.',
    );
    expect(textOf(root, 'today-edition-text')).toBe(
      'This bill would keep funding grants that support pay for early childhood education and care workers.Passed 18 Sep 2026.',
    );
    expect(textOf(root, 'today-edition-sources')).toBe(
      'Sources and notesExplanatory memorandum on ParlInfo, CC BY-NC-ND 4.0Bill home page on ParlInfo, CC BY-NC-ND 4.0',
    );
    expect(textOf(root, 'today-edition-link')).toBe(
      'Read the billOpens on opax.com.au',
    );
    expect(textOf(root, 'today-edition-as-at')).toBe(
      'As at 4 October 2026 · Source: OPAX daily edition',
    );
    // The model's label comes before the model's text.
    const order = root
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          /^today-edition-(?:head|machine|text|sources|link|as-at)$/.test(
            node.props.testID,
          ),
      )
      .map((node) => node.props.testID);
    expect(order).toEqual([
      'today-edition-head',
      'today-edition-machine',
      'today-edition-text',
      'today-edition-sources',
      'today-edition-link',
      'today-edition-as-at',
    ]);
    expect(host(root, 'today-edition-stale')).toHaveLength(0);
  });
  test('VoiceOver labels are set by props, with the title as a header', () => {
    const { root } = render(<EditionCard edition={edition} />);
    expect(host(root, 'today-edition-head')[0]!.props.accessibilityRole).toBe(
      'header',
    );
    expect(labelOf(root, 'today-edition-head')).toBe(
      `Daily edition, Bill, 4 October 2026: ${pinned.edition.title}`,
    );
    expect(labelOf(root, 'today-edition-machine')).toBe(
      'Machine-written. Written by a model from the explanatory memorandum; not the record.',
    );
    expect(labelOf(root, 'today-edition-text')).toBe(
      edition.paragraphs.join('\n'),
    );
    expect(labelOf(root, 'today-edition-sources')).toBe(
      'Sources and notes: Explanatory memorandum on ParlInfo, CC BY-NC-ND 4.0. Bill home page on ParlInfo, CC BY-NC-ND 4.0',
    );
    const link = host(root, 'today-edition-link')[0]!;
    expect(link.props.accessibilityRole).toBe('link');
    expect(link.props.accessibilityLabel).toBe(
      `Read the bill: ${pinned.edition.title}`,
    );
    expect(link.props.accessibilityHint).toBe('Opens on opax.com.au');
  });
  test('nothing in the card limits lines or fixes heights, so it reads to AX5', () => {
    const { root } = render(
      <EditionCard edition={edition} stale savedAt={1} />,
    );
    expect(
      root.findAll((node) => node.props.numberOfLines !== undefined),
    ).toHaveLength(0);
    // SF Symbols are sized by the design system's Icon, which scales them.
    expect(
      root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          !node.type.includes('Symbol') &&
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
  test('tapping opens the page on the web through the link guard (e2e shows it)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { root } = render(<EditionCard edition={edition} />);
    await act(async () =>
      root
        .find(
          (node) =>
            node.props.testID === 'today-edition-link' &&
            typeof node.props.onPress === 'function',
        )
        .props.onPress(),
    );
    expect(alert).toHaveBeenCalledWith(
      'Opens on opax.com.au: Read the bill',
      `${webOrigin}/bill/au-federal-r7529`,
    );
    expect(webOrigin).not.toContain('opax.com.au');
    alert.mockRestore();
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
        edition={{ ...edition, path: '/bill/au-federal-r7529?token=abc' }}
      />,
    );
    expect(host(root, 'today-edition-link')).toHaveLength(0);
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
    expect(textOf(root, 'today-edition-as-at')).toBe(
      'As at 4 October 2026 · Source: OPAX daily edition · Saved 4 October 2026',
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
