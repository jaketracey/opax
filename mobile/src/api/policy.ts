// Public, catalog-only GETs. Adding a path requires a source/cost review and test.
export const catalogKinds = ['person', 'interest', 'pay', 'expense'] as const;
export type CatalogKind = (typeof catalogKinds)[number];
const staticPaths = new Set([
  '/parliamentarians.json',
  '/electorates/manifest.json',
  '/bills/index.json',
  '/votes.json',
  '/interests/index.json',
  '/interests/recent.json',
  '/pay.json',
  '/expenses.json',
  '/expense-categories.json',
  '/photos/people.json',
  '/photos/credits.json',
  '/corpus.json',
  '/graph/money.json',
  '/graph/aec-extras.json',
]);
// W13 frozen daily edition: one D1 read of the posted journal, no model,
// preview or OG path (docs/IOS-API-CONTRACT.md, "App readers"). Only `latest`:
// `today` has no previous-day fallback, and exact dates belong to a reader the
// app does not have.
export const editionPath = '/api/app/v1/edition/latest';
const releasePath =
  /^\/electorates\/releases\/[a-f0-9]{16}\/(?:index|people|el_[a-f0-9]{24})\.json$/;
const billPath =
  /^\/bills\/au-federal-(?:[rs]\d+|alrc-\d+|ed-[a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;
const interestPath = /^\/interests\/(?:\d+|n-[a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;

export function assertAllowedPath(path: string): void {
  const [pathname, query] = path.split('?');
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[\u0000-\u0020\u007f]/.test(path) ||
    /[%\\]/.test(pathname!) ||
    path.includes('#') ||
    path
      .split('?')[0]
      ?.split('/')
      .some((p) => p === '.' || p === '..')
  )
    throw new Error('Route is outside the public catalog allow-list');
  const params = new URLSearchParams(query);
  if (path.split('?').length > 2) throw new Error('Invalid catalog query');
  if (pathname === '/api/search-all') {
    const kind = params.get('kind');
    const allowedParams = [
      'q',
      'kind',
      'page',
      'per',
      'sort',
      'state',
      'party',
      'speaker',
      'from',
      'to',
    ];
    if (
      !kind ||
      !catalogKinds.includes(kind as CatalogKind) ||
      !params.get('q')?.trim() ||
      params.get('q')!.length > 2000 ||
      ['page', 'per'].some(
        (key) => params.has(key) && !/^[1-9]\d*$/.test(params.get(key)!),
      ) ||
      (params.has('per') && Number(params.get('per')) > 200) ||
      [...params.keys()].some(
        (key) =>
          !allowedParams.includes(key) || params.getAll(key).length !== 1,
      )
    )
      throw new Error(
        'Search requires one explicit non-bill catalog kind and a query',
      );
    return;
  }
  if (path.includes('?'))
    throw new Error('Static catalogs do not accept queries');
  if (
    pathname === '/api/person-slugs' ||
    pathname === editionPath ||
    staticPaths.has(pathname!) ||
    releasePath.test(pathname!) ||
    billPath.test(pathname!) ||
    interestPath.test(pathname!)
  )
    return;
  throw new Error('Route is outside the public catalog allow-list');
}

export function allowedURL(origin: string, path: string): string {
  assertAllowedPath(path);
  const base = new URL(origin);
  if (
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  )
    throw new Error('Invalid API origin');
  const url = new URL(path, origin);
  if (url.origin !== base.origin)
    throw new Error('Cross-origin API requests are forbidden');
  return url.toString();
}
