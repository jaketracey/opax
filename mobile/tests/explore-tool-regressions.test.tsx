import { router } from 'expo-router';
import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { LinkRow, SegmentedControl } from '../src/design/primitives';
import Matrix from '../src/features/explore/Matrix';
import Tide from '../src/features/explore/Tide';
import { ReadState } from '../src/features/reports/parts';
import { topicRoute } from '../src/navigation/routes/search';

let mockData: unknown;
jest.mock('../src/api/useRead', () => ({
  useRead: () => ({
    record: { data: mockData, stale: false, savedAt: 1, asOf: null },
    error: null,
    retry: jest.fn(),
  }),
}));
jest.mock('../src/api/runtime', () => ({ reports: { matrix: jest.fn() } }));
jest.mock('../src/features/explore/runtime', () => ({
  explore: { tide: jest.fn() },
}));
jest.mock('../src/features/explore/parts', () => ({
  ExploreChrome: () => null,
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useSegments: () => [],
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));

test('the matrix displays the recorded Other share', () => {
  mockData = {
    labelled: 4,
    parties: ['Labor', 'Other'],
    totals: { housing: 4 },
    cells: { housing: { Labor: 3, Other: 1 } },
  };
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(<Matrix />);
  });
  const lines = view.root.findAllByType(NativeText).map((node) =>
    [node.props.children]
      .flat(Infinity)
      .filter((value) => typeof value === 'string')
      .join(''),
  );
  expect(lines).toContain('Other: 25%');
});

test('the tide topic total keeps the selected parliament scope', () => {
  mockData = { decades: [], topics: {} };
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(<Tide />);
  });
  const total = () => view.root.findAllByType(LinkRow)[0]!;
  act(() => total().props.onPress());
  const slug = jest.mocked(router.push).mock.calls.at(-1)![0] as ReturnType<
    typeof topicRoute
  >;
  expect(slug.params).toMatchObject({ state: 'federal' });
  act(() =>
    view.root.findAllByType(SegmentedControl)[0]!.props.onChange('all'),
  );
  act(() => total().props.onPress());
  const all = jest.mocked(router.push).mock.calls.at(-1)![0] as ReturnType<
    typeof topicRoute
  >;
  expect(all.params.state).toBeUndefined();
});

test('the tide note names all five parliaments when All five is chosen', () => {
  mockData = { decades: [], topics: {} };
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(<Tide />);
  });
  act(() =>
    view.root.findAllByType(SegmentedControl)[0]!.props.onChange('all'),
  );
  const note = view.root.findByType(ReadState).props.sheet(mockData).notes[0];
  expect(note).not.toContain('federal parliament');
  expect(note).toContain('New South Wales');
});
