import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import * as ts from 'typescript';
import { forbiddenOpaxRoute } from '../src/navigation/external';

// Checks the app's guard against where the web app really takes an address.
// tests/web-oracle.mjs works that out by running the web app's own source
// (the Worker's entry redirects and machine routes, home.js, app.js startup
// and route(), community.js) and never reads the guard. Every address the web
// app takes to a forbidden place must be one the guard refuses.
type Outcome = {
  address: string;
  end:
    | 'endpoint'
    | 'panel'
    | 'home'
    | 'community'
    | 'off-site'
    | 'stopped'
    | 'error';
  endpoint?: string;
  panel?: string;
  question?: string | null;
  token?: string | null;
  error?: string;
  at: string;
  trail: string[];
};
type Guard = (url: URL) => string | null;

const mobile = resolve(__dirname, '..');
const portal = resolve(mobile, '../portal/public');
const origin = 'https://opax.com.au';

// The oracle runs in its own Node process so it models the browser with
// Node's WHATWG URL and Fetch classes; the Jest environment swaps in its own
// URL, the one the guard runs on here. It takes under a second for the whole
// sweep and holds nothing open (stdin is the input and then closes; tsx's
// parent socket is unref'd), so the two-minute limit only bounds a machine
// stalled far past gate load. A timeout fails naming the command
// (tests/child-timeout.js).
const oracleTimeout = 120_000;

function web(
  addresses: string[],
  sources: { app?: string; home?: string } = {},
): Outcome[] {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ['--import', 'tsx', resolve(__dirname, 'web-oracle.mjs')],
      {
        cwd: mobile,
        input: JSON.stringify({ addresses, ...sources }),
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: 'pipe',
        timeout: oracleTimeout,
        killSignal: 'SIGKILL',
      },
    ),
  ) as Outcome[];
}

/** The forbidden place an outcome reaches, or null. */
function forbiddenPlace(outcome: Outcome): string | null {
  if (outcome.end === 'endpoint') return outcome.endpoint!;
  if (
    outcome.end === 'panel' &&
    ['ask', 'chat', 'search'].includes(outcome.panel!)
  )
    return `the ${outcome.panel} panel`;
  if (outcome.end === 'community' && outcome.token)
    return 'a Community sign-in';
  return null;
}

/** Addresses the guard opens although the web app takes them somewhere forbidden. */
function slips(outcomes: Outcome[], guard: Guard = forbiddenOpaxRoute) {
  return outcomes
    .filter((o) => forbiddenPlace(o) && !guard(new URL(o.address)))
    .map((o) => `${o.address} -> ${forbiddenPlace(o)} (${o.at})`);
}

/** The guard compiled from edited source, for mutation tests. */
function guardFrom(source: string): Guard {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} as { forbiddenOpaxRoute: Guard } };
  const stubs: Record<string, unknown> = {
    './paths': { fromWebPath: () => null },
    '../routes/search': { searchRouteFromWebPath: () => null },
    '../../features/community/entry': jest.requireActual(
      '../src/features/community/entry',
    ),
    'react-native': {},
    'expo-router': { router: {} },
    'expo-web-browser': {},
    '../../design/environment': { webOrigin: origin, isE2E: true },
    '../../design/palette': { light: {}, dark: {} },
    '../source-destination': {},
    '../../analytics': { currentSection: () => 'other', track: () => {} },
  };
  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    URL,
    require: (name: string) => {
      if (!(name in stubs)) throw new Error(`unexpected import ${name}`);
      return stubs[name];
    },
  });
  return module.exports.forbiddenOpaxRoute;
}

/** Replace text that must be present, so a mutation never silently does nothing. */
function edit(source: string, from: string, to: string): string {
  if (!source.includes(from)) throw new Error(`"${from}" is gone`);
  return source.replace(from, to);
}

const pages = ['/', '/money', '/subject/person/anthony-albanese'];
const leads = [
  '/',
  '//',
  '///',
  '/%2F',
  '%2F',
  '\\',
  '/\\',
  '/./',
  '/x/../',
  '/money/../',
  '/%2e%2e/',
  '//opax.com.au/',
  '//example.org/',
  '/;x/',
];
const names = [
  'ask',
  'ASK',
  '%61sk',
  'ＡＳＫ',
  'aſk',
  'ask;mode=x',
  'chat',
  'search',
  'api/search',
  'og/x.png',
  'mcp',
  'today',
  'doc',
  'subject',
  'subject/unknown',
  'unknown',
  'money',
  'money/grants',
  'subject/person/anthony-albanese',
  'bills',
  '',
];
const tails = [
  '',
  '/',
  '?q=housing',
  '/ignored?q=housing',
  '?view=search',
  '?ask=housing',
  '?x=1?ask=housing',
  '&ask=housing',
  '#section-2',
  '#/ask',
];
const sweep = [
  ...pages.flatMap((page) =>
    leads.flatMap((lead) =>
      names.flatMap((name) =>
        tails.map((tail) => `${origin}${page}#${lead}${name}${tail}`),
      ),
    ),
  ),
  // Addresses with no fragment route, for the root and "ask" rules.
  ...[
    '/?q=housing',
    '/?ask=housing',
    '/?q=housing#section-2',
    '/search',
    '/money?ask=housing',
    '/community?view=signin#token=synthetic',
    '/community#x=1&token=synthetic',
  ].map((path) => `${origin}${path}`),
];

// Where the web app takes these, checked one by one.
const reachesForbidden: [string, Partial<Outcome>][] = [
  // The startup fold parses "//ask/ignored" as a host: "/ignored" is a view
  // route() does not know, so it shows the Ask panel.
  ['/money#//ask/ignored?q=housing', { panel: 'ask' }],
  ['/#//opax.com.au/ask', { panel: 'ask' }],
  ['/#//opax.com.au/api/search', { end: 'endpoint', endpoint: '/api/search' }],
  ['/#//opax.com.au/og/x.png', { end: 'endpoint', endpoint: '/og/x.png' }],
  ['/#//opax.com.au/mcp', { end: 'endpoint', endpoint: '/mcp' }],
  ['/money#//example.org/chat', { panel: 'chat' }],
  ['/money#//example.org/search', { panel: 'search' }],
  ['/money#/ask;mode=x', { panel: 'ask' }],
  ['/money#/ＡＳＫ', { panel: 'ask' }],
  ['/money#/aſk', { panel: 'ask' }],
  ['/money#/doc', { panel: 'ask' }],
  ['/money#/subject/unknown', { panel: 'ask' }],
  ['/#/?q=housing', { panel: 'ask', question: 'housing' }],
  ['/#/x/../ask?q=y', { panel: 'ask', question: 'y' }],
  ['/?q=housing', { panel: 'ask', question: 'housing' }],
  ['/money?ask=housing', { panel: 'ask', question: 'housing' }],
  [
    '/community?view=signin#token=synthetic',
    { end: 'community', token: 'synthetic' },
  ],
];
const reachesContent: [string, Partial<Outcome>][] = [
  ['/', { end: 'home' }],
  ['/money', { panel: 'money' }],
  ['/money#/money/grants', { panel: 'money-records' }],
  ['/#/subject/person/Anthony%20Albanese', { panel: 'subject' }],
  ['/#/subject/party', { panel: 'subject' }],
  ['/#/doc/x', { panel: 'doc' }],
  ['/subject/person/anthony-albanese#person-pay', { panel: 'subject' }],
  ['/community?view=thread&id=x#reply-ab12', { end: 'community', token: null }],
];

describe('where the web app takes an address', () => {
  const examples = [...reachesForbidden, ...reachesContent].map(
    ([path]) => `${origin}${path}`,
  );
  const outcomes = web([...sweep, ...examples]);
  const at = (path: string) =>
    outcomes.find((o) => o.address === `${origin}${path}`)!;

  test.each(reachesForbidden)(
    '%s reaches %j, and the guard refuses it',
    (path, expected) => {
      const outcome = at(path);
      expect(outcome).toMatchObject(expected);
      expect(forbiddenPlace(outcome)).not.toBeNull();
      expect(forbiddenOpaxRoute(new URL(`${origin}${path}`))).not.toBeNull();
    },
  );

  test.each(reachesContent)(
    '%s reaches %j, and the guard opens it',
    (path, expected) => {
      const outcome = at(path);
      expect(outcome).toMatchObject(expected);
      expect(forbiddenPlace(outcome)).toBeNull();
      expect(forbiddenOpaxRoute(new URL(`${origin}${path}`))).toBeNull();
    },
  );

  test(`the guard refuses every one of ${sweep.length} sweep addresses that reach a forbidden place`, () => {
    expect(outcomes.filter((o) => o.end === 'error')).toEqual([]);
    const forbidden = outcomes.filter(forbiddenPlace);
    const opened = outcomes.filter(
      (o) => !forbiddenOpaxRoute(new URL(o.address)),
    );
    // Neither side is empty: the sweep reaches both kinds of place.
    expect(forbidden.length).toBeGreaterThan(1000);
    expect(opened.length).toBeGreaterThan(50);
    expect(slips(outcomes)).toEqual([]);
  });

  test('a guard without its "q" rules lets the sweep through', () => {
    const source = readFileSync(
      resolve(mobile, 'src/navigation/external/sheets.ts'),
      'utf8',
    );
    expect(slips(outcomes, guardFrom(source))).toEqual([]);
    const weak = guardFrom(
      edit(
        edit(source, "new Set(['q', 'ask'])", "new Set(['ask'])"),
        "if (root && keys.includes('q')) return 'an Ask query';",
        '',
      ),
    );
    expect(slips(outcomes, weak)).toContain(
      `${origin}/?q=housing -> the ask panel (${origin}/ask?q=housing)`,
    );
  });

  test('a web app without its money view sends the opened addresses to Ask', () => {
    const app = edit(
      readFileSync(resolve(portal, 'app.js'), 'utf8'),
      'else if (view === "money") {',
      'else if (view === "money-disabled") {',
    );
    const opened = sweep.filter((a) => !forbiddenOpaxRoute(new URL(a)));
    expect(slips(web(opened, { app }))).toEqual(
      expect.arrayContaining([
        `${origin}/money#/money -> the ask panel (${origin}/money)`,
      ]),
    );
  });

  test('a web app that loses a function it relies on fails loudly', () => {
    const app = edit(
      readFileSync(resolve(portal, 'app.js'), 'utf8'),
      'function parseHash(',
      'function readHash(',
    );
    expect(() => web([`${origin}/money`], { app })).toThrow(
      /app\.js: "function parseHash\(" is gone/,
    );
  });
});

describe('native incoming links', () => {
  const fromWebPath = jest.requireActual<
    typeof import('../src/navigation/external')
  >('../src/navigation/external').fromWebPath;
  const redirectSystemPath = jest.requireActual<
    typeof import('../src/app/+native-intent')
  >('../src/app/+native-intent').redirectSystemPath;
  test.each([
    [
      '/subject/person/anthony-albanese',
      '/person/[slug]',
      { slug: 'anthony-albanese' },
    ],
    [
      '/subject/electorate/el_5d600e7f6dca5b72ae04d686',
      '/electorate/[id]',
      { id: 'el_5d600e7f6dca5b72ae04d686' },
    ],
    [
      '/discover?category=grants&item=record',
      '/leads',
      { category: 'grants', item: 'record' },
    ],
    ['/money?node=party:Labor', '/money-record', { node: 'party:Labor' }],
    [
      '/explore?game=quiz&q=question',
      '/explore/[tool]',
      { tool: 'quiz', q: 'question' },
    ],
    [
      '/explore?game=tm&year=1975&photo=1',
      '/explore/[tool]',
      { tool: 'tm', year: '1975', photo: '1' },
    ],
  ])('%s maps to a native group route', (path, pathname, params) => {
    expect(fromWebPath(path as string)).toMatchObject({ pathname, params });
  });
  test('retired report paths never create a deleted native destination', () =>
    expect(fromWebPath('/reports/grants-allocation')).toBeNull());
  test.each(['/reports', '/reports/', '/report/gambling', '/report/gambling/'])(
    "the retired report screens' own link %s opens Explore",
    (path) => expect(fromWebPath(path)).toEqual({ pathname: '/explore' }),
  );
  test('a removed Explore tool returns to the hub and money stays in the tab stack', () => {
    expect(fromWebPath('/explore?game=ballot')).toEqual({
      pathname: '/explore',
    });
    expect(fromWebPath('/money')).toMatchObject({ pathname: '/money' });
  });
  test.each([
    '/source',
    '/citation',
    '/machine-note',
    '/rule',
    '/seat',
    '/welcome',
    '/filters/bills',
  ])('web paths never create internal sheets: %s', (path) =>
    expect(fromWebPath(path)).toBeNull(),
  );
  test.each([
    ['opax://seat', '/seat'],
    ['opax://follows', '/(tabs)/(today)/follows'],
    [
      'https://opax.com.au/subject/person/anthony-albanese',
      '/(tabs)/(today)/person/anthony-albanese',
    ],
    [
      'https://opax.com.au/subject/electorate/el_5d600e7f6dca5b72ae04d686',
      '/(tabs)/(today)/electorate/el_5d600e7f6dca5b72ae04d686',
    ],
    ['opax://person/member?name=Untrusted', '/(tabs)/(today)/person/member'],
    ['opax://money?name=Untrusted', '/(tabs)/(today)/money'],
  ])('%s arrives without a supplied back-button name', (path, target) => {
    expect(redirectSystemPath({ path, initial: false })).toBe(target);
  });
  test('cold money opens in Today and warm money keeps the selected tab', () => {
    const { setSelectedTab } = jest.requireActual<
      typeof import('../src/navigation/link-tab')
    >('../src/navigation/link-tab');
    setSelectedTab('(search)');
    try {
      expect(redirectSystemPath({ path: 'opax://money', initial: true })).toBe(
        '/(tabs)/(today)/money',
      );
      expect(redirectSystemPath({ path: 'opax://money', initial: false })).toBe(
        '/(tabs)/(search)/money',
      );
      expect(
        redirectSystemPath({
          path: 'https://opax.com.au/money?node=party:Labor',
          initial: false,
        }),
      ).toBe('/(tabs)/(search)/money-record?node=party%3ALabor');
    } finally {
      setSelectedTab('(today)');
    }
    expect(fromWebPath('/subject/person/member?name=Untrusted')).toEqual({
      pathname: '/person/[slug]',
      params: { slug: 'member' },
    });
  });
});

describe('incoming links open in the tab the shell spec gives them', () => {
  const redirectSystemPath = jest.requireActual<
    typeof import('../src/app/+native-intent')
  >('../src/app/+native-intent').redirectSystemPath;
  const { setSelectedTab, linkTab } = jest.requireActual<
    typeof import('../src/navigation/link-tab')
  >('../src/navigation/link-tab');
  // Warm links arrive while another tab is selected: Bills, the tab the
  // router used to pick for every shared-folder route.
  beforeEach(() => setSelectedTab('(bills)'));
  afterEach(() => setSelectedTab('(today)'));
  test.each([true, false])(
    'old report links open Explore in Today, never an unmatched route (cold %s)',
    (initial) => {
      for (const path of [
        'opax:///reports',
        'opax://reports',
        'opax://report/gambling',
      ])
        expect(redirectSystemPath({ path, initial })).toBe(
          '/(tabs)/(today)/explore',
        );
    },
  );
  test.each([true, false])('people open in Today (cold %s)', (initial) => {
    for (const path of [
      'opax://person/anthony-albanese',
      'https://opax.com.au/subject/person/anthony-albanese',
    ])
      expect(redirectSystemPath({ path, initial })).toBe(
        '/(tabs)/(today)/person/anthony-albanese',
      );
    expect(redirectSystemPath({ path: 'opax://party/labor', initial })).toBe(
      '/(tabs)/(today)/party/labor',
    );
  });
  test.each([true, false])(
    'the Liberal Democratic Party’s old links open the Libertarian Party page in Today (cold %s)',
    (initial) => {
      // The web's 301s: one party, at its current name.
      for (const path of [
        'https://opax.com.au/subject/party/liberal-democratic-party',
        'https://opax.com.au/subject/party/liberal-democrats',
        'https://opax.com.au/subject/party/Liberal%20Democratic%20Party',
        'https://opax.com.au/party/liberal-democratic-party',
        'https://opax.com.au/subject/party/libertarian-party',
        'opax://party/liberal-democratic-party',
      ])
        expect(redirectSystemPath({ path, initial })).toBe(
          '/(tabs)/(today)/party/libertarian-party',
        );
      const { fromWebPath } = jest.requireActual<
        typeof import('../src/navigation/external')
      >('../src/navigation/external');
      expect(fromWebPath('/subject/party/liberal-democratic-party')).toEqual({
        pathname: '/party/[slug]',
        params: { slug: 'libertarian-party', name: 'Libertarian Party' },
      });
      expect(
        redirectSystemPath({
          path: 'https://opax.com.au/subject/party/liberal-democratic-party?section=changes',
          initial,
        }),
      ).toBe('/(tabs)/(today)/party/libertarian-party?section=changes');
      // Other parties' links are unchanged.
      expect(
        redirectSystemPath({
          path: 'https://opax.com.au/subject/party/labor',
          initial,
        }),
      ).toBe('/(tabs)/(today)/party/labor');
    },
  );
  test.each([true, false])(
    'money pages and editions open in Today (cold %s)',
    (initial) => {
      for (const [path, target] of [
        ['opax://public-money', '/(tabs)/(today)/public-money'],
        ['opax://grants', '/(tabs)/(today)/grants'],
        ['opax://agencies', '/(tabs)/(today)/agencies'],
        ['opax://edition', '/(tabs)/(today)/edition'],
      ])
        expect(redirectSystemPath({ path: path!, initial })).toBe(
          !initial && path !== 'opax://edition'
            ? target!.replace('/(today)/', '/(bills)/')
            : target,
        );
    },
  );
  test('the Money map opens in Today cold and in the selected tab warm', () => {
    expect(redirectSystemPath({ path: 'opax://money', initial: true })).toBe(
      '/(tabs)/(today)/money',
    );
    expect(redirectSystemPath({ path: 'opax://money', initial: false })).toBe(
      '/(tabs)/(bills)/money',
    );
  });
  test.each([true, false])('bills open in Bills (cold %s)', (initial) => {
    setSelectedTab('(today)');
    expect(
      redirectSystemPath({ path: 'opax://bill/au-federal-r7534', initial }),
    ).toBe('/(tabs)/(bills)/bill/au-federal-r7534');
    expect(redirectSystemPath({ path: 'opax://bills', initial })).toBe(
      '/(tabs)/(bills)/bills',
    );
  });
  test('a tab of its own: Search, Ask and Your MP pages', () => {
    expect(linkTab('/results/person', false)).toBe('(search)');
    expect(linkTab('/conversations', false)).toBe('(ask)');
    expect(linkTab('/members', false)).toBe('(your-mp)');
    expect(
      redirectSystemPath({ path: 'opax://search?q=gambling', initial: false }),
    ).toBe('/(tabs)/(search)/search?q=gambling');
  });
  test('root-stack routes and grouped paths are left alone', () => {
    for (const path of ['/talk', '/account', '/seat', '/source', '/welcome'])
      expect(linkTab(path, false)).toBeNull();
    expect(linkTab('/(tabs)/(ask)/ask', true)).toBeNull();
    expect(redirectSystemPath({ path: 'opax://talk', initial: false })).toBe(
      '/talk',
    );
    expect(
      redirectSystemPath({ path: 'opax://voice-bridge-test', initial: true }),
    ).toBe('/voice-bridge-test');
  });
});

test('cold root links select an existing tab route rather than a missing Today child', () => {
  const { redirectSystemPath } = jest.requireActual(
    '../src/app/+native-intent',
  );
  expect(redirectSystemPath({ path: 'opax://your-mp', initial: true })).toBe(
    '/(tabs)/(your-mp)/your-mp',
  );
  expect(
    redirectSystemPath({
      path: 'https://opax.com.au/ask?view=search&q=housing',
      initial: true,
    }),
  ).toBe('/(tabs)/(search)/results/all?q=housing&link=1');
});

test('incoming map filters retain canonical party focus and jurisdiction', () => {
  const { fromWebPath } = jest.requireActual('../src/navigation/external');
  expect(fromWebPath('/money?party=Labor&jur=qld')).toMatchObject({
    pathname: '/money',
    params: { focus: 'party:Labor', jurisdiction: 'qld' },
  });
});
