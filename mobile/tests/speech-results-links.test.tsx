import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Image, Platform, StyleSheet } from 'react-native';
import records from '../scripts/fixtures/search/records.json';
import { decodeRoster, decodeSlugs } from '../src/api/catalog-decoders';
import { catalogs, portraits } from '../src/api/runtime';
import { PartyLabel, Portrait } from '../src/design/people';
import { RecordRow } from '../src/design/rows';
import { decodeRecord, decodeRecords } from '../src/features/search/decoders';
import { eligibleRecord } from '../src/features/search/eligibility';
import { defaultSpeechFilters } from '../src/features/search/filters';
import { speechSpeaker } from '../src/features/search/present';
import {
  SpeechResults,
  SpeechRow,
  speechRoute,
} from '../src/features/search/SpeechResults';
import type { SpeechList } from '../src/features/search/speeches';
import { openSource } from '../src/navigation/external';
import { personRoute } from '../src/navigation/routes/people';
import { docRoute } from '../src/navigation/routes/records';

jest.mock('../src/api/runtime', () => ({
  catalogs: { slugs: jest.fn() },
  portraits: { get: jest.fn() },
}));
jest.mock('../src/navigation/external', () => ({ openSource: jest.fn() }));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));

const raw = {
  ...records.find((row) => row.slug === 'speech-828012')!,
  party: 'Labor',
};
const roster = decodeRoster({
  meta: { generated: '2026-11-11' },
  people: [{ name: 'Don Farrell', party: 'Labor' }],
});
const slugs = decodeSlugs({
  generated: '2026-11-11',
  slugs: { 'don-farrell': 'Don Farrell' },
});
const originalPlatform = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  jest.mocked(catalogs.slugs).mockResolvedValue({ data: slugs } as never);
  jest.mocked(portraits.get).mockResolvedValue(null);
});
afterEach(() => {
  Platform.OS = originalPlatform;
});

test.each([
  ['relative', { href: '/doc/speech-828012?old=query#passage' }],
  ['absolute', { href: 'https://opax.com.au/doc/speech-828012' }],
  ['www origin', { href: 'https://www.opax.com.au/doc/speech-828012' }],
  ['encoded', { href: '/doc/%73peech-828012' }],
  ['missing href', {}],
  ['different path', { href: '/records/828012' }],
  ['resource slug', { slug: 'catalog-1', resource: 'speech-828012' }],
  [
    'resource path',
    { slug: 'catalog-1', resource: '/api/resource/speech-828012' },
  ],
  ['malformed href with a valid slug', { href: '/doc/%broken' }],
])(
  '%s speech rows open the reader with the trimmed find query',
  (_, fields) => {
    const row = decodeRecord({ ...raw, ...fields });
    const view = render(<SpeechRow row={row} q="  housing  " index={0} />);
    const reader = view.getByRole('link');
    expect(speechRoute(row, '  housing  ')).toEqual(
      docRoute('speech-828012', undefined, { q: 'housing', find: 'auto' }),
    );
    fireEvent.press(reader);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      docRoute('speech-828012', undefined, { q: 'housing', find: 'auto' }),
    );
    expect(view.UNSAFE_getByType(RecordRow).props.external).toBeUndefined();
  },
);

test('absolute OPAX links are normalised before speech eligibility is checked', () => {
  const row = decodeRecord({
    ...raw,
    href: 'https://opax.com.au/doc/speech-828012?q=old',
  });
  expect(row.href).toBe('/doc/speech-828012?q=old');
  expect(eligibleRecord(row, roster)).toBe(true);
});

test.each([
  '//other.test/doc/speech-828012',
  'https://opax.com.au.other.test/doc/speech-828012',
  'https://other.test/doc/speech-828012',
  'https://user:password@opax.com.au/doc/speech-828012',
  'http://opax.com.au/doc/speech-828012',
  'javascript:alert(1)',
])('the decoder refuses an untrusted result href: %s', (href) => {
  expect(() => decodeRecord({ ...raw, href })).toThrow();
});

test('the opaque resource ID is not a reader slug; a source-only row opens its original', () => {
  const row = decodeRecord({
    ...raw,
    slug: 'catalog-1',
    url: 'https://www.aph.gov.au/Parliamentary_Business/Hansard',
    source: 'Senate Hansard',
  });
  expect(speechRoute(row, 'housing')).toBeNull();
  const view = render(<SpeechRow row={row} q="housing" index={0} />);
  fireEvent.press(view.getByRole('link'));
  expect(openSource).toHaveBeenCalledWith(row.url, 'Senate Hansard');
  expect(router.push).not.toHaveBeenCalled();
});

test('other public record kinds also open the reader without an href', () => {
  for (const record of records.filter((row) => row.kind !== 'speech')) {
    const route = speechRoute(decodeRecord(record), 'housing');
    expect(route).toEqual(
      docRoute(record.slug, undefined, { q: 'housing', find: 'auto' }),
    );
  }
});

function list(): SpeechList {
  const data = decodeRecords({
    query: 'housing',
    kind: 'speech',
    sort: 'relevance',
    page: 1,
    per_page: 20,
    page_count: 1,
    total: 1,
    count: 1,
    truncated: false,
    years: {},
    results: [raw],
  });
  return {
    first: { status: 'ready', result: { data } } as SpeechList['first'],
    rows: data.results,
    total: 1,
    more: false,
    nextCount: 0,
    next: null,
    pages: 1,
    source: null,
    count: '1 speech',
    load: jest.fn(),
    loadMore: jest.fn(),
    retry: jest.fn(),
  };
}
const recover = {
  onAsk: jest.fn(),
  onAll: jest.fn(),
  onClearFilters: jest.fn(),
  onUnquote: jest.fn(),
  onSpeeches: jest.fn(),
};

test.each(['group', 'list'] as const)(
  '%s results pass the roster and resolved speaker profile to each row',
  async (variant) => {
    const view = render(
      <SpeechResults
        list={list()}
        q="housing"
        filters={defaultSpeechFilters}
        sort="relevance"
        roster={roster}
        variant={variant}
        recover={recover}
      />,
    );
    const speaker = await view.findByRole('link', { name: 'Open Don Farrell' });
    const stopPropagation = jest.fn();
    fireEvent.press(speaker, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      personRoute('don-farrell', 'Don Farrell'),
    );
    expect(catalogs.slugs).toHaveBeenCalledTimes(1);
  },
);

test.each(['ios', 'android'] as const)(
  '%s exposes separate speaker and reader links, and the rest of the row opens the speech',
  async (platform) => {
    Platform.OS = platform;
    const view = render(
      <SpeechRow
        row={decodeRecord(raw)}
        q="housing"
        index={0}
        roster={roster}
        slugs={slugs}
      />,
    );
    const speaker = view.getByRole('link', { name: 'Open Don Farrell' });
    const reader = view.getByTestId('records-result-0');
    const container = view.getByTestId('records-result-0-container');
    expect(view.getAllByRole('link')).toHaveLength(2);
    expect(reader.props.accessibilityLabel).toContain(
      'Speech · 6 Mar 2023 · Federal, Bills',
    );
    expect(reader.props.accessibilityLabel).toContain('Don Farrell, Labor');
    expect(container.props.accessible).toBe(false);
    expect(container.props.accessibilityLabel).toBeUndefined();
    expect(StyleSheet.flatten(speaker.props.style).minHeight).toBe(
      platform === 'android' ? 48 : 44,
    );
    const stopPropagation = jest.fn();
    fireEvent.press(speaker, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenLastCalledWith(
      personRoute('don-farrell', 'Don Farrell'),
    );
    fireEvent.press(reader, { stopPropagation });
    expect(router.push).toHaveBeenCalledTimes(2);
    expect(router.push).toHaveBeenLastCalledWith(
      docRoute(raw.slug, undefined, { q: 'housing', find: 'auto' }),
    );
    fireEvent.press(container);
    expect(router.push).toHaveBeenCalledTimes(3);
    expect(router.push).toHaveBeenLastCalledWith(
      docRoute(raw.slug, undefined, { q: 'housing', find: 'auto' }),
    );
    await act(async () => {});
  },
);

test('a verified speaker photo uses the shared 44 point portrait and is decorative', async () => {
  jest.mocked(portraits.get).mockResolvedValue({
    localURI: 'file:///portraits/verified.webp',
    info: { key: '10007' },
  } as never);
  const view = render(
    <SpeechRow
      row={decodeRecord(raw)}
      q="housing"
      index={0}
      roster={roster}
      slugs={slugs}
    />,
  );
  await waitFor(() =>
    expect(view.UNSAFE_getAllByType(Portrait)).toHaveLength(1),
  );
  expect(portraits.get).toHaveBeenCalledWith({
    name: 'Don Farrell',
    slug: 'don-farrell',
  });
  const image = view.UNSAFE_getByType(Image);
  expect(StyleSheet.flatten(image.props.style).width).toBe(44);
  expect(image.props.accessible).toBe(false);
  expect(image.props.source.uri).toBe('file:///portraits/verified.webp');
  fireEvent(image, 'error');
  expect(view.UNSAFE_queryAllByType(Portrait)).toHaveLength(0);
  expect(view.UNSAFE_getByType(PartyLabel).props.party).toBe('Labor');
});

test.each(['absent', 'failed'] as const)(
  'a photo that is %s leaves the speaker link and party dot without a placeholder',
  async (state) => {
    if (state === 'failed')
      jest.mocked(portraits.get).mockRejectedValue(new Error('offline'));
    const view = render(
      <SpeechRow
        row={decodeRecord(raw)}
        q="housing"
        index={0}
        roster={roster}
        slugs={slugs}
      />,
    );
    await act(async () => {});
    expect(view.UNSAFE_queryAllByType(Portrait)).toHaveLength(0);
    expect(view.getByRole('link', { name: 'Open Don Farrell' })).toBeTruthy();
    const party = view.UNSAFE_getByType(PartyLabel);
    expect(party.props).toMatchObject({
      party: 'Labor',
      linked: false,
      nested: true,
    });
  },
);

test('unresolved or ambiguous speakers do not borrow a person link or portrait', () => {
  const row = decodeRecord(raw);
  expect(speechSpeaker(row, null, slugs)?.slug).toBeUndefined();
  expect(speechSpeaker(row, roster, null)?.slug).toBeUndefined();
  const ambiguous = decodeSlugs({
    generated: '2026-11-11',
    slugs: { ...slugs.slugs, 'other-farrell': 'Don Farrell' },
  });
  expect(speechSpeaker(row, roster, ambiguous)?.slug).toBeUndefined();
  const view = render(
    <SpeechRow
      row={row}
      q="housing"
      index={0}
      roster={roster}
      slugs={ambiguous}
    />,
  );
  expect(view.queryByRole('link', { name: 'Open Don Farrell' })).toBeNull();
  expect(view.getAllByRole('link')).toHaveLength(1);
  expect(portraits.get).not.toHaveBeenCalled();
});

test('a failed person catalogue does not prevent opening the speech', async () => {
  jest.mocked(catalogs.slugs).mockRejectedValue(new Error('offline'));
  const view = render(
    <SpeechResults
      list={list()}
      q="housing"
      filters={defaultSpeechFilters}
      sort="relevance"
      roster={roster}
      variant="group"
      recover={recover}
    />,
  );
  await act(async () => {});
  fireEvent.press(view.getByRole('link'));
  expect(router.push).toHaveBeenCalledWith(
    docRoute(raw.slug, undefined, { q: 'housing', find: 'auto' }),
  );
});

test('an entity result carries its recorded aliases into tolerant automatic find', () => {
  const row = decodeRecord({
    ...raw,
    aliases: ['Example Workers Association', 'EWA'],
  });
  expect(speechRoute(row, '  Example   Union ')).toEqual(
    docRoute('speech-828012', undefined, {
      q: 'Example Union',
      find: 'auto',
      aliases: ['Example Workers Association', 'EWA'],
    }),
  );
});

test.each(['group', 'list'] as const)(
  '%s results retain the arriving entity aliases in each reader link',
  (variant) => {
    const aliases = ['Example Workers Association'];
    const view = render(
      <SpeechResults
        list={list()}
        q="Example Union"
        aliases={aliases}
        filters={defaultSpeechFilters}
        sort="relevance"
        roster={roster}
        variant={variant}
        recover={recover}
      />,
    );
    const row = view.UNSAFE_getByType(RecordRow);
    expect(row.props.href).toEqual(
      docRoute('speech-828012', undefined, {
        q: 'Example Union',
        find: 'auto',
        aliases,
      }),
    );
  },
);
