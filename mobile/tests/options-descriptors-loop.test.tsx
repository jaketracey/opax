import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  act,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { DescriptorsContext } from 'expo-router/build/fork/native-stack/descriptors-context';
import { useClearRailBar, usePushedClearFade } from '../src/navigation/chrome';

// Build 84, the closed iPhone Duo: the Bills tab showed the error page
// ("Maximum update depth exceeded"). The list sets its own bar options and
// had begun to read the stack's descriptors beside the rail, so each
// setOptions re-rendered it, it built its options again and set them again.

let mockBarEdge: 'unspecified' | 'trailing' = 'unspecified';
jest.mock('../modules/opax-root-bar', () => ({
  RootBar: null,
  useVerticalBarEdge: () => mockBarEdge,
}));

const routes = [
  { key: 'root', name: 'bills' },
  { key: 'pushed', name: 'bill-list' },
];
const state = {
  index: 0,
  routes,
  routeNames: ['bills', 'bill/[key]', 'explore/[tool]', 'bill-list'],
};

/**
 * A stack as the real one behaves: setOptions publishes new descriptors,
 * and every reader of them renders again.
 */
function Stack({ route, children }: { route: number; children: ReactNode }) {
  const [descriptors, setDescriptors] = useState<Record<string, unknown>>({
    root: { options: { headerTransparent: true } },
    pushed: { options: { headerTransparent: true } },
  });
  const key = routes[route]!.key;
  // Stable, as a navigation object is: only the descriptors change.
  const navigation = useMemo(
    () => ({
      setOptions: (options: Record<string, unknown>) =>
        setDescriptors((old) => ({
          ...old,
          [key]: {
            options: {
              ...(old[key] as { options: object }).options,
              ...options,
            },
          },
        })),
      getState: () => state,
      isFocused: () => true,
      addListener: () => () => {},
    }),
    [key],
  );
  return (
    <NavigationContext.Provider value={navigation as never}>
      <NavigationRouteContext.Provider value={routes[route] as never}>
        <DescriptorsContext.Provider value={descriptors as never}>
          {children}
        </DescriptorsContext.Provider>
      </NavigationRouteContext.Provider>
    </NavigationContext.Provider>
  );
}

/** A page as Bills is: it builds its options on every render and sets them. */
function Page({ read }: { read: () => boolean }) {
  read();
  const navigation = useContext(NavigationContext) as unknown as {
    setOptions(options: object): void;
  };
  // New on every render, on purpose: that is what the page does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = { headerSearchBarOptions: { placeholder: 'Search bills' } };
  // As RouteOptions does: set whenever the page hands over new options.
  // A loop is cut off here, where React would throw in the app.
  useLayoutEffect(() => {
    if (rendered.mock.calls.length < 40) navigation.setOptions(options);
  }, [navigation, options]);
  rendered();
  return null;
}
const rendered = jest.fn();

async function open(read: () => boolean, route: number) {
  rendered.mockClear();
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <Stack route={route}>
        <Page read={read} />
      </Stack>,
    );
  });
  // Let any chain of option sets run; a loop never settles.
  for (let i = 0; i < 20; i++) await act(async () => {});
  const total = rendered.mock.calls.length;
  act(() => renderer.unmount());
  return total;
}

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'ios');
});
afterEach(() => {
  mockBarEdge = 'unspecified';
});

describe('a page that sets its own bar options', () => {
  test('beside the rail it settles: its fade hook does not read the descriptors', async () => {
    mockBarEdge = 'trailing';
    expect(await open(usePushedClearFade, 0)).toBeLessThan(6);
    expect(await open(usePushedClearFade, 1)).toBeLessThan(6);
  });

  test('the descriptor-reading hook there never settles, which is why such a page may not call it', async () => {
    mockBarEdge = 'trailing';
    expect(await open(useClearRailBar, 0)).toBeGreaterThan(15);
  });

  test('a tab root off the rail settles with either hook', async () => {
    expect(await open(usePushedClearFade, 0)).toBeLessThan(6);
    expect(await open(useClearRailBar, 0)).toBeLessThan(6);
  });
});

// Any page doing this again is caught here, whatever its tests mock.
test('no feature page reads the stack descriptors itself', () => {
  const root = join(__dirname, '..', 'src', 'features');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(root);
  const offenders = files.filter((path) =>
    /\buseClearRailBar\(|\buse\(DescriptorsContext\)|\busePushedPlainClear\(|\busePushedRailBar\(/.test(
      readFileSync(path, 'utf8'),
    ),
  );
  expect(offenders.map((path) => relative(root, path))).toEqual([]);
});
