import { fromWebPath, electorateRoute } from '../../navigation/routes';
import { webPageUrl } from '../../navigation/external';

export function recordDestination(path: string) {
  // Recheck at the navigation boundary, including queries and fragments.
  if (!webPageUrl(path)) return null;
  const native = fromWebPath(path);
  // The embedded reader accepts entity records only. Directory links use
  // normal navigation outside this in-call reader.
  if (native?.pathname === '/bill/[key]' || native?.pathname === '/person/[slug]' || native?.pathname === '/electorate/[id]') return native;
  const electorate = /^\/subject\/electorate\/([a-z0-9-]+)\/?$/.exec(path);
  return electorate?.[1] ? electorateRoute(electorate[1]) : null;
}
