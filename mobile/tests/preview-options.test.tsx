import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { useIsPreview } from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { act, useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Screen } from '../src/design/layout';
import Methods from '../src/features/methods/Methods';
import { RouteOptions, useSafeSetOptions } from '../src/navigation/preview';
import { useTitleOnScroll } from '../src/navigation/useTitleOnScroll';

const mockSetOptions = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useIsPreview: jest.fn(),
  Link: Object.assign(({ children }: { children?: ReactNode }) => children, {
    Trigger: ({ children }: { children?: ReactNode }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
  Stack: {
    Screen: ({ options }: { options: object }) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useEffect } = require('react');
      useEffect(() => mockSetOptions(options), [options]);
      return null;
    },
  },
}));
jest.mock('../src/features/methods/repository', () => ({
  reference: {
    summary: jest.fn(async () => ({ data: null, stale: false, savedAt: null })),
  },
  stateCoverage: () => [],
}));

function ScrollPage() {
  const { setAnchorBottom, onScroll } = useTitleOnScroll(null, 'Destination');
  useEffect(() => setAnchorBottom(40), [setAnchorBottom]);
  return <View onTouchEnd={() => onScroll(500)} />;
}

const destinations: [string, () => ReactNode][] = [
  [
    'Screen with a bar title',
    () => (
      <Screen barTitle="Destination">
        <View />
      </Screen>
    ),
  ],
  ['scroll title page', () => <ScrollPage />],
  ['methods reader', () => <Methods />],
  [
    'dynamic Stack.Screen options',
    () => <RouteOptions options={{ title: 'Destination' }} />,
  ],
];

afterEach(() => jest.clearAllMocks());

test.each([false, true])(
  'a placeholder is safe even without preview context, registered route = %s',
  async (registered) => {
    jest.mocked(useIsPreview).mockReturnValue(false);
    const setOptions = jest.fn(() => {
      throw new Error('Options cannot be set from a placeholder screen.');
    });
    const dispatch = jest.fn(() => {
      throw new Error(
        'Actions cannot be dispatched from a placeholder screen.',
      );
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <NavigationContext.Provider
          value={
            {
              setOptions,
              dispatch,
              isFocused: () => false,
              addListener: () => () => {},
              removeListener: () => {},
              getState: () => ({ routes: [{ key: 'real', name: 'index' }] }),
            } as never
          }
        >
          <NavigationRouteContext.Provider
            value={{ key: registered ? 'real' : 'placeholder', name: 'bill' }}
          >
            {destinations.map(([name, destination]) => (
              <View key={name}>{destination()}</View>
            ))}
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    act(() => {
      for (const node of renderer.root.findAllByType(View))
        node.props.onTouchEnd?.();
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(mockSetOptions).not.toHaveBeenCalled(); // No Stack.Screen effect.
    if (!registered) expect(setOptions).not.toHaveBeenCalled();
    else expect(setOptions).toHaveBeenCalled(); // Exact-error fallback.
    act(() => renderer.unmount());
  },
);

test('ordinary option errors propagate, and an unfocused real route keeps its options', () => {
  jest.mocked(useIsPreview).mockReturnValue(false);
  const setOptions = jest.fn();
  let safe!: ReturnType<typeof useSafeSetOptions>;
  function Harness() {
    const setter = useSafeSetOptions();
    useEffect(() => {
      safe = setter;
    }, [setter]);
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <NavigationContext.Provider
        value={{ setOptions, isFocused: () => false } as never}
      >
        <Harness />
      </NavigationContext.Provider>,
    );
  });
  safe({ title: 'Real screen' });
  expect(setOptions).toHaveBeenCalledWith({ title: 'Real screen' });
  const failure = new Error('Invalid header options');
  setOptions.mockImplementation(() => {
    throw failure;
  });
  expect(() => safe({ title: 'Real screen' })).toThrow(failure);
  act(() => renderer.unmount());
});

test('dynamic options are installed before passive effects on first mount', () => {
  jest.mocked(useIsPreview).mockReturnValue(false);
  const setOptions = jest.fn();
  function FirstPaint() {
    useEffect(() => {
      expect(setOptions).toHaveBeenCalledWith({ title: 'Today' });
    }, []);
    return <RouteOptions options={{ title: 'Today' }} />;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <NavigationContext.Provider value={{ setOptions } as never}>
        <FirstPaint />
      </NavigationContext.Provider>,
    );
  });
  act(() => renderer.unmount());
});

describe.each([true, false])('preview = %s', (preview) => {
  test.each(destinations)(
    '%s only updates real navigation',
    async (_name, destination) => {
      jest.mocked(useIsPreview).mockReturnValue(preview);
      let renderer!: TestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = TestRenderer.create(
          <NavigationContext.Provider
            value={
              {
                setOptions: mockSetOptions,
                isFocused: () => true,
                addListener: () => () => {},
                getState: () => ({ routes: [], index: 0 }),
              } as never
            }
          >
            {destination()}
          </NavigationContext.Provider>,
        );
      });
      act(() => {
        for (const node of renderer.root.findAllByType(View))
          node.props.onTouchEnd?.();
      });
      act(() => renderer.unmount());
      if (preview) expect(mockSetOptions).not.toHaveBeenCalled();
      else expect(mockSetOptions).toHaveBeenCalled();
    },
  );
});

test('destination navigation options always go through the preview guard', () => {
  function files(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory()
        ? files(path)
        : /\.tsx?$/.test(path)
          ? [path]
          : [];
    });
  }
  for (const path of files(join(__dirname, '../src'))) {
    if (path.endsWith('/navigation/preview.tsx')) continue;
    const text = readFileSync(path, 'utf8');
    expect({
      path,
      calls: text.match(/\.setOptions\??\s*(?:\?\.)?\s*\(/g) ?? [],
    }).toEqual({ path, calls: [] });
    if (path.includes('/navigation/stack/')) continue;
    // Named Screen children register routes in a layout; unnamed ones set options.
    expect({
      path,
      calls: text.match(/<Stack\.Screen\b(?![^>]*\bname=)/g) ?? [],
    }).toEqual({ path, calls: [] });
  }
});
