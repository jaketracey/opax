import type { WebPathResolver } from './types';
import {
  billRoute,
  billListRoute,
  divisionHistoryRoute,
} from '../routes/bills';
export const billsPaths = [
  (path) => {
    const u = new URL(path, 'https://opax.invalid');
    if (u.pathname === '/bills' && u.searchParams.get('view') === 'divisions')
      return divisionHistoryRoute;
    if (/^\/(bills|bill-list)\/?$/.test(u.pathname))
      return billListRoute(Object.fromEntries(u.searchParams));
    const m = /^\/bill\/([a-z0-9-]+)\/?$/.exec(u.pathname);
    if (!m?.[1] || u.hash) return null;
    const section = u.searchParams.get('section');
    return billRoute(m[1], undefined, {
      ...(u.searchParams.has('division')
        ? { division: u.searchParams.get('division')! }
        : {}),
      ...(['divisions', 'changes'].includes(section ?? '')
        ? { section: section as 'divisions' | 'changes' }
        : {}),
    });
  },
] satisfies WebPathResolver[];
