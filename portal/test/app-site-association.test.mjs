import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { appSiteAssociation, appSiteAssociationResponse, APP_SITE_ASSOCIATION_PATH } from '../src/app-site-association.ts';
import { APP_BUNDLE_ID, APP_LINK_COMPONENTS, APP_LINK_HOST } from '../src/universal-links.generated.ts';
import { claimed, components, componentMatches, loadSource } from '../../scripts/build_universal_links.mjs';

const url = 'https://opax.com.au' + APP_SITE_ASSOCIATION_PATH;
// A made-up team, in the shape of a real one.
const team = 'A1B2C3D4E5';
const table = loadSource();
const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const body = async (response) => JSON.parse(await response.text());
/** Whether the served components claim an address: Apple's rule, first match wins. */
const served = (path) => {
  const address = new URL(path, 'https://opax.com.au');
  const match = APP_LINK_COMPONENTS.find((component) => componentMatches(component, address));
  return !!match && !match.exclude;
};

test('the path is the one iOS reads', () => {
  assert.equal(APP_SITE_ASSOCIATION_PATH, '/.well-known/apple-app-site-association');
});

test('the file is JSON, served as application/json without a redirect', async () => {
  const response = appSiteAssociationResponse(new Request(url), team);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=3600');
  assert.deepEqual(await body(response), appSiteAssociation(team));
  const head = appSiteAssociationResponse(new Request(url, { method: 'HEAD' }), team);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-type'), 'application/json');
  assert.equal(await head.text(), '');
});

test('the Worker answers it before any redirect or block', () => {
  const route = index.indexOf('url.pathname === APP_SITE_ASSOCIATION_PATH');
  assert.ok(route > 0, 'the route is wired');
  assert.match(index.slice(route, route + 200), /appSiteAssociationResponse\(request, env\.APPLE_TEAM_ID\)/);
  const handler = index.indexOf('async fetch(request, env, ctx)');
  assert.ok(handler > 0 && route > handler);
  for (const later of ['await pageAliasRedirect(request, url, env)', 'networkBlock(request, env, url.pathname)'])
    assert.ok(index.indexOf(later, handler) > route, later);
  // No static file of that name: an extensionless asset would be served with the wrong type.
  assert.throws(() => readFileSync(new URL('../public/.well-known/apple-app-site-association', import.meta.url)));
});

test('it names the app by team and bundle identifier', async () => {
  const { applinks } = await body(appSiteAssociationResponse(new Request(url), team));
  assert.deepEqual(Object.keys(applinks), ['details']);
  assert.equal(applinks.details.length, 1);
  assert.deepEqual(applinks.details[0].appIDs, [`${team}.au.com.opax.app`]);
  assert.equal(APP_BUNDLE_ID, 'au.com.opax.app');
  assert.equal(APP_BUNDLE_ID, table.bundleId);
  assert.equal(APP_LINK_HOST, 'opax.com.au');
});

test('without a team identifier, or on another host or method, the path is a 404', async () => {
  for (const value of [undefined, '', 'a1b2c3d4e5', 'A1B2C3D4E', 'A1B2C3D4E5F', 'A1B2C3D4E5.au.com.opax.app', 'A1B2 C3D4E'])
    assert.equal(appSiteAssociationResponse(new Request(url), value).status, 404, String(value));
  for (const host of ['www.opax.com.au', 'opax-staging.example.workers.dev', 'localhost'])
    assert.equal(appSiteAssociationResponse(new Request(`https://${host}${APP_SITE_ASSOCIATION_PATH}`), team).status, 404, host);
  for (const method of ['POST', 'PUT', 'DELETE'])
    assert.equal(appSiteAssociationResponse(new Request(url, { method }), team).status, 404, method);
  const missing = appSiteAssociationResponse(new Request(url), undefined);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.equal(await missing.text(), 'Not found');
});

test('the served components are the shared table, exclusions first', async () => {
  execFileSync(process.execPath, [new URL('../../scripts/build_universal_links.mjs', import.meta.url).pathname, '--check']);
  const { applinks } = await body(appSiteAssociationResponse(new Request(url), team));
  assert.deepEqual(applinks.details[0].components, components(table));
  assert.deepEqual(APP_LINK_COMPONENTS, components(table));
  const firstClaim = APP_LINK_COMPONENTS.findIndex((component) => !component.exclude);
  assert.equal(firstClaim, table.exclude.length);
  assert.ok(APP_LINK_COMPONENTS.slice(firstClaim).every((component) => !component.exclude));
  for (const component of APP_LINK_COMPONENTS)
    assert.deepEqual(Object.keys(component).filter((key) => !['/', '?', '#', 'exclude', 'comment'].includes(key)), []);
});

test('the claimed paths are exactly the pages the app opens', () => {
  assert.deepEqual(APP_LINK_COMPONENTS.filter((component) => !component.exclude), [
    { '/': '/' },
    { '/': '/today' },
    { '/': '/today/edition' },
    { '/': '/edition' },
    { '/': '/subject/person' },
    { '/': '/subject/person/*' },
    { '/': '/subject/party' },
    { '/': '/subject/party/*' },
    { '/': '/subject/electorate' },
    { '/': '/subject/electorate/*' },
    { '/': '/subject/topic' },
    { '/': '/subject/topic/*' },
    { '/': '/subject/agency' },
    { '/': '/subject/agency/*' },
    { '/': '/subject/donor/*' },
    { '/': '/subject/supplier/*' },
    { '/': '/subject/campaigner/*' },
    { '/': '/bills' },
    { '/': '/bill/*' },
    { '/': '/doc/*' },
    { '/': '/report/*' },
    { '/': '/ask', '?': { view: 'search' } },
    { '/': '/ask', '?': { q: '?*' } },
    { '/': '/money' },
    { '/': '/money/grants' },
    { '/': '/money/grants/*/recipient/*' },
    { '/': '/connections' },
    { '/': '/discover' },
    { '/': '/explore' },
    { '/': '/declared' },
    { '/': '/expenses' },
    { '/': '/about' },
    { '/': '/methods' },
    { '/': '/stats' },
    { '/': '/vic-election-2026' },
    { '/': '/vic-election-2026/*' },
  ]);
  // No catch-all: a page the table does not list is never claimed.
  assert.ok(!APP_LINK_COMPONENTS.some((component) => !component.exclude && ['*', '/*'].includes(component['/'])));
});

test('every example in the table is claimed', () => {
  for (const entry of table.open)
    for (const path of Object.keys(entry.examples)) {
      assert.equal(served(path), true, path);
      assert.equal(claimed(table, new URL(path, 'https://opax.com.au')), entry, path);
    }
});

test('addresses that must stay on the web are not claimed', () => {
  for (const path of [
    // The API, including the Ask stream, and the machine routes.
    '/api/ask?stream=1', '/api/ask', '/api/search?q=housing', '/api/community/session',
    '/mcp', '/mcp/member', '/oauth/authorize?client_id=example', '/oauth/token',
    '/.well-known/apple-app-site-association', '/.well-known/oauth-authorization-server', '/ingest/e', '/og/person/example.png',
    // Legal and support pages.
    '/privacy', '/terms', '/security', '/support',
    // Sign-in and community links: the emailed link signs the browser in.
    '/community', '/community?view=signin#token=example-token', '/community?view=thread&id=abc&reply=def#reply-def', '/community?view=settings#email-notifications',
    '/subject/person/anthony-albanese#token=example-token', '/bills?token=example-token', '/ask?q=housing&code=123456', '/?code=123456',
    // The web's Ask: the bare page (where an answer streams), chat and the legacy entries.
    '/ask', '/chat', '/?q=housing', '/subject/person/anthony-albanese?ask=housing',
    // Web views of pages the app has, and pages it does not have.
    '/money/grants?open=GA123', '/money/grants/federal/recipient/person:jane%20citizen', '/money/grants/qld/recipient/person%3Ajane%20citizen',
    '/money/receipts', '/money/explain', '/money/contracts', '/reports', '/reports/example', '/search?q=housing', '/subject/donor',
    '/budget', '/audit', '/audit/example', '/estimates', '/sitting', '/instruments', '/register/vic-gifts', '/official-reports',
    '/media/demo.mp4', '/bill-texts/au-federal-r7534/index.json', '/sitemap.xml', '/robots.txt', '/no-such-page',
  ])
    assert.equal(served(path), false, path);
});

test('each required exclusion is listed by name', () => {
  const excluded = APP_LINK_COMPONENTS.filter((component) => component.exclude);
  const paths = excluded.map((component) => component['/']);
  for (const path of ['/api/*', '/mcp', '/mcp/*', '/oauth/*', '/community', '/community/*', '/privacy', '/terms', '/.well-known/*'])
    assert.ok(paths.includes(path), path);
  assert.ok(excluded.some((component) => component['/'] === '*' && component['#'] === 'token=*'));
  assert.ok(excluded.every((component) => typeof component.comment === 'string' && component.comment.length > 0));
});

test('the team identifier is not in the repository', () => {
  // The value is a Worker var; the committed configuration carries none.
  assert.doesNotMatch(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'), /"APPLE_TEAM_ID"\s*:\s*"[A-Z0-9]{10}"/);
});
