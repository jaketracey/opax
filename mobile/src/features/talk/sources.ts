import { fromWebPath, electorateRoute } from '../../navigation/routes';
import { webPageUrl } from '../../navigation/external';

export function recordDestination(path: string) {
  // Recheck at the navigation boundary, including queries and fragments.
  if (!webPageUrl(path)) return null;
  const native = fromWebPath(path);
  if (native?.pathname === '/person/[slug]' || native?.pathname === '/bill/[key]') return native;
  // This sheet embeds only these readers; other native screens use their own stack.
  const electorate = /^\/subject\/electorate\/([a-z0-9-]+)\/?$/.exec(path);
  return electorate?.[1] ? electorateRoute(electorate[1]) : null;
}
