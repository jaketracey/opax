import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { forbiddenOpaxRoute, sourceUrl } from '../src/navigation/external';

// Runs the web app's own fragment reading, lifted from its source: the router
// in portal/public/app.js (rawFragment, hereRoute, parseHash) and the
// homepage's legacy redirect in portal/public/home.js. Every address either
// one would turn into a forbidden view must be refused by the app.
const publicDir = resolve(__dirname, '../../portal/public');
const app = readFileSync(resolve(publicDir, 'app.js'), 'utf8');
const home = readFileSync(resolve(publicDir, 'home.js'), 'utf8');

/** A top-level declaration's source, through its closing brace at column 0. */
function block(source: string, opening: string): string {
  const start = source.indexOf(opening);
  const end = source.indexOf('\n}\n', start);
  if (start < 0 || end < 0) throw new Error(`"${opening}" is gone`);
  return source.slice(start, end + 2);
}

type PageLocation = {
  href: string;
  origin: string;
  pathname: string;
  search: string;
  hash: string;
  replace(to: string): void;
};
function pageLocation(url: URL, replace: (to: string) => void = () => {}) {
  const { href, origin, pathname, search, hash } = url;
  return { href, origin, pathname, search, hash, replace };
}

const readRoute = new Function(
  'location',
  `${['function rawFragment(', 'function hereRoute(', 'function parseHash(']
    .map((opening) => block(app, opening))
    .join('\n')}
  const { segs, params } = parseHash();
  return { fragment: rawFragment(), segs, params };`,
) as (location: PageLocation) => {
  fragment: string;
  segs: string[];
  params: URLSearchParams;
};

const readHomeRedirect = new Function(
  'location',
  block(home, 'const legacyRoute'),
);

/** Where the homepage's legacy redirect sends this address, if anywhere. */
function homeRedirect(url: URL): string | null {
  let to: string | null = null;
  try {
    readHomeRedirect(pageLocation(url, (target) => (to = target)));
  } catch {
    // "//" is no URL: the script stops there in the browser too.
  }
  return to;
}

// The views route() must never reach from an address the app opens.
const forbiddenViews = new Set([
  'ask',
  'chat',
  'search',
  'api',
  'og',
  'mcp',
  'today',
]);

/** Which forbidden view the web app reaches from this address, or null. */
function webVerdict(address: string, depth = 0): string | null {
  const url = new URL(address);
  const { fragment, segs } = readRoute(pageLocation(url));
  if (fragment.startsWith('/') && forbiddenViews.has(segs[0] ?? ''))
    return `the router opens /${segs[0]}`;
  // A route with no segments sends the page to the homepage with the same
  // fragment (route() in app.js), where home.js redirects to it as a path.
  const to = homeRedirect(new URL(`/${url.search}${url.hash}`, url.origin));
  if (!to) return null;
  let target: URL;
  try {
    target = new URL(to, url.origin);
  } catch {
    return null; // location.replace throws on it too
  }
  // "/x/..//ask" leaves the site for a host named "ask": no OPAX view.
  if (target.origin !== url.origin) return null;
  const { hash } = target;
  target.hash = '';
  // The path alone, by the Worker's rules (tests/worker-redirects.test.ts).
  if (forbiddenOpaxRoute(target)) return `the homepage redirects to ${to}`;
  return hash && depth < 2
    ? webVerdict(`${target.toString()}${hash}`, depth + 1)
    : null;
}

describe("the web app's fragment router", () => {
  test('reads "#//ask/…" as Ask, not as a host named "ask"', () => {
    const url = new URL('https://opax.com.au/money#//ask/ignored?q=housing');
    const { fragment, segs, params } = readRoute(pageLocation(url));
    expect(fragment).toBe('//ask/ignored?q=housing');
    expect(segs).toEqual(['ask', 'ignored']);
    expect(params.get('q')).toBe('housing');
  });
  test('sends "#/?q=…" on to the root with q, through the homepage', () => {
    expect(homeRedirect(new URL('https://opax.com.au/#/?q=housing'))).toBe(
      '/?q=housing',
    );
    expect(homeRedirect(new URL('https://opax.com.au/#/x/../ask?q=y'))).toBe(
      '/ask?q=y',
    );
  });

  const pages = ['/', '/money', '/subject/person/anthony-albanese'];
  const leads = [
    '/',
    '//',
    '///',
    '////',
    '/%2F',
    '%2F',
    '\\',
    '/\\',
    '/./',
    '/x/../',
    '/%2e/',
  ];
  const names = [
    'ask',
    'ASK',
    'Ask',
    '%61sk',
    'chat',
    'search',
    'api/x',
    'og/x.png',
    'mcp',
    'today',
    'money',
    'subject/person',
    '',
  ];
  const tails = [
    '',
    '/',
    '/ignored',
    '?q=housing',
    '/ignored?q=housing',
    '?view=search',
    '?ask=housing',
    '#section-2',
  ];
  const sweep = pages.flatMap((page) =>
    leads.flatMap((lead) =>
      names.flatMap((name) =>
        tails.map((tail) => `https://opax.com.au${page}#${lead}${name}${tail}`),
      ),
    ),
  );
  test(`refuses every one of ${sweep.length} fragments the web app routes somewhere forbidden`, () => {
    const reached = sweep.filter((address) => webVerdict(address));
    const missed = reached.filter(
      (address) => !forbiddenOpaxRoute(new URL(address)),
    );
    expect(reached.length).toBeGreaterThan(100);
    expect(missed).toEqual([]);
    for (const address of reached) expect(() => sourceUrl(address)).toThrow();
  });

  test.each([
    'https://opax.com.au/subject/person/anthony-albanese#person-pay',
    'https://opax.com.au/subject/person/anthony-albanese#interests',
    'https://opax.com.au/reports/gambling#section-2',
    'https://opax.com.au/money#/money/grants',
  ])('%s stays an ordinary page, and the app opens it', (address) => {
    expect(webVerdict(address)).toBeNull();
    expect(forbiddenOpaxRoute(new URL(address))).toBeNull();
  });
});
