import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Alert } from 'react-native';
import {
  canonicalUrl,
  forbiddenOpaxRoute,
  openOnWeb,
  sourceUrl,
} from '../src/navigation/external';
import { shareRecord } from '../src/navigation/share';
import { isE2E, webOrigin } from '../src/design/environment';
import { partyIdentity } from '../src/design/party';
import {
  contentSizeCategory,
  isAccessibilityCategory,
  navigationTitleSizes,
} from '../src/design/tokens';

describe('canonical share links', () => {
  test('use the configured origin, with no query or app state', () => {
    expect(canonicalUrl('/subject/person/anthony-albanese')).toBe(
      `${webOrigin}/subject/person/anthony-albanese`,
    );
    expect(
      canonicalUrl('/subject/person/anthony-albanese?utm_source=app&tab=1'),
    ).toBe(`${webOrigin}/subject/person/anthony-albanese`);
    expect(canonicalUrl('/subject/person/anthony-albanese', 'person-pay')).toBe(
      `${webOrigin}/subject/person/anthony-albanese#person-pay`,
    );
  });
  test.each([
    // Forbidden routes, any case, with or without a trailing path or query.
    '/og/subject/person/x.png',
    '/og',
    '/api/search',
    '/API/search',
    '/mcp',
    '/ask',
    '/ask?view=search&q=housing',
    '/chat',
    '/ingest/x',
    '/.well-known/apple-app-site-association',
    // Protocol-relative and absolute URLs.
    '//evil.example/x',
    '///evil.example/x',
    'https://evil.example/x',
    'evil.example/x',
    // Backslashes, which URL parsers read as slashes.
    String.raw`/\evil.example/page`,
    String.raw`/subject\..\api`,
    // Dot segments, plain and encoded.
    '/subject/../og/person.png',
    '/subject/./person',
    '/./api/search',
    '/subject/%2e%2e/api/search',
    '/subject/%2E%2E/og/x',
    '/%2e/api',
    // Encoded slashes and backslashes.
    '/subject%2fperson',
    '/subject%2F..%2Fapi',
    '/subject/%5capi',
    // User information, whitespace and control characters.
    '//user:pass@evil.example/x',
    '/subject/person/a b',
    '/subject/person/a\tb',
    '/subject/person/a\nb',
    '',
    'subject/person',
    // Routes the Worker or the web app sends to Ask, search or a runtime pick.
    '/search',
    '/search/',
    '/SEARCH',
    '/search?q=housing',
    '/today',
    '/today?via=bluesky',
    // Percent-encoded first segments decode to the same routes.
    '/%61sk',
    '/%61pi/search',
    '/%73earch',
  ])('refuses %j', (path) => {
    expect(() => canonicalUrl(path)).toThrow();
  });
  test('refuses anchors that are not plain identifiers', () => {
    for (const anchor of ['a b', 'x"><', '../x', ''])
      expect(() => canonicalUrl('/subject/person/x', anchor)).toThrow();
  });
  test('accepts ordinary pages and keeps them on the configured origin', () => {
    for (const path of [
      '/subject/person/anthony-albanese',
      '/subject/electorate/federal-representatives-nsw-grayndler',
      '/bill/au-federal-r7534',
      '/methods',
      '/askew', // only the /ask route itself is refused
      '/searches',
      '/subject/person', // a query is dropped, so "/?q=" cannot be built
    ]) {
      const url = new URL(canonicalUrl(path));
      expect(url.origin).toBe(webOrigin);
      expect(url.pathname).toBe(path);
    }
  });
});

describe('source links', () => {
  test.each([
    'https://theyvoteforyou.org.au/divisions/senate/2026-08-19/6',
    'https://www.tenders.gov.au/',
    'https://raw.githubusercontent.com/openaustralia/openaustralia-parser/master/data/representatives.csv',
    'https://opax.com.au/subject/person',
    // A query on an ordinary page is not an Ask entry; only "ask" is.
    'https://opax.com.au/subject/person?q=albanese',
    // A plain anchor is not a route.
    'https://opax.com.au/subject/person/anthony-albanese#person-pay',
    'https://opax.com.au/subject/person/anthony-albanese#interests',
    'https://opax.com.au/reports/gambling#section-2',
    'https://opax.com.au/community?view=thread&id=x#reply-ab12',
    'https://opax.com.au/money#/money/grants',
    'https://opax.com.au/#/subject/person/Anthony%20Albanese',
    // Another site's /search or ?q= is that site's business.
    'https://www.aph.gov.au/search?q=housing',
  ])('opens %s', (url) => {
    expect(sourceUrl(url)).toBe(url);
  });
  test.each([
    'http://theyvoteforyou.org.au/',
    'javascript:alert(1)',
    'https://user:pass@example.org/x',
    'https://user@example.org/x',
    String.raw`https://evil.example\@opax.com.au/`,
    'https://example.org:8443/x',
    'https://example.org/a b',
    '//example.org/x',
    '/subject/person',
    'https://opax.com.au/api/search',
    'https://www.opax.com.au/og/subject/person/x.png',
    'https://opax.com.au/mcp',
    'https://opax.com.au/ask?view=search',
    'https://opax.com.au/chat',
    'https://opax.com.au/subject/../api/search',
    'https://opax.com.au/subject/%2e%2e/og/x.png',
    'https://OPAX.com.au/API/x',
    'https://opax.invalid/api/search',
    // portal/src/page-entry.ts: /search and the root with q or ask redirect to Ask.
    'https://opax.com.au/search',
    'https://www.opax.com.au/search/',
    'https://opax.com.au/search?q=housing',
    'https://opax.com.au/?q=housing',
    'https://opax.com.au/?ask=housing',
    'https://opax.com.au//?q=housing',
    'https://opax.com.au/?utm_source=x&q=housing',
    // portal/public/app.js: "ask" starts Ask on any page.
    'https://opax.com.au/subject/person/anthony-albanese?ask=housing',
    'https://opax.com.au/money?ask=',
    // portal/public/app.js: a route-shaped fragment is routed instead of the path.
    'https://opax.com.au/#/ask?q=housing',
    'https://opax.com.au/money#/chat',
    'https://opax.com.au/subject/person#/search?q=x',
    'https://opax.com.au/#/x#/api/search',
    // The router drops empty segments: "//ask" is /ask, not a host named ask.
    'https://opax.com.au/money#//ask/ignored?q=housing',
    // portal/src/social-publication.ts: /today goes where the journal says.
    'https://opax.com.au/today',
    // Encoded segments, trailing-dot and subdomain hosts are the same server.
    'https://opax.com.au/%61sk?q=x',
    'https://opax.com.au./api/search',
    'https://OPAX.COM.AU../og/x.png',
    'https://staging.opax.com.au/api/search',
    'https://opax.com.au/ask?view=search',
  ])('refuses %j', (url) => {
    expect(() => sourceUrl(url)).toThrow();
  });
});

describe('fragment routes', () => {
  // The web app reads a route-shaped fragment three ways: its router drops
  // empty segments, the startup fold and home.js parse it as a URL, and
  // route() shows the Ask panel for any view it does not know. Only content
  // views pass, exactly as written (tests/web-router.test.ts runs that code).
  test.each([
    ['/money#//ask/ignored?q=housing', 'an Ask query'],
    ['/money#//ask/ignored', 'a fragment route'],
    ['/money#///ask', 'a fragment route'],
    ['/money#/%2Fask', 'a fragment route'],
    ['/money#%2F%2Fask', 'a fragment route'],
    ['/money#/%252Fask', 'a fragment route'],
    ['/money#/%61sk', 'a fragment route'],
    ['/money#/%252561sk', 'a fragment route'],
    [String.raw`/money#\ask`, 'a fragment route'],
    [String.raw`/money#\\ask`, 'a fragment route'],
    [String.raw`/money#/\ask`, 'a fragment route'],
    ['/money#%5Cask', 'a fragment route'],
    ['/money#/ASK', 'a fragment route'],
    ['/money#/aKs', 'a fragment route'],
    ['/money#/%09ask', 'a fragment route'],
    ['/money#//chat', 'a fragment route'],
    ['/money#//search', 'a fragment route'],
    ['/money#//api/x', 'a fragment route'],
    ['/money#//og/x.png', 'a fragment route'],
    ['/money#///MCP', 'a fragment route'],
    ['/money#section#//ask', 'a fragment route'],
    // A URL parser reads "//host/path" as a host: the path is what remains.
    ['/#//opax.com.au/ask', 'a fragment route'],
    ['/#//opax.com.au/api/search', 'a fragment route'],
    ['/#//opax.com.au/og/x.png', 'a fragment route'],
    ['/#//opax.com.au/mcp', 'a fragment route'],
    ['/money#//example.org/chat', 'a fragment route'],
    ['/money#//example.org/search', 'a fragment route'],
    ['/money#//example.org/money', 'a fragment route'],
    // Views route() does not know show the Ask panel.
    ['/money#/ask;mode=x', 'a fragment route'],
    ['/money#/ＡＳＫ', 'a fragment route'],
    ['/money#/aſk', 'a fragment route'],
    ['/money#/asks', 'a fragment route'],
    ['/money#/doc', 'a fragment route'],
    ['/money#/subject', 'a fragment route'],
    ['/money#/subject/unknown', 'a fragment route'],
    ['/money#/unknown', 'a fragment route'],
    ['/money#/money;foo', 'a fragment route'],
    ['/money#/Money', 'a fragment route'],
    ['/money#/%6Doney', 'a fragment route'],
    // Dot segments, plain and escaped, even under a content view.
    ['/#/./ask', 'a fragment route'],
    ['/#/x/../ask', 'a fragment route'],
    ['/#/money/../ask', 'a fragment route'],
    ['/#/money/%2e%2e/chat', 'a fragment route'],
    ['/#/money/.%2E/ask', 'a fragment route'],
    // "q" or "ask" anywhere in a fragment.
    ['/money#/money?ask=x', 'an Ask query'],
    ['/money#/money?a=1&ASK=x', 'an Ask query'],
    ['/money#/money?%71=x', 'an Ask query'],
    ['/money#/money?x=1?ask=housing', 'an Ask query'],
    ['/money#/money&ask=housing', 'an Ask query'],
    ['/money#/money#?q=housing', 'an Ask query'],
    ['/#?q=x', 'an Ask query'],
    ['/#/?q=x', 'an Ask query'],
    ['/#//?q=x', 'an Ask query'],
    ['/#q=x', 'an Ask query'],
    ['/money#/%E0%A4%A', 'an unreadable fragment'],
    ['/money#/%25252561sk', 'an unreadable fragment'],
  ])('refuses %s (%s)', (address, reason) => {
    const url = new URL(`https://opax.com.au${address}`);
    expect(forbiddenOpaxRoute(url)).toBe(reason);
    expect(() => sourceUrl(url.toString())).toThrow();
  });
  test.each([
    '/subject/person/anthony-albanese#person-pay',
    '/subject/person/anthony-albanese#interests',
    '/reports/gambling#section-2',
    '/bill/x#bill-full-text',
    '/community?view=thread&id=x#reply-ab12',
    '/money#asking-price',
    '/money#tokens',
    '/money#keyboard',
    // Content views, as legacy links wrote them.
    '/money#/money/grants',
    '/money#/bills?jur=federal',
    '/#/subject/person/Anthony%20Albanese',
    '/#/subject/donor/Example%20Pty%20Ltd',
    '/#/subject/topic/search-and-rescue',
    '/#/subject/party',
    '/#/reports/gambling',
    '/#/doc/x',
    '/#/explore?game=grants&jur=federal',
  ])('keeps %s', (address) => {
    const url = new URL(`https://opax.com.au${address}`);
    expect(forbiddenOpaxRoute(url)).toBeNull();
    expect(sourceUrl(url.toString())).toBe(url.toString());
  });
});

describe('credentials', () => {
  // portal/public/community.js signs a reader in with a fragment token, so
  // no OPAX link the app opens or shares carries a credential, in any
  // encoding or case, in the query or the fragment.
  test.each([
    '/community?view=signin#token=synthetic',
    '/community?token=synthetic',
    '/community#%74oken=synthetic',
    '/community#x=1&token=synthetic',
    '/community#;token=synthetic',
    '/money#token=synthetic',
    '/money#TOKEN=synthetic',
    '/money#ｔｏｋｅｎ=synthetic',
    '/money#access_token=synthetic',
    '/money#id_token=synthetic',
    '/money?Refresh_Token=synthetic',
    '/money?%2574oken=synthetic',
    '/money?api_key=synthetic',
    '/money?key=synthetic',
    '/money?code=synthetic',
    '/money#/money?code=synthetic',
    '/money?secret=synthetic',
    '/money#session',
    '/money?auth=synthetic',
    '/money?password=synthetic',
    '/money?sig=synthetic',
    '/money?signature=synthetic',
  ])('refuses %s', (address) => {
    const url = new URL(`https://opax.com.au${address}`);
    expect(forbiddenOpaxRoute(url)).toBe('a credential');
    expect(() => sourceUrl(url.toString())).toThrow();
  });
  test('another site keeps its own keys', () => {
    const url = 'https://example.org/register?key=abc&code=1#token=x';
    expect(sourceUrl(url)).toBe(url);
  });
  test.each([
    'token',
    'TOKEN',
    'access_token',
    'code',
    'key',
    'session',
    'ask',
    'q',
  ])('refuses the anchor %j', (anchor) => {
    expect(() => canonicalUrl('/subject/person/x', anchor)).toThrow();
  });
  test.each(['person-pay', 'interests', 'section-2', 'bill-full-text'])(
    'keeps the anchor %j',
    (anchor) => {
      expect(canonicalUrl('/subject/person/x', anchor)).toBe(
        `${webOrigin}/subject/person/x#${anchor}`,
      );
    },
  );
});

describe('e2e configuration and sharing', () => {
  test('without a readable build configuration, behave like e2e', () => {
    // jest has no embedded app config: the module fails closed.
    expect(isE2E).toBe(true);
    expect(webOrigin).toBe('https://opax.invalid');
  });
  test('e2e shows the link locally and never opens the share sheet', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    await shareRecord({
      path: '/subject/person/anthony-albanese',
      title: 'Anthony Albanese',
    });
    expect(alert).toHaveBeenCalledWith(
      'Share: Anthony Albanese',
      'https://opax.invalid/subject/person/anthony-albanese',
    );
    alert.mockRestore();
  });
});

describe('party identity', () => {
  test('roster names keep their wording; short labels for dense rows', () => {
    expect(partyIdentity('Labor')).toMatchObject({
      name: 'Labor',
      short: 'ALP',
    });
    expect(partyIdentity('Country Liberal Party')).toMatchObject({
      short: 'CLP',
    });
    expect(partyIdentity('Pauline Hanson’s One Nation')).toMatchObject({
      short: 'ONP',
    });
    expect(partyIdentity("Australia's Voice")).toMatchObject({
      name: "Australia's Voice",
      short: "Australia's Voice",
    });
    expect(partyIdentity(null)).toMatchObject({
      name: 'Party not recorded',
      color: null,
      recorded: false,
    });
  });
});

describe('Dynamic Type mapping', () => {
  test("React Native's font scales map to content size categories", () => {
    expect(contentSizeCategory(1)).toBe('large');
    expect(contentSizeCategory(1.353)).toBe('xxxLarge');
    expect(contentSizeCategory(1.786)).toBe('ax1');
    expect(contentSizeCategory(3.571)).toBe('ax5');
    expect(isAccessibilityCategory(1.353)).toBe(false);
    expect(isAccessibilityCategory(1.786)).toBe(true);
  });
  test('navigation titles follow the system ramps', () => {
    expect(navigationTitleSizes(1)).toEqual({ largeTitle: 34, title: 17 });
    expect(navigationTitleSizes(3.571)).toEqual({ largeTitle: 60, title: 23 });
    expect(navigationTitleSizes(0.823)).toEqual({ largeTitle: 31, title: 14 });
  });
});

describe('workbench exclusion', () => {
  // Metro's config loads in node, not in the React Native test environment.
  function blockList(variant: string): RegExp[] {
    const sources = execFileSync(
      process.execPath,
      [
        '-e',
        'const c = require("./metro.config.js"); process.stdout.write(JSON.stringify([c.resolver.blockList].flat().filter(Boolean).map((r) => r.source)))',
      ],
      {
        cwd: resolve(__dirname, '..'),
        env: { ...process.env, OPAX_VARIANT: variant },
        encoding: 'utf8',
      },
    );
    return (JSON.parse(sources) as string[]).map(
      (source) => new RegExp(source),
    );
  }
  const blocked = (list: RegExp[], path: string) =>
    list.some((pattern) => pattern.test(path));
  test('production bundles cannot see the workbench', () => {
    const list = blockList('production');
    expect(blocked(list, '/repo/mobile/src/app/workbench.tsx')).toBe(true);
    expect(blocked(list, '/repo/mobile/src/workbench/Workbench.tsx')).toBe(
      true,
    );
    expect(blocked(list, '/repo/mobile/src/app/account.tsx')).toBe(false);
    expect(blocked(list, '/repo/mobile/src/design/primitives.tsx')).toBe(false);
  });
  test('development and e2e builds include it', () => {
    for (const variant of ['development', 'e2e'])
      expect(
        blocked(blockList(variant), '/repo/mobile/src/app/workbench.tsx'),
      ).toBe(false);
  });
});

test('the temporary privacy link preserves its reviewed query in the e2e destination', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await openOnWeb('/community?view=privacy', 'Privacy policy');
  expect(alert).toHaveBeenCalledWith(
    'Opens on opax.com.au: Privacy policy',
    `${webOrigin}/community?view=privacy`,
  );
  expect(canonicalUrl('/community?view=privacy')).toBe(
    `${webOrigin}/community`,
  );
  alert.mockRestore();
});

test('web record navigation retains its query while sharing stays canonical', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await openOnWeb('/declared?person=Anthony%20Albanese', 'Open the record');
  expect(alert).toHaveBeenCalledWith(
    'Opens on opax.com.au: Open the record',
    `${webOrigin}/declared?person=Anthony%20Albanese`,
  );
  expect(canonicalUrl('/declared?person=Anthony%20Albanese')).toBe(
    `${webOrigin}/declared`,
  );
  alert.mockRestore();
});
test.each([
  '/community?view=privacy&ask=x',
  '/declared?person=x&token=secret',
  '/?q=search',
  '/declared#/ask',
])(
  'web navigation guards the complete query and fragment: %s',
  async (path) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await openOnWeb(path, 'Open');
    expect(alert).toHaveBeenCalledWith(
      'opax.com.au',
      'This page could not be opened.',
    );
    alert.mockRestore();
  },
);
