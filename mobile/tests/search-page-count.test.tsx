import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { LinkRow } from '../src/design/primitives';
import { defaultSpeechFilters } from '../src/features/search/filters';
import {
  GroupResults,
  useGroupList,
} from '../src/features/search/GroupResults';
import {
  groupKey,
  request,
  resetSearchSession,
  speechKey,
} from '../src/features/search/requests';
import {
  resetShownPages,
  useSpeechList,
} from '../src/features/search/speeches';
import { SpeechResults } from '../src/features/search/SpeechResults';

jest.mock('../src/api/runtime', () => ({ recordSearch: {}, catalogs: {} }));
jest.mock('../src/features/search/SummaryBlock', () => ({
  SummaryBlock: () => null,
}));
jest.mock('../src/features/search/eligibility', () => ({
  ...jest.requireActual('../src/features/search/eligibility'),
  eligibleRecord: (row: { slug: string }) => row.slug !== 'fixture-0',
}));
jest.mock('expo-router', () => ({
  useSegments: () => [],
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));

const recover = {
  onAsk: jest.fn(),
  onAll: jest.fn(),
  onClearFilters: jest.fn(),
  onUnquote: jest.fn(),
  onSpeeches: jest.fn(),
};
const page = (total: number, kind: string) => ({
  data: {
    query: 'fixture',
    kind,
    page: 1,
    per_page: 20,
    page_count: Math.ceil(total / 20),
    total,
    truncated: false,
    results: Array.from({ length: 20 }, (_, i) => ({
      slug: `fixture-${i}`,
      kind: i === 0 && kind === 'interest' ? 'lead' : kind,
      title: `Fixture record ${i}`,
      resource: '',
      snippet: '',
      href: `/doc/fixture-${i}`,
    })),
  },
  stale: false,
  savedAt: 1,
  asOf: null,
});
beforeEach(() => {
  resetSearchSession();
  resetShownPages();
});

test.each([
  ['speech', 21, 'Show 1 more speech'],
  ['press_release', 25, 'Show 5 more records'],
  ['speech', 40, 'Show 20 more speeches'],
  ['speech', 41, 'Show 20 more speeches'],
])(
  'the %s list with total %i names the next page size',
  async (kind, total, label) => {
    const filters = { ...defaultSpeechFilters, kind };
    function List() {
      const list = useSpeechList(
        'fixture',
        filters,
        'relevance',
        {} as never,
        'rule',
      );
      return (
        <SpeechResults
          list={list}
          q="fixture"
          filters={filters}
          sort="relevance"
          roster={null}
          variant="list"
          recover={recover}
        />
      );
    }
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      await request(
        speechKey('fixture', filters, 1),
        async () => page(total as number, kind as string) as never,
      );
      view = TestRenderer.create(<List />);
    });
    expect(
      view.root
        .findAllByType(LinkRow)
        .find((node) => node.props.testID === 'results-more')!.props.title,
    ).toBe(label);
  },
);

test.each([
  [21, 'Show 1 more declared interest'],
  [25, 'Show 5 more declared interests'],
  [40, 'Show 20 more declared interests'],
])(
  'the register list with total %i names the next page size despite a filtered row',
  async (total, label) => {
    function List() {
      const list = useGroupList('interests', 'fixture');
      return (
        <GroupResults
          group="interests"
          list={list}
          q="fixture"
          recover={recover}
        />
      );
    }
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      await request(
        groupKey('interests', 'fixture', 1),
        async () => page(total, 'interest') as never,
      );
      view = TestRenderer.create(<List />);
    });
    expect(
      view.root
        .findAllByType(LinkRow)
        .find((node) => node.props.testID === 'results-more')!.props.title,
    ).toBe(label);
  },
);
