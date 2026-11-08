import type { WebPathResolver } from './types';
import { moneyRoute } from '../routes/money-map';
import { moneyRecordRoute } from '../routes/public-money';
export const moneyMapPaths = [
  (path) => {
    const u = new URL(path, 'https://opax.invalid');
    if (!/^\/money\/?$/.test(u.pathname)) return null;
    if (u.searchParams.has('node') || u.searchParams.has('rid'))
      return moneyRecordRoute(Object.fromEntries(u.searchParams));
    return {
      ...moneyRoute(
        u.searchParams.get('party'),
        u.searchParams.get('jur') ?? 'federal',
      ),
      params: Object.fromEntries(u.searchParams),
    };
  },
] satisfies WebPathResolver[];
