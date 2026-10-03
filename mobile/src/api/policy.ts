// Public, catalog-only GETs. Adding a path requires a source/cost review and test.
export const catalogKinds = ['person', 'interest', 'pay', 'expense'] as const;
export type CatalogKind = (typeof catalogKinds)[number];
const staticPaths = new Set([
  '/parliamentarians.json',
  '/electorates/manifest.json',
  '/bills/index.json',
]);
const releasePath =
  /^\/electorates\/releases\/[a-f0-9]{16}\/(?:index|people|el_[a-f0-9]{24})\.json$/;
const billPath = /^\/bills\/au-federal-[rs]\d+\.json$/;

export function assertAllowedPath(path: string): void {
  const [pathname, query] = path.split('?');
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
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
      'topic',
      'from',
      'to',
    ];
    if (
      !kind ||
      !catalogKinds.includes(kind as CatalogKind) ||
      !params.get('q')?.trim() ||
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
  if (query) throw new Error('Static catalogs do not accept queries');
  if (
    pathname === '/api/person-slugs' ||
    staticPaths.has(pathname!) ||
    releasePath.test(pathname!) ||
    billPath.test(pathname!)
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
