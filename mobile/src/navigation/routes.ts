import { communityFromWebPath } from '../features/community/routes';
import { moneyFromWebPath } from '../features/money-public/routes';
import { startPartyTiming } from '../features/people/party-timing';
import { partySlug } from '../design/party';
import { webOrigin } from '../design/environment';
import { assertAllowedPath } from '../api/policy';
import { isMoreKind } from '../features/search/contracts';
import { isRecordSlug } from '../api/record-policy';
export const expenseGlossaryRoute = {
  pathname: '/expense-glossary' as const,
  params: {},
};
export const docRoute = (slug: string) => ({
  pathname: '/doc/[slug]' as const,
  params: { slug },
});
export const citeRoute = (slug: string) => ({
  pathname: '/doc-cite/[slug]' as const,
  params: { slug },
});
export const billTextRoute = (key: string, version?: string) => ({
  pathname: '/bill-text/[key]' as const,
  params: { key, ...(version ? { version } : {}) },
});
export const recentRecordsRoute = {
  pathname: '/recent-records' as const,
  params: {},
};
export const personRoute = (slug: string) => ({
  pathname: '/person/[slug]' as const,
  params: { slug },
});
export const billRoute = (key: string, section?: 'divisions') => ({
  pathname: '/bill/[key]' as const,
  params: { key, ...(section ? { section } : {}) },
});
// Alignment only. Associated Domains and native universal-link handling belong to a later lane.
export function fromWebPath(
  path: string,
):
  | ReturnType<typeof communityFromWebPath>
  | ReturnType<typeof personRoute>
  | ReturnType<typeof billRoute>
  | ReturnType<typeof directoryRoute>
  | typeof divisionHistoryRoute
  | ReturnType<typeof electorateRoute>
  | ReturnType<typeof partyRoute>
  | ReturnType<typeof askRoute>
  | { pathname: '/search'; params: Record<string, string> }
  | ReturnType<typeof docRoute>
  | ReturnType<typeof billTextRoute>
  | ReturnType<typeof moneyRoute>
  | typeof recentRecordsRoute
  | typeof expenseGlossaryRoute
  | ReturnType<typeof reportRoute>
  | ReturnType<typeof topicRoute>
  | { pathname: '/reports' | '/topics' | '/stats' | '/methods' }
  | ReturnType<typeof moneyFromWebPath> {
  const community = communityFromWebPath(path);
  if (community) return community;
  const money = moneyFromWebPath(path);
  if (money) return money;
  if (path === '/money' || path === '/money/') return moneyRoute();
  const directory = /^\/subject\/(person|party|electorate)\/?$/.exec(path);
  if (directory?.[1]) return directoryRoute(directory[1] as 'person' | 'party' | 'electorate');
  if (path === '/bills?view=divisions') return divisionHistoryRoute;
  if (path === '/reports') return {pathname:'/reports'};
  if (path === '/subject/topic') return {pathname:'/topics'};
  if (path === '/stats' || path === '/methods') return {pathname:path};
  const report = /^\/reports\/(climate|gambling|housing|immigration|indigenous|media)(?:\/s\/([1-9]\d*))?\/?$/.exec(path);
  if (report?.[1]) return reportRoute(report[1], report[2]);
  const topic = /^\/subject\/topic\/([a-z0-9-]+)\/?$/.exec(path.split('?')[0]!);
  if (topic?.[1]) {
    const query = new URLSearchParams(path.split('?')[1]);
    const keys = ['party', 'state', 'from', 'to', 'debate'];
    if ([...query.keys()].some(key => !keys.includes(key) || query.getAll(key).length !== 1)) return null;
    return topicRoute(topic[1], Object.fromEntries(query));
  }
  if (path === '/expenses' || path === '/expenses/')
    return expenseGlossaryRoute;
  const search = searchRouteFromWebPath(path);
  if (search) return search;
  if (/^\/ask(?:\?|\/?$)/.test(path)) {
    const url = new URL(path, webOrigin);
    if (url.pathname === '/ask' && !url.searchParams.has('view'))
      return askRoute({
        question: url.searchParams.get('q') || '',
        ...Object.fromEntries(
          ['speaker', 'party', 'state', 'topic', 'from', 'to', 'kind'].flatMap(
            (k) =>
              url.searchParams.has(k) ? [[k, url.searchParams.get(k)!]] : [],
          ),
        ),
      });
    return null;
  }
  const electorate = /^\/subject\/electorate\/([a-z0-9-]+|el_[a-f0-9]{24})\/?(?:\?asof=(\d{4}-\d{2}-\d{2}))?$/.exec(path);
  if (electorate?.[1]) {
    const asof = electorate[2];
    if (asof && (!Number.isFinite(Date.parse(asof)) || new Date(asof).toISOString().slice(0, 10) !== asof)) return null;
    return electorateRoute(electorate[1], asof);
  }
  const party = /^\/subject\/party\/([^/?#]+)\/?$/.exec(path);
  if (party?.[1]) {
    try {
      return partyRoute(decodeURIComponent(party[1]));
    } catch {
      return null;
    }
  }
  // The web also accepts legacy #/doc links. Keep unsafe/query-bearing paths
  // out of this resolver; external.ts checks the complete URL first.
  const document = /^(?:#)?\/doc\/([a-z0-9-]+)\/?$/.exec(path);
  if (document?.[1] && isRecordSlug(document[1])) return docRoute(document[1]);
  if (path === '/#hp-indexed-title' || path === '/#mod-added')
    return recentRecordsRoute;
  const text =
    /^\/bill\/(au-federal-[a-z0-9-]+)(?:\?text-version=([rs]\d+-[a-z0-9-]+))?#bill-full-text$/.exec(
      path,
    );
  if (text?.[1]) return billTextRoute(text[1], text[2]);
  const match = /^\/subject\/person\/([a-z0-9-]+)\/?$/.exec(path);
  if (match?.[1]) return personRoute(match[1]);
  const bill = /^\/bill\/([a-z0-9-]+)\/?$/.exec(path);
  return bill?.[1] ? billRoute(bill[1]) : null;
}

/** A shared search opens a draft. Mounting this route never submits it. */
export function searchRouteFromWebPath(
  path: string,
): { pathname: '/search'; params: Record<string, string> } | null {
  const [pathname, query] = path.split('?');
  if (
    pathname !== '/ask' ||
    !query ||
    path.split('?').length !== 2 ||
    path.includes('#')
  )
    return null;
  const p = new URLSearchParams(query);
  if (p.get('view') !== 'search' || p.getAll('view').length !== 1) return null;
  p.delete('view');
  if (!p.get('q') && p.get('speaker')) p.set('q', p.get('speaker')!);
  if (!p.get('kind')) p.set('kind', 'all');
  try {
    assertAllowedPath(
      `${isMoreKind(p.get('kind')!) ? '/api/search-all' : '/api/search'}?${p}`,
    );
  } catch {
    return null;
  }
  return { pathname: '/search', params: Object.fromEntries(p) };
}
// Talk is shipped when the production voice build switch is enabled.
export const voiceSlot = { enabled: true, module: 'src/voice' } as const;

export const electorateRoute = (id: string, asof?: string) => ({
  pathname: '/electorate/[id]' as const,
  params: { id, ...(asof ? { asof } : {}) },
});

export const partyRoute = (name: string) => {
  startPartyTiming();
  return {
    pathname: '/party/[slug]' as const,
    params: { slug: partySlug(name), name },
  };
};
// Leads and the declared-interests feed (P1), opened from Today.
export const leadsRoute = { pathname: '/leads' as const };
export const leadRoute = (id: string) => ({
  pathname: '/lead/[id]' as const,
  params: { id },
});
export const declarationsRoute = { pathname: '/declarations' as const };
// Local follows: the list and its management, pushed within the current tab.
export const followsRoute = '/follows';
export const reportRoute = (slug: string, section?: string) => ({
  pathname: '/report/[slug]' as const, params: {slug, ...(section ? {section} : {})},
});
export const topicRoute = (slug: string, filters: Record<string,string> = {}) => ({pathname: '/topic/[slug]' as const, params: {slug, ...filters}});

/** A draft in native Ask. Arrival never submits a paid request. */
export const askRoute = (scope: {
  question: string;
  speaker?: string;
  party?: string;
  state?: string;
  topic?: string;
  from?: string;
  to?: string;
  kind?: string;
}) => ({
  pathname: '/(tabs)/(ask)/ask' as const,
  params: {
    ...scope,
    entry: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  },
});
export const moneyRoute = (party?: string | null, jurisdiction = 'federal') => {
  const state = ['qld', 'vic', 'tas'].find(
    (key) => jurisdiction === key || jurisdiction === `au-${key}`,
  );
  const params = {
    ...(party ? { focus: `party:${party}` } : {}),
    ...(state ? { jurisdiction: state } : {}),
  };
  return {
    pathname: '/money' as const,
    ...(Object.keys(params).length ? { params } : {}),
  };
};

export const directoryRoute = (kind: 'person' | 'party' | 'electorate') => ({
  pathname: '/directory' as const,
  params: { kind },
});
export const divisionHistoryRoute = { pathname: '/division-history' as const };
