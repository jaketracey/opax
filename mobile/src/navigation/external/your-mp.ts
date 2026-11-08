import type { WebPathResolver } from './types';
import {
  electorateRoute,
  membersRoute,
  electionRoute,
  yourMPRoute,
} from '../routes/your-mp';
export const yourMpPaths = [
  (path) => {
    const u = new URL(path, 'https://opax.invalid');
    if (u.pathname === '/your-mp') return yourMPRoute;
    const el = /^\/subject\/electorate\/([a-z0-9_-]+)\/?$/.exec(u.pathname);
    if (el?.[1]) {
      const asof = u.searchParams.get('asof');
      if (
        asof &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(asof) ||
          !Number.isFinite(Date.parse(asof)) ||
          new Date(asof).toISOString().slice(0, 10) !== asof)
      )
        return null;
      return electorateRoute(el[1], asof ?? undefined);
    }
    const members = /^\/members\/([^/]+)$/.exec(u.pathname);
    if (members?.[1]) return membersRoute(members[1]);
    if (u.pathname === '/members' && u.searchParams.has('seat'))
      return membersRoute(u.searchParams.get('seat')!);
    if (
      u.pathname === '/election' &&
      u.searchParams.has('seat') &&
      u.searchParams.has('key')
    )
      return electionRoute(
        u.searchParams.get('seat')!,
        u.searchParams.get('key')!,
      );
    return null;
  },
] satisfies WebPathResolver[];
