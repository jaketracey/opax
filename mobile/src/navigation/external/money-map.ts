import type { WebPathResolver } from './types';
import { moneyRoute } from '../routes/money-map';
import { moneyRecordRoute } from '../routes/public-money';
export const moneyMapPaths = [
  (path) => {
    const u = new URL(path, 'https://opax.invalid');
    if (!/^\/money\/?$/.test(u.pathname)) return null;
    if (u.searchParams.has('node') || u.searchParams.has('rid'))
      return moneyRecordRoute(Object.fromEntries(u.searchParams));
    const base = moneyRoute(
      u.searchParams.get('party'),
      u.searchParams.get('jur') ?? 'federal',
    );
    const params = new URLSearchParams(u.searchParams);
    params.delete('party');
    params.delete('jur');
    const filters = { ...base.params, ...Object.fromEntries(params) };
    return {
      pathname: base.pathname,
      ...(Object.keys(filters).length ? { params: filters } : {}),
    };
  },
] satisfies WebPathResolver[];
