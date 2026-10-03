import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Alert } from 'react-native';
import { canonicalUrl, sourceUrl } from '../src/navigation/external';
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
    'https://opax.com.au/money#/money/grants',
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
