// The clear bar beside a vertical bar (the closed iPhone Duo), through the
// real stack: its descriptors change on every setOptions of every page in it.
import { act, Profiler, useEffect } from 'react';
import { Stack, router, useNavigation } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { FlatList, Platform, Text as NativeText } from 'react-native';
import { Screen } from '../src/design/layout';
import { loadProfile, type Loaded } from '../src/features/Person';
import { PersonVotes } from '../src/features/people/PersonLists';

let mockBarEdge: 'unspecified' | 'leading' | 'trailing' = 'unspecified';
jest.mock('../modules/opax-root-bar', () => ({
  RootBar: null,
  useVerticalBarEdge: () => mockBarEdge,
}));
jest.mock('react-native-gesture-handler', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./gesture-mock');
});
jest.mock('../src/features/Person', () => ({ loadProfile: jest.fn() }));

const version = Object.getOwnPropertyDescriptor(Platform, 'Version');
beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 27 });
});
afterEach(() => {
  mockBarEdge = 'unspecified';
  if (version) Object.defineProperty(Platform, 'Version', version);
});

const other: { setTitle: (title: string) => void } = {
  setTitle: () => undefined,
};
function Other() {
  const navigation = useNavigation();
  useEffect(() => {
    other.setTitle = (title) => navigation.setOptions({ title });
  }, [navigation]);
  return <NativeText>other</NativeText>;
}
let screenCommits = 0;
function Root() {
  return (
    <Profiler id="screen" onRender={() => (screenCommits += 1)}>
      <Screen testID="root-screen">
        <NativeText>root</NativeText>
      </Screen>
    </Profiler>
  );
}

// Voting record sets its route options as it renders (RouteOptions with
// inline options). With the descriptor read in the page component itself,
// each setOptions re-rendered the page, which set options again: "Maximum
// update depth exceeded" and the error page (b71 review, simulator only).
// Caught in that loop the page never draws its list, and this fails.
test('Voting record under the clear bar settles, and its list gets the rest check', async () => {
  mockBarEdge = 'trailing';
  const vote = {
    name: 'Fixture Bill 2026',
    stage: 'Second reading',
    date: '2026-07-01',
    key: 'au-federal-r1',
  };
  jest.mocked(loadProfile).mockResolvedValue({
    profile: {
      blocks: {
        votes: {
          status: 'ready',
          partial: false,
          sources: [],
          data: { for: [vote], against: [], ayes: 1, noes: 0 },
        },
      },
    },
  } as unknown as Loaded);
  const rendered = renderRouter({
    _layout: () => <Stack screenOptions={{ headerTransparent: true }} />,
    index: () => <NativeText>root</NativeText>,
    'person/[slug]/votes': PersonVotes,
  });
  await act(async () => router.push('/person/fixture-member/votes'));
  await act(async () => undefined);
  const list = rendered.UNSAFE_root.findByType(FlatList);
  expect(list.props.testID).toBe('person-votes-screen');
  // The clear bar was read from the real stack's descriptors.
  expect(list.props.scrollEventThrottle).toBe(16);
  expect(typeof list.props.onScrollBeginDrag).toBe('function');
  await act(async () => rendered.unmount());
});

test.each([
  ['unspecified', false],
  ['trailing', true],
] as const)(
  'beside a %s bar, another page changing its options re-renders Screen: %s',
  async (edge, rerenders) => {
    mockBarEdge = edge;
    const rendered = renderRouter({
      _layout: () => <Stack screenOptions={{ headerTransparent: true }} />,
      index: Root,
      other: Other,
    });
    await act(async () => router.push('/other'));
    await act(async () => undefined);
    const before = screenCommits;
    // As a bar title fading in on scroll does, on a page above this one.
    await act(async () => other.setTitle('One'));
    await act(async () => other.setTitle('Two'));
    // iPhone, iPad and the unfolded Duo: Screen does not read the stack's
    // options, so it neither subscribes nor re-renders. Beside a vertical
    // bar it must, to know its bar is clear.
    expect(screenCommits > before).toBe(rerenders);
    await act(async () => rendered.unmount());
  },
);
