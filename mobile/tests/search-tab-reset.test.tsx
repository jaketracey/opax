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

// The system's rule for a tab, which Search now follows (build 80 sweep:
// Members opened in Search, a visit to Bills, then Search again landed on
// Search's root): a press while the tab is in front goes to its root; a
// press from another tab returns to where the tab was left.
const searchStack = (index: number) => ({
  routes: [
    { key: 'today', state: { key: 'today-stack', index: 3 } },
    { key: 'search', state: { key: 'search-stack', index } },
  ],
});
function searchTrigger(version: number, focused: boolean, index = 2) {
  Platform.OS = 'ios';
  Object.defineProperty(Platform, 'Version', { get: () => version });
  const view = mount(<TabsLayout />);
  const search = view.root.findByProps({ testID: 'tab-search' });
  const navigation = {
    dispatch: jest.fn(),
    // Heard before the tab changes: the tab in front when it was pressed.
    isFocused: () => focused,
    getState: () => searchStack(index),
  };
  const listener = search.props.listeners({
    navigation,
    route: { key: 'search' },
  });
  return { view, search, navigation, listener };
}

test.each([25, 26, 27])(
  'iOS %s: Search pressed from another tab keeps its stack and its field: Members is still open',
  (version) => {
    // Members is open in Search (index 1); the reader is on Bills.
    mockSegments = ['(tabs)', '(bills)', 'bill-list'];
    const { view, search, navigation, listener } = searchTrigger(
      version,
      false,
      1,
    );
    expect(search.props.role).toBe(version >= 26 ? 'search' : undefined);
    const reset = jest.fn();
    const root = mount(<Root reset={reset} />);
    act(() => listener.tabPress({ data: { isPrevented: false } }));
    expect(navigation.dispatch).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    act(() => {
      root.unmount();
      view.unmount();
    });
  },
);

test.each([25, 26, 27])(
  'iOS %s: a second press of Search while on it, or its floating button on a pushed Search page, pops only the Search stack and clears the field',
  (version) => {
    mockSegments = ['(tabs)', '(search)', 'directory'];
    const { view, navigation, listener } = searchTrigger(version, true);
    const reset = jest.fn();
    const root = mount(<Root reset={reset} />);
    act(() => listener.tabPress({ data: { isPrevented: false } }));
    expect(navigation.dispatch).toHaveBeenCalledTimes(1);
    expect(navigation.dispatch).toHaveBeenCalledWith({
      type: 'POP_TO_TOP',
      target: 'search-stack',
    });
    expect(reset).toHaveBeenCalledTimes(1);
    // A press the system refused does nothing.
    act(() => listener.tabPress({ data: { isPrevented: true } }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(navigation.dispatch).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
      view.unmount();
    });
  },
);

test('the two presses in order: away and back keeps Members, then a press on Search itself goes to the root', () => {
  mockSegments = ['(tabs)', '(bills)', 'bill-list'];
  let focused = false;
  Platform.OS = 'ios';
  const view = mount(<TabsLayout />);
  const search = view.root.findByProps({ testID: 'tab-search' });
  const navigation = {
    dispatch: jest.fn(),
    isFocused: () => focused,
    getState: () => searchStack(1),
  };
  const listener = search.props.listeners({
    navigation,
    route: { key: 'search' },
  });
  act(() => listener.tabPress({ data: { isPrevented: false } }));
  expect(navigation.dispatch).not.toHaveBeenCalled();
  // The tab has changed: Search is in front, Members on top of it.
  focused = true;
  act(() => listener.tabPress({ data: { isPrevented: false } }));
  expect(navigation.dispatch).toHaveBeenCalledWith({
    type: 'POP_TO_TOP',
    target: 'search-stack',
  });
  act(() => view.unmount());
});

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

test('a reselect at the Search root clears the field without a pop action; a first selection does neither', () => {
  Platform.OS = 'ios';
  const view = mount(<TabsLayout />);
  const search = view.root.findByProps({ testID: 'tab-search' });
  const reset = jest.fn();
  const root = mount(<Root reset={reset} />);
  // First selection: Search is not in front and has no stack yet.
  const first = { dispatch: jest.fn(), isFocused: () => false };
  act(() =>
    search.props
      .listeners({
        navigation: {
          ...first,
          getState: () => ({ routes: [{ key: 'search', state: undefined }] }),
        },
        route: { key: 'search' },
      })
      .tabPress({ data: { isPrevented: false } }),
  );
  expect(first.dispatch).not.toHaveBeenCalled();
  expect(reset).not.toHaveBeenCalled();
  // Reselect at the root: nothing to pop, the field is cleared.
  const again = { dispatch: jest.fn(), isFocused: () => true };
  act(() =>
    search.props
      .listeners({
        navigation: {
          ...again,
          getState: () => ({
            routes: [
              { key: 'search', state: { key: 'search-stack', index: 0 } },
            ],
          }),
        },
        route: { key: 'search' },
      })
      .tabPress({ data: { isPrevented: false } }),
  );
  expect(again.dispatch).not.toHaveBeenCalled();
  expect(reset).toHaveBeenCalledTimes(1);
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
