import { partySlug } from '../design/party';
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
): ReturnType<typeof personRoute> | ReturnType<typeof billRoute> | ReturnType<typeof reportRoute> | ReturnType<typeof topicRoute> | {pathname:'/reports'|'/topics'|'/stats'|'/methods'} | null {
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
  const match = /^\/subject\/person\/([a-z0-9-]+)\/?$/.exec(path);
  if (match?.[1]) return personRoute(match[1]);
  const bill = /^\/bill\/([a-z0-9-]+)\/?$/.exec(path);
  return bill?.[1] ? billRoute(bill[1]) : null;
}
// Reserved Talk sheet presentation seam; no permission or transport is installed.
export const voiceSlot = { enabled: false, module: 'src/voice' } as const;

export const electorateRoute = (id: string) => ({
  pathname: '/electorate/[id]' as const,
  params: { id },
});

export const partyRoute = (name: string) => ({
  pathname: '/party/[slug]' as const,
  params: { slug: partySlug(name), name },
});
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
