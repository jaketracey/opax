import { act, StrictMode } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { useNavigationTiming, useScreenReady } from '../src/analytics/timing';
import type { TimedRoute } from '../src/analytics/events';
import { analyticsNow } from '../src/analytics/startup';

let mockNow = 100;
let mockEnabled = true;
const mockTrack = jest.fn();
jest.mock('../src/analytics', () => ({
  analyticsEnabled: () => mockEnabled,
  track: (...args: unknown[]) => mockTrack(...args),
}));
jest.mock('../src/analytics/startup', () => ({
  analyticsNow: jest.fn(() => mockNow),
  bundleStartedAt: 0,
}));
type Listener = (event?: unknown) => void;
const listeners = new Map<string, Set<Listener>>();
let focused = true;
const mockNavigation = {
  isFocused: () => focused,
  isReady: () => true,
  getRootState: () => ({ index: 0, routes: [{ key: route.key }] }),
  addListener: (name: string, listener: Listener) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(listener);
    return () => {
      listeners.get(name)!.delete(listener);
    };
  },
};
jest.mock('expo-router', () => ({
  useNavigationContainerRef: () => mockNavigation,
}));
const route = {
  key: 'visit',
  name: 'person/[slug]',
  params: { slug: 'fixture-name' },
};

function Screen({
  ready,
  pattern = '/person/[slug]',
  embedded = false,
}: {
  ready: boolean;
  pattern?: TimedRoute;
  embedded?: boolean;
}) {
  useScreenReady(pattern, ready, !embedded);
  return null;
}
function App({ ready, pattern, embedded }: Parameters<typeof Screen>[0]) {
  useNavigationTiming();
  return (
    <NavigationContext.Provider value={mockNavigation as never}>
      <NavigationRouteContext.Provider value={route}>
        <Screen ready={ready} pattern={pattern} embedded={embedded} />
      </NavigationRouteContext.Provider>
    </NavigationContext.Provider>
  );
}
function emit(name: string, event?: unknown) {
  act(() => {
    for (const listener of listeners.get(name) ?? []) listener(event);
  });
}
beforeEach(() => {
  route.key += '-next';
  mockNow = 100;
  mockEnabled = true;
  focused = true;
  listeners.clear();
  mockTrack.mockClear();
  jest.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => {
  jest.restoreAllMocks();
});

test.each([
  '/',
  '/person/[slug]',
  '/bill/[key]',
  '/your-mp',
  '/search',
  '/ask',
] as const)(
  '%s reports first content once per focused visit, without params',
  (pattern) => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <StrictMode>
          <App ready={false} pattern={pattern} />
        </StrictMode>,
      );
    });
    expect(mockTrack).not.toHaveBeenCalled();
    mockNow = 175;
    act(() => {
      tree.update(
        <StrictMode>
          <App ready pattern={pattern} />
        </StrictMode>,
      );
    });
    act(() => {
      tree.update(
        <StrictMode>
          <App ready pattern={pattern} />
        </StrictMode>,
      );
    });
    emit('focus');
    expect(mockTrack.mock.calls).toEqual([
      ['opax_screen_ready', { route_pattern: pattern, duration_ms: 75 }],
    ]);
    focused = false;
    emit('blur');
    mockNow = 300;
    focused = true;
    emit('focus');
    emit('focus');
    expect(mockTrack).toHaveBeenCalledTimes(2);
    expect(mockTrack.mock.calls[1]).toEqual([
      'opax_screen_ready',
      { route_pattern: pattern, duration_ms: 0 },
    ]);
    expect(JSON.stringify(mockTrack.mock.calls)).not.toContain('fixture-name');
  },
);

test('offscreen readiness waits for focus, and refreshes cannot add events', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<App ready={false} />);
  });
  focused = false;
  emit('blur');
  mockNow = 200;
  act(() => {
    tree.update(<App ready />);
  });
  expect(mockTrack).not.toHaveBeenCalled();
  focused = true;
  emit('focus');
  act(() => {
    tree.update(<App ready={false} />);
  });
  mockNow = 250;
  act(() => {
    tree.update(<App ready />);
  });
  expect(mockTrack).toHaveBeenCalledTimes(1);
});

test('a screen preloaded offscreen starts its visit when focused', () => {
  focused = false;
  act(() => {
    TestRenderer.create(
      <NavigationContext.Provider value={mockNavigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <Screen ready />
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  mockNow = 600;
  focused = true;
  emit('focus');
  expect(mockTrack.mock.calls).toEqual([
    ['opax_screen_ready', { route_pattern: '/person/[slug]', duration_ms: 0 }],
  ]);
});

test('navigation state starts the timer before first screen render', () => {
  function Observer() {
    useNavigationTiming();
    return null;
  }
  act(() => {
    TestRenderer.create(<Observer />);
  });
  mockNow = 400;
  emit('state', { data: { state: { routes: [{ key: 'different' }] } } });
  mockNow = 500;
  emit('state', {
    data: { state: { routes: [{ state: { routes: [{ key: route.key }] } }] } },
  });
  mockNow = 550;
  act(() => {
    TestRenderer.create(<App ready />);
  });
  expect(mockTrack.mock.calls).toEqual([
    ['opax_screen_ready', { route_pattern: '/person/[slug]', duration_ms: 50 }],
  ]);
});

test('sampling is decided once per visit, including rerenders and readiness changes', () => {
  jest.mocked(Math.random).mockReturnValue(0.9);
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<App ready={false} />);
  });
  act(() => {
    tree.update(<App ready />);
  });
  emit('focus');
  expect(Math.random).toHaveBeenCalledTimes(1);
  expect(mockTrack).not.toHaveBeenCalled();
});

test('remounting a ready screen in the same visit cannot resample or duplicate it', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<App ready />);
  });
  act(() => {
    tree.unmount();
  });
  mockNow = 300;
  act(() => {
    TestRenderer.create(<App ready />);
  });
  expect(Math.random).toHaveBeenCalledTimes(1);
  expect(mockTrack).toHaveBeenCalledTimes(1);
});

test.each([true, false])(
  'embedded panes and gated builds stay silent (%s)',
  (embedded) => {
    mockEnabled = embedded;
    act(() => {
      TestRenderer.create(<App ready embedded={embedded} />);
    });
    expect(mockTrack).not.toHaveBeenCalled();
    expect(Math.random).not.toHaveBeenCalled();
  },
);

// Each isolated runtime models a cold JS launch, rather than resetting
// production timing state through a test-only API.
function coldLaunch(first: string, preloadToday = false) {
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ReactRuntime = require('react') as typeof import('react');
    const Renderer =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('react-test-renderer') as typeof import('react-test-renderer');
    const contexts =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('expo-router/react-navigation') as typeof import('expo-router/react-navigation');
    const timing =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../src/analytics/timing') as typeof import('../src/analytics/timing');
    const todayRoute = { key: 'today-launch', name: 'index' };
    const tab = first === 'index' ? 'today' : first;
    const state = {
      index: 0,
      routes: [
        {
          key: 'tabs',
          name: '(tabs)',
          state: {
            index: 1,
            routes: [
              {
                key: 'inactive',
                name: '(today)',
                state: { routes: [todayRoute] },
              },
              {
                key: 'selected',
                name: `(${tab})`,
                state: {
                  routes: [
                    first === 'index'
                      ? todayRoute
                      : { key: 'other-launch', name: first },
                  ],
                },
              },
            ],
          },
        },
      ],
    };
    jest.spyOn(mockNavigation, 'getRootState').mockReturnValue(state as never);
    function Today() {
      timing.useTodayRendered();
      return null;
    }
    function Root({ showToday }: { showToday: boolean }) {
      timing.useNavigationTiming();
      return showToday
        ? ReactRuntime.createElement(
            contexts.NavigationContext.Provider,
            {
              value: mockNavigation as never,
            },
            ReactRuntime.createElement(
              contexts.NavigationRouteContext.Provider,
              {
                value: todayRoute,
              },
              ReactRuntime.createElement(Today),
            ),
          )
        : null;
    }
    let tree!: import('react-test-renderer').ReactTestRenderer;
    mockNow = 700;
    focused = !preloadToday;
    Renderer.act(() => {
      tree = Renderer.create(
        ReactRuntime.createElement(
          ReactRuntime.StrictMode,
          null,
          ReactRuntime.createElement(Root, {
            showToday: first === 'index' || preloadToday,
          }),
        ),
      );
    });
    mockNow = 50_000;
    focused = true;
    emit('focus');
    Renderer.act(() => {
      tree.update(ReactRuntime.createElement(Root, { showToday: true }));
    });
    Renderer.act(() => {
      tree.unmount();
    });
    Renderer.act(() => {
      tree = Renderer.create(
        ReactRuntime.createElement(Root, { showToday: true }),
      );
    });
    Renderer.act(() => {
      tree.unmount();
    });
  });
}

test('cold start reports once when Today is the first focused route', () => {
  coldLaunch('index');
  expect(mockTrack.mock.calls).toEqual([
    ['opax_app_start', { duration_ms: 700 }],
  ]);
});

test.each(['your-mp', 'bills', 'search', 'ask', 'person/[slug]'])(
  'a cold launch into %s cannot become a cold-start sample when Today opens later',
  (first) => {
    coldLaunch(first);
    expect(mockTrack).not.toHaveBeenCalled();
  },
);

test('Today preloaded behind another launch tab cannot report on later focus', () => {
  coldLaunch('your-mp', true);
  expect(mockTrack).not.toHaveBeenCalled();
});

test('rerendering a pending screen does not read the clock again to initialise its ref', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<App ready={false} />);
  });
  jest.mocked(analyticsNow).mockClear();
  act(() => {
    tree.update(<App ready={false} />);
  });
  act(() => {
    tree.update(<App ready={false} />);
  });
  expect(analyticsNow).not.toHaveBeenCalled();
});
