import { act, type ReactElement } from 'react';
import { Text as NativeText, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
} from 'react-native-safe-area-context';
import overview from '../scripts/fixtures/vic-election/overview.json';
import seat from '../scripts/fixtures/vic-election/albert-park.json';
import {
  decodeOverview,
  decodeSeat,
} from '../src/features/vic-election/decoders';
import type { ElectionRead } from '../src/features/vic-election/reads';
import type {
  Overview,
  SeatDetail,
} from '../src/features/vic-election/decoders';
import { withNavigationOptions } from './navigation-options';

export const mockVic = {
  now: new Date('2026-11-20T10:00:00+11:00'),
  overview: {
    record: {
      data: decodeOverview(overview),
      stale: false,
      savedAt: Date.parse('2026-11-12'),
      asOf: null,
    },
    error: null,
    loading: false,
  } as ElectionRead<Overview>,
  seat: {
    record: {
      data: decodeSeat(seat),
      stale: false,
      savedAt: Date.parse('2026-11-12'),
      asOf: null,
    },
    error: null,
    loading: false,
  } as ElectionRead<SeatDetail>,
  params: {} as Record<string, string>,
  find: jest.fn(),
};
jest.mock('../src/api/runtime', () => ({
  apiClient: {},
  catalogs: {},
  portraits: { get: jest.fn(async () => null) },
}));
jest.mock('../src/features/vic-election/clock', () => ({
  useElectionNow: () => mockVic.now,
}));
jest.mock('../src/features/vic-election/reads', () => ({
  ...jest.requireActual('../src/features/vic-election/reads'),
  useOverview: () => ({ ...mockVic.overview, retry: jest.fn() }),
  useElectionSeat: () => ({ ...mockVic.seat, retry: jest.fn() }),
  electionReads: { find: (...args: unknown[]) => mockVic.find(...args) },
}));
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
jest.mock('../src/api/useOffline', () => ({ useOffline: () => false }));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const Link = ({ children, ...props }: { children: React.ReactNode }) =>
    React.createElement('Link', props, children);
  Link.Trigger = ({ children }: { children: React.ReactNode }) => children;
  function Noop() {
    return null;
  }
  Link.Preview = Link.Menu = Link.MenuAction = Noop;
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    Link,
    useLocalSearchParams: () => mockVic.params,
    useFocusEffect: jest.fn(),
    useIsPreview: () => false,
  };
});
export function resetVic() {
  mockVic.now = new Date('2026-11-20T10:00:00+11:00');
  mockVic.overview = {
    record: {
      data: decodeOverview(overview),
      stale: false,
      savedAt: Date.parse('2026-11-12'),
      asOf: null,
    },
    error: null,
    loading: false,
  };
  mockVic.seat = {
    record: {
      data: decodeSeat(seat),
      stale: false,
      savedAt: Date.parse('2026-11-12'),
      asOf: null,
    },
    error: null,
    loading: false,
  };
  mockVic.params = {};
  mockVic.find.mockReset();
}
export function renderVic(element: ReactElement) {
  let result!: TestRenderer.ReactTestRenderer;
  act(() => {
    result = TestRenderer.create(
      withNavigationOptions(
        <SafeAreaFrameContext.Provider
          value={{ x: 0, y: 0, width: 390, height: 844 }}
        >
          <SafeAreaInsetsContext.Provider
            value={{ top: 47, bottom: 34, left: 0, right: 0 }}
          >
            <View>{element}</View>
          </SafeAreaInsetsContext.Provider>
        </SafeAreaFrameContext.Provider>,
        () => {},
      ),
    );
  });
  return result;
}
export const words = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(NativeText)
    .map((n) => n.props.children)
    .flat(10)
    .filter((x) => typeof x === 'string' || typeof x === 'number')
    .join(' ');
