import type { WebPathResolver } from './types';
import { moneyFromWebPath } from '../../features/money-public/routes';

// One mapping for the group's web paths: the money lane's resolver, built
// on the route builders in routes/public-money.ts.
export const publicMoneyPaths = [
  (path) => moneyFromWebPath(path),
] satisfies WebPathResolver[];
