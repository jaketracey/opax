import type { WebPathResolver } from './types';
import {
  leadsRoute,
  moneyRecordRoute,
  grantProgramRoute,
  largestGrantsRoute,
  grantsRoute,
  agenciesRoute,
  agencyRoute,
  connectionsRoute,
} from '../routes/public-money';
export const publicMoneyPaths = [
  (path) => {
    const u = new URL(path, 'https://opax.invalid');
    const p = u.searchParams;
    if (/^\/discover\/?$/.test(u.pathname))
      return { ...leadsRoute, params: Object.fromEntries(p) };
    if (/^\/money\/grants\/?$/.test(u.pathname)) {
      if (p.has('open')) return null;
      const jur = p.get('jur') === 'qld' ? 'qld' : 'federal';
      if (p.has('program')) return grantProgramRoute(p.get('program')!, jur);
      if (p.has('largest')) return largestGrantsRoute(p.get('largest')!);
      return grantsRoute({ jur, view: p.get('view') ?? 'programs' });
    }
    if (/^\/subject\/agency\/?$/.test(u.pathname)) return agenciesRoute;
    const agency = /^\/subject\/agency\/([^/]+)\/?$/.exec(u.pathname);
    if (agency?.[1]) return agencyRoute(decodeURIComponent(agency[1]));
    if (/^\/connections\/?$/.test(u.pathname)) return connectionsRoute;
    const money =
      /^\/subject\/(donor|supplier|recipient|campaigner)\/([^/]+)\/?$/.exec(
        u.pathname,
      );
    if (money?.[2])
      return moneyRecordRoute({
        rid: decodeURIComponent(money[2]),
        jur: p.get('jur') ?? 'federal',
      });
    return null;
  },
] satisfies WebPathResolver[];
