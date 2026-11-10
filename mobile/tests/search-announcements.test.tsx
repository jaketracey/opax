import { act } from 'react';
import { AccessibilityInfo } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { decodeRecord } from '../src/features/search/decoders';
import { defaultSpeechFilters } from '../src/features/search/filters';
import type { SpeechList } from '../src/features/search/speeches';
import { SpeechResults } from '../src/features/search/SpeechResults';

jest.mock('../src/api/runtime', () => ({ recordSearch: {}, catalogs: {} }));
jest.mock('expo-router', () => ({
  useSegments: () => [],
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));

const rows = Array.from({ length: 3 }, (_, i) =>
  decodeRecord({
    slug: `speech-${i + 1}`,
    title: `Fixture speech ${i + 1}`,
    kind: 'speech',
    resource: '',
    snippet: '',
  }),
);
const list = (count: number, pages = 1): SpeechList => ({
  first: { status: 'ready', result: {} } as SpeechList['first'],
  rows: rows.slice(0, count),
  total: 40,
  more: false,
  next: null,
  pages,
  source: null,
  count: '40 speeches',
  load: jest.fn(),
  loadMore: jest.fn(),
  retry: jest.fn(),
});
const recover = {
  onAsk: jest.fn(),
  onAll: jest.fn(),
  onClearFilters: jest.fn(),
  onUnquote: jest.fn(),
  onSpeeches: jest.fn(),
};
const draw = (q: string, value: SpeechList) => (
  <SpeechResults
    list={value}
    q={q}
    filters={defaultSpeechFilters}
    sort="relevance"
    roster={null}
    variant="list"
    recover={recover}
    announce
  />
);

test('VoiceOver announces the actual newly loaded rows and a new query with the same total', () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  let view!: TestRenderer.ReactTestRenderer;
  try {
    act(() => {
      view = TestRenderer.create(draw('housing', list(2)));
    });
    expect(announce).toHaveBeenLastCalledWith('40 speeches for housing');
    announce.mockClear();
    act(() => view.update(draw('housing', list(2, 2))));
    expect(announce).not.toHaveBeenCalled();
    act(() => view.update(draw('housing', list(3, 2))));
    expect(announce).toHaveBeenLastCalledWith('1 more speech loaded');
    act(() => view.update(draw('education', list(2))));
    expect(announce).toHaveBeenLastCalledWith('40 speeches for education');
  } finally {
    announce.mockRestore();
  }
});

test('media release results do not offer a speech summary', () => {
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(
      <SpeechResults
        list={{
          ...list(3),
          rows: rows.map((row) => ({ ...row, kind: 'press_release' })),
        }}
        q="fixture"
        filters={{ ...defaultSpeechFilters, kind: 'press_release' }}
        sort="relevance"
        roster={null}
        variant="list"
        recover={recover}
      />,
    );
  });
  expect(
    view.root.findAll((node) => node.props.testID === 'results-summarise'),
  ).toHaveLength(0);
});
