import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { forbiddenOpaxRoute, sourceUrl } from '../src/navigation/external';

// Runs the Worker's own entry redirects (portal/src/page-entry.ts) in node,
// with a stub asset fetcher and no network, and checks the app refuses every
// address the Worker would send to a forbidden page.
const candidates = [
  '/search',
  '/search/',
  '/search?q=housing',
  '/?q=housing',
  '/?ask=housing',
  '/?q=',
  '/?ask=',
  '/?utm_source=x&ask=housing',
  '/',
  '/home',
  '/subject/person/anthony-albanese',
  '/subject/person?q=albanese',
  '/money?q=housing',
  '/searches',
];
type Outcome = { path: string; status: number | null; location: string | null };
function runPageEntry(): Outcome[] {
  const script = `
    import { pageEntry } from ${JSON.stringify(resolve(__dirname, '../../portal/src/page-entry.ts'))};
    const assets = { fetch: async () => new Response('home', { status: 200 }) };
    const paths = ${JSON.stringify(candidates)};
    const out = [];
    for (const path of paths) {
      const response = await pageEntry(new Request('https://opax.com.au' + path), assets);
      out.push({ path, status: response ? response.status : null, location: response ? response.headers.get('location') : null });
    }
    process.stdout.write(JSON.stringify(out));
  `;
  return JSON.parse(
    execFileSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script],
      { cwd: resolve(__dirname, '..'), encoding: 'utf8' },
    ),
  ) as Outcome[];
}

describe("the Worker's entry redirects", () => {
  const outcomes = runPageEntry();
  test('the known Ask aliases redirect to /ask in the Worker source', () => {
    const toAsk = outcomes
      .filter((o) => o.status === 302 && o.location?.startsWith('/ask'))
      .map((o) => o.path);
    expect(toAsk).toEqual(
      expect.arrayContaining([
        '/search',
        '/search/',
        '/?q=housing',
        '/?ask=housing',
      ]),
    );
  });
  test.each(candidates)(
    '%s is refused whenever the Worker sends it somewhere forbidden',
    (path) => {
      const outcome = outcomes.find((o) => o.path === path)!;
      const destination =
        outcome.location &&
        forbiddenOpaxRoute(new URL(outcome.location, 'https://opax.com.au'));
      const url = `https://opax.com.au${path}`;
      if (destination) expect(() => sourceUrl(url)).toThrow();
      // The address itself is checked too, whatever the Worker does with it.
      if (forbiddenOpaxRoute(new URL(url)))
        expect(() => sourceUrl(url)).toThrow();
      else expect(sourceUrl(url)).toBe(new URL(url).toString());
    },
  );
});
