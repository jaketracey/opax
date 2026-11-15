import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Linking, Platform } from 'react-native';
import { track } from '../src/analytics';
import { redirectSystemPath } from '../src/app/+native-intent';
import { universalLinkEntry } from '../src/navigation/universal-links';
import {
  universalLinkExcludes,
  universalLinkHost,
  universalLinkOpens,
} from '../src/navigation/universal-links.generated';

jest.mock('../src/analytics', () => ({ track: jest.fn() }));

type Pattern = { '/': string; '?'?: Record<string, string>; '#'?: string };
type Table = {
  host: string;
  bundleId: string;
  exclude: (Pattern & { why: string })[];
  open: (Pattern & { opens: string[]; examples: Record<string, string> })[];
};
const root = join(__dirname, '..');
const table = JSON.parse(
  readFileSync(join(root, '../docs/universal-links.json'), 'utf8'),
) as Table;
const site = `https://${table.host}`;
const label = (pattern: Pattern) =>
  `${pattern['/']}${pattern['?'] ? `?${new URLSearchParams(pattern['?'])}` : ''}${pattern['#'] ? `#${pattern['#']}` : ''}`;
/** The Ask page stamps each arrival; the stamp is not part of the mapping. */
const withoutEntry = (path: string) => path.replace(/[?&]entry=[^&]*/, '');
let openURL: jest.SpyInstance;
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  jest.mocked(track).mockClear();
});
afterEach(() => openURL.mockRestore());

test('the app and the association file are generated from the one table', () => {
  const check = spawnSync(
    process.execPath,
    [join(root, '../scripts/build_universal_links.mjs'), '--check'],
    { encoding: 'utf8' },
  );
  expect(check.stderr).toBe('');
  expect(check.status).toBe(0);
  expect(universalLinkHost).toBe(table.host);
  expect(universalLinkExcludes).toHaveLength(table.exclude.length);
  expect(
    universalLinkOpens.map((entry) => [label(entry), entry.opens]),
  ).toEqual(table.open.map((entry) => [label(entry), entry.opens]));
});

test('the build claims the table’s host, and the table names this app', () => {
  const config = readFileSync(join(root, 'app.config.ts'), 'utf8');
  expect(config.match(/applinks:[^'"`]+/g)).toEqual([`applinks:${table.host}`]);
  expect(config).toContain(`bundleIdentifier: '${table.bundleId}'`);
  // E2E builds stay on the local fixture and claim no domain.
  expect(config).toMatch(
    /variant === 'e2e'\s*\?\s*\{\}\s*:\s*\{ associatedDomains/,
  );
});

describe.each(table.open.map((entry) => [label(entry), entry] as const))(
  'a link to %s',
  (_, entry) => {
    test.each(Object.entries(entry.examples))(
      '%s opens %s in the app',
      (path, destination) => {
        for (const initial of [true, false]) {
          const url = new URL(`${site}${path}`);
          expect(universalLinkEntry(url)).toMatchObject({
            '/': entry['/'],
            opens: entry.opens,
          });
          expect(
            withoutEntry(
              String(redirectSystemPath({ path: url.href, initial })),
            ),
          ).toBe(destination);
        }
        expect(openURL).not.toHaveBeenCalled();
        expect(jest.mocked(track).mock.calls).toHaveLength(2);
        for (const [event, properties] of jest.mocked(track).mock.calls) {
          expect(event).toBe('opax_link_open');
          expect(properties).toMatchObject({ source: 'universal' });
          expect(entry.opens).toContain(
            (properties as { route_pattern: string }).route_pattern,
          );
        }
      },
    );
  },
);

// Addresses the association file does not claim. iOS never hands these to
// the app; if one arrives anyway (an old cached association file, another
// app passing a link on) it goes to the browser, never to "page not found".
const webOnly = [
  // Excluded outright.
  '/api/ask?stream=1',
  '/api/search?q=housing',
  '/mcp',
  '/mcp/member',
  '/oauth/authorize?client_id=example',
  '/.well-known/apple-app-site-association',
  '/ingest/e',
  '/og/person/anthony-albanese.png',
  '/privacy',
  '/terms',
  '/security',
  '/support',
  '/chat',
  // Community and its sign-in link: the browser signs in, as it does today.
  '/community',
  '/community?view=signin#token=example-token',
  '/community?view=thread&id=abc',
  // A credential on a page the app would otherwise open.
  '/subject/person/anthony-albanese#token=example-token',
  '/bills?token=example-token',
  '/ask?q=housing&code=123456',
  // The web's own Ask entries.
  '/ask',
  '/?q=housing',
  '/subject/person/anthony-albanese?ask=housing',
  // Web views of a page the app has.
  '/money/grants?open=GA123',
  '/money/grants/federal/recipient/person:jane%20citizen',
  '/money/grants/federal/recipient/person%3Ajane%20citizen',
  // Addresses the web redirects elsewhere, and app paths the web lacks.
  '/discover',
  '/discover?category=grants&item=record',
  '/today',
  '/today/edition',
  '/edition',
  // Encodings and spellings of an excluded or unknown address.
  '/money/grants/federal/recipient/%70erson:jane',
  '/money/grants/federal/recipient/%70erson%3Ajane',
  '/%61pi/ask',
  '/%63ommunity?view=signin#token=example-token',
  '/privac%79',
  '/subject/person/%E0%A4%A',
  '/Bills',
  '/bills/',
  '/subject/person/..%2f..%2fapi/ask',
  '/ask?q=x&token=y',
  // Pages the app does not have.
  '/money/receipts',
  '/money/explain',
  '/money/contracts',
  '/reports',
  '/reports/grants-allocation',
  '/search?q=housing',
  '/subject/donor',
  '/budget',
  '/audit',
  '/estimates',
  '/sitting',
  '/instruments',
  '/register/vic-gifts',
  '/official-reports',
  '/party/liberal-democratic-party',
  '/no-such-page',
  // App routes that are not web addresses.
  '/seat',
  '/follows',
  '/directory',
  '/account',
  '/person/anthony-albanese',
  '/talk',
  // Claimed patterns the app cannot place stay on the web too.
  '/doc/not-a-record-slug',
  '/report/gambling',
  '/subject/person/anthony-albanese/unknown-section',
  '/subject/electorate/el_5d600e7f6dca5b72ae04d686?asof=not-a-date',
  '/bill/au-federal-r7534#unknown-anchor',
];
describe('an address the app does not open', () => {
  test.each(webOnly)('%s opens in the browser', (path) => {
    const href = `${site}${path}`;
    // Cold: the app shows its first page behind the browser. Warm: it stays
    // where it is.
    expect(redirectSystemPath({ path: href, initial: true })).toBe('/');
    expect(redirectSystemPath({ path: href, initial: false })).toBe('');
    expect(openURL.mock.calls).toEqual([
      [new URL(href).href],
      [new URL(href).href],
    ]);
    // Nothing is routed, so nothing is counted as an opened link.
    expect(track).not.toHaveBeenCalled();
  });

  test('the excluded list covers what must stay on the web', () => {
    const excluded = (path: string) =>
      universalLinkExcludes.some(
        (pattern) => pattern['/'] === path || pattern['/'] === `${path}/*`,
      );
    for (const path of [
      '/api',
      '/mcp',
      '/oauth',
      '/community',
      '/privacy',
      '/terms',
      '/.well-known',
    ])
      expect([path, excluded(path)]).toEqual([path, true]);
    expect(universalLinkExcludes).toContainEqual({ '/': '*', '#': 'token=*' });
  });

  test('Android’s link inbox still gets a destination', () => {
    const os = Platform.OS;
    Platform.OS = 'android';
    try {
      const { resolveSystemPath } = jest.requireActual<
        typeof import('../src/navigation/system-path')
      >('../src/navigation/system-path');
      expect(
        resolveSystemPath({ path: `${site}/privacy`, initial: false }),
      ).toBe('/');
    } finally {
      Platform.OS = os;
    }
  });
});

describe('links the table does not gate', () => {
  test('the app’s own opax:// links are unchanged', () => {
    expect(redirectSystemPath({ path: 'opax://follows', initial: true })).toBe(
      '/(tabs)/(today)/follows',
    );
    expect(redirectSystemPath({ path: 'opax://seat', initial: false })).toBe(
      '/seat',
    );
    expect(openURL).not.toHaveBeenCalled();
  });

  test('the widget marker does not exempt an https link', () => {
    // A claimed address the app can place opens, counted as a widget's.
    expect(
      redirectSystemPath({
        path: `${site}/subject/person/anthony-albanese?src=widget`,
        initial: true,
      }),
    ).toBe('/(tabs)/(today)/person/anthony-albanese');
    expect(openURL).not.toHaveBeenCalled();
    expect(jest.mocked(track).mock.calls).toEqual([
      [
        'opax_link_open',
        { source: 'widget', route_pattern: '/person/[slug]', initial: true },
      ],
    ]);
    jest.mocked(track).mockClear();
    // One it cannot place, or does not claim, goes to the browser without
    // the marker and is not counted.
    for (const [path, web] of [
      [
        '/subject/person/anthony-albanese/unknown?src=widget',
        '/subject/person/anthony-albanese/unknown',
      ],
      ['/privacy?src=widget', '/privacy'],
      ['/no-such-page?src=widget&x=1', '/no-such-page?x=1'],
    ] as const) {
      openURL.mockClear();
      expect(
        redirectSystemPath({ path: `${site}${path}`, initial: true }),
      ).toBe('/');
      expect(
        redirectSystemPath({ path: `${site}${path}`, initial: false }),
      ).toBe('');
      expect(openURL.mock.calls).toEqual([
        [`${site}${web}`],
        [`${site}${web}`],
      ]);
    }
    expect(track).not.toHaveBeenCalled();
    // An opax:// link is the app's own, with or without the marker.
    expect(
      redirectSystemPath({ path: 'opax://follows?src=widget', initial: true }),
    ).toBe('/(tabs)/(today)/follows');
  });

  test('a trailing slash on a claimed page opens the same page', () => {
    expect(
      redirectSystemPath({
        path: `${site}/subject/person/anthony-albanese/`,
        initial: true,
      }),
    ).toBe('/(tabs)/(today)/person/anthony-albanese');
    expect(openURL).not.toHaveBeenCalled();
  });

  test('another site’s link is not the app’s to place', () => {
    const path = 'https://example.org/bill/au-federal-r7534';
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
    expect(openURL).not.toHaveBeenCalled();
  });
});
