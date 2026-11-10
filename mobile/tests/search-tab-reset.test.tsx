import { NavigationContext } from 'expo-router/react-navigation';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { act } from 'react';
import { Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';
import TabsLayout from '../src/app/(tabs)/_layout';
import {
  requestSearchTabReset,
  useSearchTabReset,
} from '../src/features/search/tab-reset';

let mockSegments = ['(tabs)', '(today)', 'index'];
jest.mock('expo-router', () => ({
  useSegments: () => mockSegments,
}));
jest.mock('../modules/opax-ipad', () => ({ OpaxIPad: null }));
jest.mock('../src/navigation/AndroidTabs', () => ({
  AndroidTabs: () => null,
}));
jest.mock('expo-router/unstable-native-tabs', () => {
  const Container = ({ children }: { children: unknown }) => children;
  return {
    NativeTabs: Object.assign(Container, {
      Trigger: Object.assign(
        ({ children }: { children: unknown }) => children,
        { Label: Container, Icon: () => null },
      ),
    }),
  };
});

function Root({ reset }: { reset: () => void }) {
  useSearchTabReset(reset);
  return null;
}
function mount(element: React.ReactElement) {
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(element);
  });
  return view;
}
const originalOS = Platform.OS;
const originalVersion = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
afterEach(() => {
  // Consume any request whose target was not mounted in a layout-only test.
  const drain = mount(<Root reset={() => {}} />);
  act(() => drain.unmount());
  Platform.OS = originalOS;
  Object.defineProperty(Platform, 'Version', originalVersion);
});

test.each([25, 26, 27])(
  'Search selection and its minimised floating trigger reset only the Search stack on iOS %s',
  (version) => {
    Platform.OS = 'ios';
    Object.defineProperty(Platform, 'Version', { get: () => version });
    for (const from of ['(today)', '(search)']) {
      mockSegments = ['(tabs)', from, 'bill', 'au-federal-example'];
      const view = mount(<TabsLayout />);
      const search = view.root.findByProps({ testID: 'tab-search' });
      expect(search.props.role).toBe(version >= 26 ? 'search' : undefined);
      const navigation = {
        dispatch: jest.fn(),
        getState: () => ({
          routes: [
            { key: 'today', state: { key: 'today-stack', index: 3 } },
            { key: 'search', state: { key: 'search-stack', index: 2 } },
          ],
        }),
      };
      const listener = search.props.listeners({
        navigation,
        route: { key: 'search' },
      });
      act(() => listener.tabPress({ data: { isPrevented: false } }));
      expect(navigation.dispatch).toHaveBeenCalledWith({
        type: 'POP_TO_TOP',
        target: 'search-stack',
      });
      const reset = jest.fn();
      const root = mount(<Root reset={reset} />);
      expect(reset).toHaveBeenCalledTimes(1);
      act(() => listener.tabPress({ data: { isPrevented: false } }));
      expect(reset).toHaveBeenCalledTimes(2);
      act(() => listener.tabPress({ data: { isPrevented: true } }));
      expect(reset).toHaveBeenCalledTimes(2);
      expect(navigation.dispatch).toHaveBeenCalledTimes(2);
      act(() => {
        root.unmount();
        view.unmount();
      });
    }
  },
);

test('a request waits for the retained Search root to regain focus after a pop', () => {
  let focused = false;
  const focusListeners = new Set<() => void>();
  const navigation = {
    isFocused: () => focused,
    addListener: (_name: string, listener: () => void) => {
      focusListeners.add(listener);
      return () => focusListeners.delete(listener);
    },
  };
  const reset = jest.fn();
  const view = mount(
    <NavigationContext.Provider value={navigation as never}>
      <Root reset={reset} />
    </NavigationContext.Provider>,
  );
  act(() => requestSearchTabReset());
  expect(reset).not.toHaveBeenCalled();
  act(() => {
    focused = true;
    focusListeners.forEach((listener) => listener());
  });
  expect(reset).toHaveBeenCalledTimes(1);
  act(() => focusListeners.forEach((listener) => listener()));
  expect(reset).toHaveBeenCalledTimes(1);
  act(() => view.unmount());
  expect(focusListeners.size).toBe(0);
});

test('first selection and reselect at the Search root reset without a pop action', () => {
  Platform.OS = 'ios';
  const view = mount(<TabsLayout />);
  const search = view.root.findByProps({ testID: 'tab-search' });
  const reset = jest.fn();
  const root = mount(<Root reset={reset} />);
  for (const state of [undefined, { key: 'search-stack', index: 0 }]) {
    const navigation = {
      dispatch: jest.fn(),
      getState: () => ({ routes: [{ key: 'search', state }] }),
    };
    const listener = search.props.listeners({
      navigation,
      route: { key: 'search' },
    });
    act(() => listener.tabPress({ data: { isPrevented: false } }));
    expect(navigation.dispatch).not.toHaveBeenCalled();
  }
  expect(reset).toHaveBeenCalledTimes(2);
  act(() => {
    root.unmount();
    view.unmount();
  });
});

test('Today, Your MP and Bills retain native pop and scroll-to-top on reselect', () => {
  Platform.OS = 'ios';
  const view = mount(<TabsLayout />);
  for (const name of ['(today)', '(your-mp)', '(bills)']) {
    const trigger = view.root
      .findAllByType(NativeTabs.Trigger)
      .find((node) => node.props.name === name)!;
    expect(trigger.props.disablePopToTop).toBe(false);
    expect(trigger.props.disableScrollToTop).toBe(false);
  }
  act(() => view.unmount());
});
