import { partySlug } from '../design/party';
import { webOrigin } from '../design/environment';
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
  | ReturnType<typeof personRoute>
  | ReturnType<typeof billRoute>
  | ReturnType<typeof electorateRoute>
  | ReturnType<typeof partyRoute>
  | ReturnType<typeof askRoute>
  | null {
  if (/^\/ask(?:\?|\/?$)/.test(path)) {
    const url = new URL(path, webOrigin);
    if (
      url.pathname === '/ask' &&
      !url.searchParams.has('view') &&
      url.searchParams.get('q')
    )
      return askRoute({
        question: url.searchParams.get('q')!,
        ...Object.fromEntries(
          ['speaker', 'party', 'state', 'topic', 'from', 'to', 'kind'].flatMap(
            (k) =>
              url.searchParams.has(k) ? [[k, url.searchParams.get(k)!]] : [],
          ),
        ),
      });
    return null;
  }
  const electorate = /^\/subject\/electorate\/([a-z0-9-]+)\/?$/.exec(path);
  if (electorate?.[1]) return electorateRoute(electorate[1]);
  const party = /^\/subject\/party\/([^/?#]+)\/?$/.exec(path);
  if (party?.[1]) {
    try {
      return partyRoute(decodeURIComponent(party[1]));
    } catch {
      return null;
    }
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
