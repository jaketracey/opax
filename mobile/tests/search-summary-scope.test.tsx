import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { SuggestionRow, Text } from '../src/design/primitives';
import { defaultSpeechFilters } from '../src/features/search/filters';
import { SummaryBlock } from '../src/features/search/SummaryBlock';

jest.mock('../src/api/runtime', () => ({ recordSearch: {}, catalogs: {} }));
jest.mock('../src/features/search/requests', () => ({
  summaryKey: () => 'fixture-summary',
  summaryRequest: jest.fn(),
  useRead: () => ({
    status: 'ready',
    result: {
      data: {
        status: 'ready',
        reviewed_count: 2,
        partial: false,
        points: [
          { text: 'Synthetic fixture summary.', source_ids: ['fixture'] },
        ],
        sources: [
          {
            id: 'fixture',
            title: 'Fixture speech',
            href: '/doc/speech-1',
            kind: 'speech',
            snippet: '',
            evidence: ['Synthetic fixture.'],
          },
        ],
      },
      stale: false,
      savedAt: 1,
      asOf: null,
    },
  }),
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

test.each(['relevance', 'newest', 'oldest'] as const)(
  'the summary describes the relevance-ranked sources when the list order is %s',
  (sort) => {
    let view!: TestRenderer.ReactTestRenderer;
    act(() => {
      view = TestRenderer.create(
        <SummaryBlock
          q="fixture"
          filters={defaultSpeechFilters}
          sort={sort}
          roster={null}
        />,
      );
    });
    act(() => view.root.findByType(SuggestionRow).props.onPress());
    const line = view.root
      .findAllByType(Text)
      .find((node) => node.props.testID === 'summary-scope-line');
    expect(line?.props.children).toBe('From the top 2 speeches for “fixture”');
  },
);
