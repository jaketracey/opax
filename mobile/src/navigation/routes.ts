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
): ReturnType<typeof personRoute> | ReturnType<typeof billRoute> | ReturnType<typeof directoryRoute> | ReturnType<typeof electorateRoute> | typeof divisionHistoryRoute | null {
  const directory = /^\/subject\/(person|party|electorate)\/?$/.exec(path);
  if (directory?.[1]) return directoryRoute(directory[1] as 'person' | 'party' | 'electorate');
  if (path === '/bills?view=divisions') return divisionHistoryRoute;
  const electorate = /^\/subject\/electorate\/([a-z0-9-]+|el_[a-f0-9]{24})(?:\?asof=(\d{4}-\d{2}-\d{2}))?$/.exec(path);
  if (electorate?.[1]) {
    const asof = electorate[2];
    if (asof && (!Number.isFinite(Date.parse(asof)) || new Date(asof).toISOString().slice(0, 10) !== asof)) return null;
    return electorateRoute(electorate[1], asof);
  }
  const match = /^\/subject\/person\/([a-z0-9-]+)\/?$/.exec(path);
  if (match?.[1]) return personRoute(match[1]);
  const bill = /^\/bill\/([a-z0-9-]+)\/?$/.exec(path);
  return bill?.[1] ? billRoute(bill[1]) : null;
}
// Reserved Talk sheet presentation seam; no permission or transport is installed.
export const voiceSlot = { enabled: false, module: 'src/voice' } as const;

export const electorateRoute = (id: string, asof?: string) => ({
  pathname: '/electorate/[id]' as const,
  params: { id, ...(asof ? { asof } : {}) },
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
export const directoryRoute = (kind: 'person' | 'party' | 'electorate') => ({
  pathname: '/directory' as const,
  params: { kind },
});
export const divisionHistoryRoute = { pathname: '/division-history' as const };
