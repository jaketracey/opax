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
import { colors } from '../src/design/tokens';
import { fixedPageBar, opaqueBar } from '../src/navigation/chrome';
import { sharedScreens } from '../src/navigation/stack';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

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
  // Files the walk's own tests write: read before the disk, never on it.
  const written = new Map<string, string>();
  const source = (path: string) =>
    written.get(path) ?? readFileSync(path, 'utf8');
  const feature = (name: string) =>
    source(resolve(__dirname, '../src/features', `${name}.tsx`));
  /**
   * Every tab-stack route whose page is not a Screen or a MoneyList:
   * - `fade`: its own list under the clear bar, with the fade from
   *   ClearBarRest or its own ClearBarFade (named file and mark);
   * - `ground`: a list whose section headers pin, laid out below its bar,
   *   which is the page's ground with no hairline;
   * - `below`: a sheet or modal, or Ask pushed outside its tab, laid out
   *   below an opaque bar.
   * No pushed page is solid with a hairline.
   */
  const REST = /<ClearBarRest\b[^>]*\bground="paper"/;
  const pages: readonly (readonly [
    string,
    'fade' | 'ground' | 'below',
    string,
    RegExp?,
  ])[] = [
    ['person/[slug]/speeches', 'fade', 'people/RecordList', REST],
    ['record-list', 'fade', 'people/RecordList', REST],
    ['bill-text/[key]', 'fade', 'records/ReaderList', REST],
    ['doc/[slug]', 'fade', 'records/ReaderList', REST],
    // A search field in the bar: clear all the same, the field on the
    // fade's ground (the hub's ruling, build 83).
    ['person/[slug]/votes', 'fade', 'people/PersonLists', REST],
    ['division-history', 'fade', 'directories/DivisionHistory', REST],
    ['vic-election/index', 'fade', 'vic-election/shared', REST],
    [
      'bill-list',
      'fade',
      'bills/BillsList',
      /\(!pushed \|\| clearPushed\)[\s\S]*<ClearBarFade\b[^>]*\bground="paper"/,
    ],
    ['person/[slug]/interests', 'ground', 'people/PersonLists'],
    ['party-sources', 'ground', 'people/PartySources'],
    ['declarations', 'ground', 'declarations/Declarations'],
    ['directory', 'ground', 'directories/DirectoryScreen'],
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

  // (Three parameters: a fourth would be taken for Jest's `done`.)
  test.each(pages)('%s: %s', (route, kind, file, ...rest) => {
    const mark = rest[0] as RegExp | undefined;
    // The filter pages are a stack of their own inside the `filters` sheet.
    const name = route.startsWith('filters/') ? 'filters' : route;
    expect(registered().has(name)).toBe(true);
    const options = optionsOf(name);
    if (kind === 'fade') {
      // Under the stack's clear bar, with a fade on the list's own ground:
      // no default is relied on.
      expect('headerTransparent' in options).toBe(false);
      expect('headerStyle' in options).toBe(false);
      expect(feature(file)).toMatch(mark!);
      expect(feature(file)).toMatch(/backgroundColor: colors\.paper/);
    } else if (kind === 'ground') {
      // Laid out below the bar so its section headers pin at the bar's
      // foot; the bar is the page's ground and has no hairline.
      expect(options.headerTransparent).toBe(false);
      expect(options.headerStyle).toEqual({ backgroundColor: colors.paper });
      expect(options.headerShadowVisible).toBe(false);
      expect(feature(file)).toMatch(
        /stickySectionHeadersEnabled(?!=\{false\})/,
      );
    } else if (name === 'explore/photo') {
      // The photo viewer: a full-screen modal with a clear bar of its own
      // over a dark scrim, not a pushed page.
      expect(options.presentation).toBe('fullScreenModal');
    } else expect(options.headerTransparent).toBe(false);
  });

  // Pages with a search field whose page is a Screen or a MoneyList: under
  // the clear bar too, where the page's own fade covers the field's band.
  test.each(['grants', 'grant-program', 'agencies', 'learn/glossary'])(
    '%s: a search field, under the clear bar',
    (name) => {
      const options = optionsOf(name);
      expect('headerTransparent' in options).toBe(false);
      expect('headerStyle' in options).toBe(false);
    },
  );

  // The hub's ruling: off the rail no pushed page keeps the hairline. One
  // laid out below its bar is a list with pinned headers, in the table.
  test('no pushed page is solid, and none has a hairline', () => {
    const ground = new Set(
      pages.filter(([, kind]) => kind === 'ground').map(([name]) => name),
    );
    const below: string[] = [];
    const lined: string[] = [];
    for (const name of registered().keys()) {
      const options = optionsOf(name);
      if (options.presentation && options.presentation !== 'card') continue;
      if (options.headerTransparent === false && !ground.has(name))
        below.push(name);
      if (options.headerShadowVisible === true) lined.push(name);
    }
    // Ask outside its tab is laid out below its bar (the table's `below`).
    // The electorate page asks for the clear bar itself, from whether the
    // system has one as the module loads (not here, under Jest).
    expect(
      below.filter((name) => name !== 'ask' && name !== 'electorate/[id]'),
    ).toEqual([]);
    expect(lined).toEqual([]);
  });

  // The money page's map mode does not scroll: it sets its own bar, laid
  // out below it, and the route walk reads its list mode's Screen. Its bar
  // is checked here: no hairline where pushed pages are clear, the opaque
  // bar and its hairline everywhere else (a legibility setting included).
  describe('a pushed page that sets its own bar (the money map)', () => {
    test('off the rail it is the page’s ground with no hairline; with a legibility setting on, or before iOS 26, it keeps the opaque bar and its hairline', () => {
      expect(fixedPageBar(true, false)).toEqual({
        headerStyle: { backgroundColor: colors.paper },
        headerLargeStyle: { backgroundColor: colors.paper },
        headerShadowVisible: false,
        headerTransparent: false,
      });
      const opaque = fixedPageBar(false, false);
      expect(opaque).toEqual({
        ...opaqueBar(colors.paper),
        headerTransparent: false,
      });
      expect(opaque.headerShadowVisible).toBe(true);
      // Beside the rail it is backed in its ground, as before.
      const railed = fixedPageBar(false, true) as {
        headerBackground?: unknown;
      };
      expect(typeof railed.headerBackground).toBe('function');
      expect('headerBackground' in fixedPageBar(true, false)).toBe(false);
    });

    test('the map takes that bar, from whether its route is a clear pushed page', () => {
      const text = feature('money/MoneyScreen');
      expect(text).toMatch(
        /const plainClear = usePushedPlainClear\(\);[\s\S]{0,200}fixedPageBar\(plainClear, rail, colors\.paper\)/,
      );
    });

    // Any page that sets an opaque bar for itself would keep the hairline
    // the same way. The one other use is a bar colour handed to
    // RouteOptions, which clears it under a clear bar (sources/parts.tsx).
    test('no feature sets an opaque bar of its own', () => {
      const found: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const path = join(dir, entry);
          if (statSync(path).isDirectory()) walk(path);
          else if (/\.tsx?$/.test(entry) && /\bopaqueBar\(/.test(source(path)))
            found.push(relative(resolve(__dirname, '../src/features'), path));
        }
      };
      walk(resolve(__dirname, '../src/features'));
      expect(found).toEqual(['sources/parts.tsx']);
    });
  });

  // With Reduce Transparency or Increase Contrast on, the stack is told its
  // pages are below an opaque bar: no route asks for anything else, so every
  // pushed page has the stack's opaque bar and its hairline, as the tab
  // roots have under those settings (opaqueBar).
  test('with a legibility setting on, no route changes the stack’s opaque bar or its hairline', () => {
    const solid = new Map(
      (
        sharedScreens('(today)', false, false) as React.ReactElement<{
          name: string;
          options:
            | Record<string, unknown>
            | ((props: object) => Record<string, unknown>);
        }>[]
      ).map((entry) => [entry.props.name, entry.props.options]),
    );
    for (const name of [
      'person/[slug]/interests',
      'party-sources',
      'declarations',
      'directory',
      'person/[slug]/votes',
      'division-history',
      'vic-election/index',
      'bill-list',
      'grants',
    ]) {
      const options = solid.get(name);
      const resolved =
        typeof options === 'function'
          ? options({
              route: { key: name, name, params: {} },
              navigation: { getState: () => ({ index: 1, routes: [] }) },
            })
          : (options ?? {});
      expect('headerShadowVisible' in resolved).toBe(false);
      expect('headerStyle' in resolved).toBe(false);
    }
    expect(opaqueBar().headerShadowVisible).toBe(true);
  });

  // What a route's page draws, read from the source: the component the
  // route file exports, then every component it renders, through local
  // declarations and relative imports. The page is covered when that walk
  // reaches a Screen or a MoneyList (each draws the fade), and is a redirect
  // when a Redirect is all it renders. A file that merely contains "<Screen"
  // somewhere, in a component the page never renders, does not count.
  const COVERS = /^(Screen|KeyboardStableScreen|MoneyList)$/;
  const moduleFile = (from: string, spec: string) => {
    const base = resolve(dirname(from), spec);
    return (
      [base + '.tsx', base + '.ts', join(base, 'index.tsx')].find(
        (path) => written.has(path) || existsSync(path),
      ) ?? null
    );
  };
  /** The top-level declarations of a file, by name, each with its text. */
  const declarations = (text: string) => {
    const starts = [
      ...text.matchAll(
        /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+|const\s+|class\s+)([A-Za-z_$][\w$]*)/gm,
      ),
    ];
    return new Map(
      starts.map((match, index) => [
        match[1]!,
        text.slice(match.index, starts[index + 1]?.index ?? text.length),
      ]),
    );
  };
  /** Local name -> [module, exported name] for a file's relative imports. */
  const imports = (text: string) => {
    const found = new Map<string, [string, string]>();
    for (const match of text.matchAll(
      /^import\s+(?:type\s+)?([^;]+?)\s+from\s+'(\.[^']*)'/gm,
    )) {
      const [, clause, spec] = match as unknown as [string, string, string];
      const named = /\{([^}]*)\}/.exec(clause)?.[1] ?? '';
      const first = clause
        .replace(/\{[^}]*\}/, '')
        .replace(/,/g, '')
        .trim();
      if (first && !first.startsWith('*')) found.set(first, [spec, 'default']);
      for (const part of named.split(',')) {
        const [name, alias] = part
          .replace(/^\s*type\s+/, '')
          .trim()
          .split(/\s+as\s+/);
        if (name) found.set(alias ?? name, [spec, name]);
      }
    }
    return found;
  };
  /** The declaration a file exports under a name, as [file, local name]. */
  const exported = (path: string, name: string): [string, string] | null => {
    const text = source(path);
    const again = (
      name === 'default'
        ? /^export\s+\{\s*(?:default|([\w$]+)\s+as\s+default)\s*\}\s+from\s+'(\.[^']*)'/m
        : new RegExp(
            String.raw`^export\s+\{[^}]*\b(?:([\w$]+)\s+as\s+)?${name}\b[^}]*\}\s+from\s+'(\.[^']*)'`,
            'm',
          )
    ).exec(text);
    if (again) {
      const file = moduleFile(path, again[2]!);
      return file ? exported(file, again[1] ?? name) : null;
    }
    if (name !== 'default') return [path, name];
    const own =
      /^export\s+default\s+(?:async\s+)?function\s+([\w$]+)/m.exec(text) ??
      /^export\s+default\s+(?:memo\(|forwardRef\()?([\w$]+)/m.exec(text);
    return own ? [path, own[1]!] : null;
  };
  /** Every component a page renders, as tag names, from its export down. */
  const rendered = (route: string) => {
    const tags = new Set<string>();
    const seen = new Set<string>();
    const visit = (path: string, name: string) => {
      const key = path + '#' + name;
      if (seen.has(key)) return;
      seen.add(key);
      const text = source(path);
      const body = declarations(text).get(name);
      if (!body) return;
      const local = declarations(text);
      const from = imports(text);
      for (const [, tag] of body.matchAll(/(?<![\w$])<([A-Z][\w$]*)/g)) {
        tags.add(tag!);
        if (COVERS.test(tag!)) continue;
        if (local.has(tag!)) visit(path, tag!);
        else if (from.has(tag!)) {
          const [spec, as] = from.get(tag!)!;
          const file = moduleFile(path, spec);
          const target = file && exported(file, as);
          if (target) visit(...target);
        }
      }
    };
    const start = exported(route, 'default');
    if (start) visit(...start);
    return tags;
  };

  const routeFiles = () => {
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
    return files;
  };
  /** The routes whose page draws no Screen or MoneyList and are not listed. */
  const unlistedIn = (files: string[]) => {
    const listed = new Set(pages.map(([name]) => name));
    return files
      .filter((path) => {
        // Every route file is read, the file itself included: one that
        // renders its own list with no feature page is not skipped. Only a
        // route that does nothing but redirect has no page; one that can
        // redirect and can also draw a page is checked as a page.
        const tags = rendered(path);
        if (tags.size === 1 && tags.has('Redirect')) return false;
        return ![...tags].some((tag) => COVERS.test(tag));
      })
      .map((path) => relative(tabRoutes, path).replace(/\.tsx$/, ''))
      .filter((name) => !listed.has(name));
  };

  // A new route cannot slip through: one whose page renders neither a
  // Screen nor a MoneyList must be in the table above.
  test('every tab-stack route with its own scroll view is in the table', () => {
    expect(routeFiles().length).toBeGreaterThan(50);
    expect(unlistedIn(routeFiles())).toEqual([]);
  });

  // The walk itself, on routes written here: a route file with a list of
  // its own and no feature page was skipped, and a page file that held a
  // Screen in some other component counted as covered.
  describe('the route walk', () => {
    const scratch = join(tabRoutes, '__pushed-clear-bar-probe__');
    const feature = resolve(
      __dirname,
      '../src/features/__pushed-clear-bar-probe__.tsx',
    );
    const probe = (name: string, text: string) => {
      const path = join(scratch, name + '.tsx');
      written.set(path, text);
      return path;
    };
    afterEach(() => written.clear());

    test('a route that renders its own list in the route file is found', () => {
      const path = probe(
        'own-list',
        [
          "import { FlatList } from 'react-native';",
          'export default function Probe() {',
          '  return <FlatList data={[]} renderItem={() => null} />;',
          '}',
        ].join('\n'),
      );
      expect(unlistedIn([path])).toEqual([
        '__pushed-clear-bar-probe__/own-list',
      ]);
      expect(unlistedIn([...routeFiles(), path])).toEqual([
        '__pushed-clear-bar-probe__/own-list',
      ]);
    });

    test('a page that renders its own list is found, though its file holds a Screen elsewhere', () => {
      written.set(
        feature,
        [
          "import { FlatList } from 'react-native';",
          "import { Screen } from '../design/layout';",
          'export function Unused() {',
          '  return <Screen />;',
          '}',
          'function Rows() {',
          '  return <FlatList data={[]} renderItem={() => null} />;',
          '}',
          'export default function Page() {',
          '  return <Rows />;',
          '}',
        ].join('\n'),
      );
      const path = probe(
        'own-page',
        "export { default } from '../../../../features/__pushed-clear-bar-probe__';",
      );
      expect(unlistedIn([path])).toEqual([
        '__pushed-clear-bar-probe__/own-page',
      ]);
    });

    test('a page whose own component renders a Screen is covered, and a route that only redirects has no page', () => {
      written.set(
        feature,
        [
          "import { Screen } from '../design/layout';",
          'function Body() {',
          '  return <Screen />;',
          '}',
          'export function Page() {',
          '  return <Body />;',
          '}',
        ].join('\n'),
      );
      const page = probe(
        'covered',
        [
          "import { Page } from '../../../../features/__pushed-clear-bar-probe__';",
          'export default function Probe() {',
          '  return <Page />;',
          '}',
        ].join('\n'),
      );
      const redirect = probe(
        'redirect',
        [
          "import { Redirect } from 'expo-router';",
          'export default function Probe() {',
          '  return <Redirect href="/" />;',
          '}',
        ].join('\n'),
      );
      expect(unlistedIn([page, redirect])).toEqual([]);
    });
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
