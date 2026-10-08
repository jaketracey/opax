import { isPeoplePaidPath } from '../features/people/policy';
import { isPortraitPath } from './portrait-policy';
import { allowsReportsPath } from './reports-policy';
import {
  documentKinds,
  moreCatalogKinds,
  jurisdictions,
  topics,
  sorts,
} from '../features/search/contracts';
import {
  isRecordSlug,
  billTextPathPattern,
  isSimilarRequest,
} from './record-policy';
// Public GETs; paid search and briefs require an explicit action in the UI.
// Adding a path requires a source/cost review and test.
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
  // Leads (P1): the static discovery export, 60 signals with their caveats.
  '/discovery.json',
  '/graph/grants.federal.json',
  '/graph/grants.qld.json',
  '/grants/program-notes.json',
  '/social/grants-largest.json',
  '/agencies.json',
  '/reports/grants-allocation.json',
  '/research/mlci.json',
  '/research/grants-history.json',
  '/research/grant-locations.json',
  '/evidence/index.json',

  '/access.json',
  '/search-catalog/manifest.json',
  '/reports/index.json',
  // Reviewed immutable state graph exports for the native money map: no Worker/model/auth request.
  '/graph/money.qld.json',
  '/graph/money.vic.json',
  '/graph/money.tas.json',
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
const interestPath = /^\/interests\/(?:\d+|aph_\d+|n-[a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;

function assertSearchParams(p: URLSearchParams, summary = false) {
  const keys = [
    'q',
    'kind',
    'mode',
    'page',
    'per',
    'sort',
    'speaker',
    'party',
    'state',
    'topic',
    'from',
    'to',
    ...(summary ? ['stream'] : []),
  ];
  const name = /^[\p{L}\p{N} .,'’&()\/-]+$/u;
  if (
    !p.get('q')?.trim() ||
    p.get('q')!.length > 2000 ||
    [...p.keys()].some((k) => !keys.includes(k) || p.getAll(k).length !== 1) ||
    ['page', 'per'].some(
      (k) => p.has(k) && !/^[1-9]\d{0,3}$/.test(p.get(k)!),
    ) ||
    (p.has('per') && Number(p.get('per')) > 200) ||
    (p.has('mode') &&
      !['hybrid', 'semantic', 'keyword'].includes(p.get('mode')!)) ||
    (p.has('sort') && !sorts.some((s) => s.value === p.get('sort'))) ||
    (p.has('state') &&
      !jurisdictions.some((j) => j.value === p.get('state'))) ||
    (p.has('topic') && !Object.hasOwn(topics, p.get('topic')!)) ||
    ['from', 'to'].some(
      (k) =>
        p.has(k) &&
        (!/^\d{4}$/.test(p.get(k)!) ||
          Number(p.get(k)) < 1993 ||
          Number(p.get(k)) > 2026),
    ) ||
    ['speaker', 'party'].some(
      (k) => p.has(k) && (p.get(k)!.length > 200 || !name.test(p.get(k)!)),
    ) ||
    (p.has('from') &&
      p.has('to') &&
      Number(p.get('from')) > Number(p.get('to')))
  )
    throw new Error('Invalid explicit search parameters');
}

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
  if (allowsReportsPath(path)) return;
  if (isPeoplePaidPath(path)) return;
  // Build 7 Ask. POST admission is separate from the catalog GET client.
  if (pathname === '/api/ask' && query === 'stream=1') return;
  if (pathname === '/api/followups' && !path.includes('?')) return;
  // Explicitly opened readers and the related-speech button (build 7).
  if (pathname === '/api/search' && isSimilarRequest(params)) return;
  if (pathname === '/api/brief') {
    const ids = params.get('rids')?.split(',') ?? [];
    if (
      [...params.keys()].length !== 1 ||
      params.getAll('rids').length !== 1 ||
      !ids.length ||
      ids.length > 24 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !/^[a-f0-9]{32}$/.test(id))
    )
      throw new Error('Briefs require one batch of up to 24 resource IDs');
    return;
  }
  if (pathname === '/api/search' || pathname === '/api/search-summary') {
    const kind = params.get('kind') ?? '';
    if (
      !(documentKinds as readonly string[]).includes(kind) &&
      !(
        pathname === '/api/search-summary' &&
        (moreCatalogKinds as readonly string[]).includes(kind)
      )
    )
      throw new Error('Records search requires an explicit supported kind');
    assertSearchParams(params, pathname === '/api/search-summary');
    // This lane reviews the web's 20-row search pages. The records lane's
    // exact six-row related-speech contract is handled above.
    if (
      pathname === '/api/search' &&
      params.has('per') &&
      params.get('per') !== '20'
    )
      throw new Error('Records search requires the web page size');
    if (
      pathname === '/api/search-summary' &&
      (params.get('stream') !== '1' ||
        params.get('page') !== '1' ||
        params.get('per') !== '20' ||
        params.get('sort') !== 'relevance' ||
        kind === 'grant')
    )
      throw new Error(
        'Summary requires the web overview parameters and unfiltered public records',
      );
    return;
  }
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
      'mode',
      'topic',
    ];
    if (
      !kind ||
      !([...catalogKinds, ...moreCatalogKinds] as readonly string[]).includes(
        kind,
      ) ||
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
    assertSearchParams(params);
    return;
  }
  if (path.includes('?'))
    throw new Error('Static catalogs do not accept queries');
  if (
    pathname === '/api/person-slugs' ||
    pathname === editionPath ||
    pathname === '/api/recent' ||
    (pathname?.startsWith('/api/resource/') &&
      isRecordSlug(pathname.slice(14))) ||
    billTextPathPattern.test(pathname!) ||
    staticPaths.has(pathname!) ||
    releasePath.test(pathname!) ||
    billPath.test(pathname!) ||
    interestPath.test(pathname!) ||
    /^\/grants\/(?:federal|qld)\/programs\/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\.json$/.test(pathname!) ||
    /^\/agencies\/a-[a-f0-9]{20}\.json$/.test(pathname!) ||
    /^\/evidence\/[a-f0-9]{2}\.json$/.test(pathname!) ||
    isPortraitPath(pathname!)
  )
    return;
  throw new Error('Route is outside the public catalog allow-list');
}

export function assertAskPostPath(path: string): void {
  if (path !== '/api/ask?stream=1' && path !== '/api/followups')
    throw new Error('Route is outside the Ask POST allow-list');
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
