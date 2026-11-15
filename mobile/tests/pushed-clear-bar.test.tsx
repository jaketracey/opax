import { act } from 'react';
import { FlatList, Platform, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { DescriptorsContext } from 'expo-router/build/fork/native-stack/descriptors-context';
import * as accessibility from '../src/design/accessibility';
import { ClearBarRest, Screen } from '../src/design/layout';
import { sharedScreens } from '../src/navigation/stack';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

jest.mock('../modules/opax-root-bar', () => ({
  RootBar: null,
  useVerticalBarEdge: () => 'unspecified',
}));

// Build 82: a pushed page had the stack's solid paper bar, and its rows were
// cut sharp at the bar's hairline. On iOS 26 it has Today's treatment: a
// clear bar with no colour and no hairline, and the page fades into its own
// ground under it. A legibility setting keeps the solid bar.
const root = { key: 'today-root', name: 'index' };
const pushed = { key: 'person-1', name: 'person/[slug]' };
const version = Object.getOwnPropertyDescriptor(Platform, 'Version')!;

function page({
  route = pushed,
  headerTransparent = true,
  presentation,
}: {
  route?: typeof pushed;
  headerTransparent?: boolean;
  presentation?: string;
} = {}) {
  const navigation = {
    setOptions: jest.fn(),
    getState: () => ({
      index: 1,
      routes: [root, pushed],
      routeNames: ['index', 'bill/[key]', 'explore/[tool]'],
    }),
    isFocused: () => true,
    addListener: () => () => {},
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route as never}>
          <DescriptorsContext.Provider
            value={
              {
                [route.key]: { options: { headerTransparent, presentation } },
              } as never
            }
          >
            <HeaderHeightContext.Provider value={114}>
              <Screen testID="page" ground="sunken">
                <View />
              </Screen>
            </HeaderHeightContext.Provider>
          </DescriptorsContext.Provider>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  const fades = () =>
    renderer.root.findAll(
      (n) => n.props.testID === 'bar-fade' && typeof n.type === 'string',
    ).length;
  const bar = () =>
    Object.assign(
      {},
      ...navigation.setOptions.mock.calls.map(([options]) => options),
    ) as {
      headerStyle?: object;
      headerShadowVisible?: boolean;
    };
  return { renderer, fades, bar };
}

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 26 });
});
afterEach(() => {
  Object.defineProperty(Platform, 'Version', version);
  jest.restoreAllMocks();
});

test('a pushed Screen page under the clear bar draws the fade, with no bar colour and no hairline', () => {
  const { renderer, fades, bar } = page();
  expect(fades()).toBe(1);
  expect(bar().headerStyle).toEqual({});
  expect(bar().headerShadowVisible).toBe(false);
  act(() => renderer.unmount());
});

test('with Reduce Transparency or Increase Contrast on it draws no fade and keeps the solid bar and its hairline', () => {
  jest.spyOn(accessibility, 'useSolidBar').mockReturnValue(true);
  // The stack gives the opaque bar then; a route that asks for a clear one
  // itself (the electorate page) still has no fade.
  for (const headerTransparent of [false, true]) {
    const { renderer, fades, bar } = page({ headerTransparent });
    expect(fades()).toBe(0);
    expect(bar().headerStyle).toHaveProperty('backgroundColor');
    expect(bar().headerShadowVisible).toBe(true);
    act(() => renderer.unmount());
  }
});

test.each([
  [
    'below a solid bar of its own (a search field)',
    { headerTransparent: false },
  ],
  ['presented as a sheet', { presentation: 'formSheet' }],
  ['before iOS 26', { old: true }],
] as const)('a page %s has no fade and keeps its bar', (_case, options) => {
  if ('old' in options)
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 18,
    });
  const { renderer, fades, bar } = page(options as never);
  expect(fades()).toBe(0);
  expect(bar().headerShadowVisible).toBe(true);
  act(() => renderer.unmount());
});

// The hub's rule: the clear bar ships only together with a visible fade. A
// page that scrolls its own list (no Screen, no MoneyList) either wraps the
// list in ClearBarRest, which draws the fade, or keeps a solid bar.
describe('no pushed page has a clear bar without a fade', () => {
  const tabRoutes = resolve(
    __dirname,
    '../src/app/(tabs)/(today,your-mp,bills,search,ask)',
  );
  const source = (path: string) => readFileSync(path, 'utf8');
  const feature = (name: string) =>
    source(resolve(__dirname, '../src/features', `${name}.tsx`));
  /**
   * Every tab-stack route whose page is not a Screen or a MoneyList:
   * - `fade`: its own list, wrapped in ClearBarRest (named file);
   * - `solid`: keeps the stack's solid bar (sticky section headers or a
   *   search field in the bar);
   * - `below`: a sheet or modal, or Ask pushed outside its tab, laid out
   *   below an opaque bar.
   */
  const pages: readonly (readonly [
    string,
    'fade' | 'solid' | 'below',
    string,
  ])[] = [
    ['person/[slug]/speeches', 'fade', 'people/RecordList'],
    ['record-list', 'fade', 'people/RecordList'],
    ['bill-text/[key]', 'fade', 'records/ReaderList'],
    ['doc/[slug]', 'fade', 'records/ReaderList'],
    ['person/[slug]/interests', 'solid', ''],
    ['party-sources', 'solid', ''],
    ['vic-election/index', 'solid', ''],
    ['bill-list', 'solid', ''],
    ['person/[slug]/votes', 'solid', ''],
    ['division-history', 'solid', ''],
    ['declarations', 'solid', ''],
    ['directory', 'solid', ''],
    ['ask', 'below', ''],
    ['ask-report', 'below', ''],
    ['consent', 'below', ''],
    ['bill-text-contents/[key]', 'below', ''],
    ['electorate-date', 'below', ''],
    ['explore/photo', 'below', ''],
    ['filters/[list]', 'below', ''],
    ['filters/[list]/[facet]', 'below', ''],
  ];
  const registered = () =>
    new Map(
      (
        sharedScreens('(today)', false, 'plain') as React.ReactElement<{
          name: string;
          options:
            | Record<string, unknown>
            | ((props: object) => Record<string, unknown>);
        }>[]
      ).map((entry) => [entry.props.name, entry.props.options]),
    );
  const optionsOf = (name: string) => {
    const options = registered().get(name);
    return typeof options === 'function'
      ? options({
          route: { key: name, name, params: {} },
          navigation: {
            getState: () => ({
              index: 1,
              routes: [
                { key: 'root', name: 'index' },
                { key: name, name },
              ],
            }),
          },
        })
      : (options ?? {});
  };

  test.each(pages)('%s: %s', (route, kind, file) => {
    // The filter pages are a stack of their own inside the `filters` sheet.
    const name = route.startsWith('filters/') ? 'filters' : route;
    expect(registered().has(name)).toBe(true);
    const options = optionsOf(name);
    if (kind === 'fade') {
      // Under the stack's clear bar, with the fade from ClearBarRest.
      expect('headerTransparent' in options).toBe(false);
      expect(feature(file)).toMatch(/<ClearBarRest\b/);
    } else if (kind === 'solid') {
      expect(options.headerTransparent).toBe(false);
      expect(options.headerStyle).toHaveProperty('backgroundColor');
    } else if (name === 'explore/photo') {
      // The photo viewer: a full-screen modal with a clear bar of its own
      // over a dark scrim, not a pushed page.
      expect(options.presentation).toBe('fullScreenModal');
    } else expect(options.headerTransparent).toBe(false);
  });

  // A new route cannot slip through: one whose page file renders neither a
  // Screen nor a MoneyList must be in the table above.
  test('every tab-stack route with its own scroll view is in the table', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (entry.endsWith('.tsx') && entry !== '_layout.tsx')
          files.push(path);
      }
    };
    walk(tabRoutes);
    const listed = new Set(pages.map(([name]) => name));
    const unlisted: string[] = [];
    for (const path of files) {
      const imports = [
        ...source(path).matchAll(/from '(?:\.\.\/)+features\/([^']+)'/g),
      ].map((match) => match[1]!);
      // A redirect, or a route with no feature page of its own.
      if (!imports.length) continue;
      const page = imports.map((name) => {
        try {
          return feature(name);
        } catch {
          return '';
        }
      });
      const covered = page.some((text) =>
        /<(Screen|KeyboardStableScreen|MoneyList)\b/.test(text),
      );
      const name = relative(tabRoutes, path).replace(/\.tsx$/, '');
      if (!covered && !listed.has(name)) unlisted.push(name);
    }
    expect(unlisted).toEqual([]);
  });

  function list(onScroll?: jest.Mock) {
    const navigation = {
      setOptions: jest.fn(),
      getState: () => ({
        index: 1,
        routes: [root, pushed],
        routeNames: ['index', 'bill/[key]', 'explore/[tool]'],
      }),
      isFocused: () => true,
      addListener: () => () => {},
    };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={pushed as never}>
            <DescriptorsContext.Provider
              value={
                {
                  [pushed.key]: { options: { headerTransparent: true } },
                } as never
              }
            >
              <HeaderHeightContext.Provider value={114}>
                <ClearBarRest>
                  <FlatList
                    data={[]}
                    renderItem={() => null}
                    onScroll={onScroll}
                  />
                </ClearBarRest>
              </HeaderHeightContext.Provider>
            </DescriptorsContext.Provider>
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    const fades = () =>
      renderer.root.findAll(
        (n) => n.props.testID === 'bar-fade' && typeof n.type === 'string',
      ).length;
    return { renderer, fades };
  }

  test('a page’s own list in ClearBarRest draws the fade, and still hears its scroll', () => {
    jest.useFakeTimers();
    const onScroll = jest.fn();
    const { renderer, fades } = list(onScroll);
    expect(fades()).toBe(1);
    const event = { nativeEvent: { contentOffset: { y: -114 } } };
    act(() => renderer.root.findByType(FlatList).props.onScroll(event));
    expect(onScroll).toHaveBeenCalledWith(event);
    act(() => renderer.unmount());
    jest.useRealTimers();
  });

  test('with a legibility setting on it draws none', () => {
    jest.useFakeTimers();
    jest.spyOn(accessibility, 'useSolidBar').mockReturnValue(true);
    const { renderer, fades } = list();
    expect(fades()).toBe(0);
    act(() => renderer.unmount());
    jest.useRealTimers();
  });
});
