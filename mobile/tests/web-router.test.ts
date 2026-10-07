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
    './routes': { searchRouteFromWebPath: () => null },
    'react-native': {},
    'expo-router': { router: {} },
    './routes': {},
    'expo-web-browser': {},
    '../design/environment': { webOrigin: origin, isE2E: true },
    '../design/tokens': { light: {} },
    './source-destination': {},
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
  ['/#/reports/gambling', { panel: 'reports' }],
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
      resolve(mobile, 'src/navigation/external.ts'),
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
