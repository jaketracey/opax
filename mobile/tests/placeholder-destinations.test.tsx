import { useIsPreview } from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { act, type ReactElement, type ReactNode } from 'react';
import { ScrollView } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Catalogs } from '../src/api/catalogs';
import BillDetail from '../src/features/bills/BillDetail';
import Person from '../src/features/Person';
import { PersonVotes } from '../src/features/people/PersonLists';
import { PeopleDepth } from '../src/features/people/data';
import Members from '../src/features/your-mp/Members';
import { index, pinned, slugs } from './pinned';

const mockParams: Record<string, string> = {};
// The real decoders and pinned records let each destination finish loading.
const client = {
  get: async <T,>(path: string, decode: (raw: unknown) => T) => ({
    data: decode(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    savedAt: 1000,
    asOf: null,
  }),
};
const mockCatalogs = new Catalogs(client);
const mockDepth = new PeopleDepth(client as never);
jest.mock('../src/api/runtime', () => ({
  get catalogs() {
    return mockCatalogs;
  },
  get peopleDepth() {
    return mockDepth;
  },
  portraits: { get: jest.fn(async () => null) },
}));
jest.mock('expo-router', () => ({
  useIsPreview: jest.fn(() => false),
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), navigate: jest.fn() },
  Stack: {
    // Any accidental destination Stack.Screen use must fail this regression.
    Screen: () => {
      throw new Error('unguarded Stack.Screen');
    },
    Toolbar: Object.assign(() => null, {
      Button: () => null,
      Spacer: () => null,
    }),
  },
  Link: Object.assign(({ children }: { children?: ReactNode }) => children, {
    Trigger: ({ children }: { children?: ReactNode }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));

const pages: [string, Record<string, string>, () => ReactElement, string][] = [
  ['bill', { key: 'au-federal-r7534' }, () => <BillDetail />, 'bill-title'],
  ['person', { slug: 'penny-wong' }, () => <Person />, 'person-screen-title'],
  [
    'member list',
    {
      seat: index.electorates.find((seat) => seat.chamber === 'senate')!
        .electorate_id,
    },
    () => <Members />,
    'members-title',
  ],
  [
    'voting record',
    { slug: 'penny-wong' },
    () => <PersonVotes />,
    'person-votes-screen',
  ],
  [
    'vote on a bill',
    { key: 'au-federal-r7534', section: 'divisions' },
    () => <BillDetail />,
    'bill-title',
  ],
];

test.each(pages)(
  '%s loads and scrolls with Expo placeholder navigation and no preview provider',
  async (_name, params, page, readyID) => {
    for (const key of Object.keys(mockParams)) delete mockParams[key];
    Object.assign(mockParams, params);
    const setOptions = jest.fn(() => {
      throw new Error('Options cannot be set from a placeholder screen.');
    });
    const dispatch = jest.fn(() => {
      throw new Error(
        'Actions cannot be dispatched from a placeholder screen.',
      );
    });
    const navigation = {
      getState: () => ({ index: 0, routes: [{ key: 'today', name: 'index' }] }),
      setOptions,
      dispatch,
      isFocused: () => false,
      addListener: () => () => {},
      removeListener: () => {},
    };
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider
            value={{ key: 'preview', name: 'destination' }}
          >
            {page()}
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    expect(useIsPreview()).toBe(false);
    expect(
      renderer.root.findAll((node) => node.props.testID === readyID).length,
    ).toBeGreaterThan(0);
    act(() => {
      for (const node of renderer.root.findAllByType(ScrollView))
        node.props.onScroll?.({
          nativeEvent: {
            contentOffset: { x: 0, y: 1200 },
            layoutMeasurement: { width: 390, height: 844 },
            contentSize: { width: 390, height: 4000 },
          },
        });
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(setOptions).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  },
);
