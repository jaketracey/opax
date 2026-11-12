import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { defaultSpeechFilters } from '../src/features/search/filters';
import {
  request,
  resetSearchSession,
  speechKey,
} from '../src/features/search/requests';
import {
  resetShownPages,
  useSpeechList,
  type SpeechList,
} from '../src/features/search/speeches';

jest.mock('../src/api/runtime', () => ({ recordSearch: {}, catalogs: {} }));
jest.mock('../src/features/search/eligibility', () => ({
  eligibleRecord: () => true,
  eligibleSummary: () => undefined,
}));

const row = (slug: string) => ({
  kind: 'speech',
  title: `Fixture ${slug}`,
  slug,
  resource: '',
  snippet: '',
});
const page = (n: number, slugs: string[]) => ({
  data: {
    query: 'fixture',
    kind: 'speech',
    sort: 'relevance',
    page: n,
    page_count: 2,
    total: 4,
    results: slugs.map(row),
  },
  stale: false,
  savedAt: 1,
  asOf: null,
});

beforeEach(() => {
  resetSearchSession();
  resetShownPages();
});

test('a record repeated on the next ranked page is drawn once', async () => {
  const f = defaultSpeechFilters;
  let list!: SpeechList;
  function Probe() {
    list = useSpeechList('fixture', f, 'relevance', {} as never, 'rule');
    return null;
  }
  await act(async () => {
    await request(
      speechKey('fixture', f, 1),
      async () => page(1, ['a', 'b']) as never,
    );
    TestRenderer.create(<Probe />);
  });
  await act(async () => {
    await request(
      speechKey('fixture', f, 2),
      async () => page(2, ['b', 'c']) as never,
    );
    list.loadMore();
  });
  expect(list.rows!.map((r) => r.slug)).toEqual(['a', 'b', 'c']);
});
