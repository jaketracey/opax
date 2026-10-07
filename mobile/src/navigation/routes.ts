import { partySlug } from '../design/party';
import { isRecordSlug } from '../api/record-policy';
export const docRoute = (slug: string) => ({ pathname: '/doc/[slug]' as const, params: { slug } });
export const citeRoute = (slug: string) => ({ pathname: '/doc-cite/[slug]' as const, params: { slug } });
export const billTextRoute = (key: string, version?: string) => ({ pathname: '/bill-text/[key]' as const, params: { key, ...(version ? { version } : {}) } });
export const recentRecordsRoute = { pathname: '/recent-records' as const, params: {} };
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
): ReturnType<typeof personRoute> | ReturnType<typeof billRoute> | ReturnType<typeof docRoute> | ReturnType<typeof billTextRoute> | typeof recentRecordsRoute | null {
  // The web also accepts legacy #/doc links. Keep unsafe/query-bearing paths
  // out of this resolver; external.ts checks the complete URL first.
  const document = /^(?:#)?\/doc\/([a-z0-9-]+)\/?$/.exec(path);
  if (document?.[1] && isRecordSlug(document[1])) return docRoute(document[1]);
  if (path === '/#hp-indexed-title' || path === '/#mod-added') return recentRecordsRoute;
  const text = /^\/bill\/(au-federal-[a-z0-9-]+)(?:\?text-version=([rs]\d+-[a-z0-9-]+))?#bill-full-text$/.exec(path);
  if (text?.[1]) return billTextRoute(text[1], text[2]);
  const match = /^\/subject\/person\/([a-z0-9-]+)\/?$/.exec(path);
  if (match?.[1]) return personRoute(match[1]);
  const bill = /^\/bill\/([a-z0-9-]+)\/?$/.exec(path);
  return bill?.[1] ? billRoute(bill[1]) : null;
}
// Talk is shipped when the production voice build switch is enabled.
export const voiceSlot = { enabled: true, module: 'src/voice' } as const;

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
