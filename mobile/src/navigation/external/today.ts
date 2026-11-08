import type { WebPathResolver } from './types';
import { todayRoute, todayFollowsRoute } from '../routes/today';
export const todayPaths = [
  (path) => {
    return /^\/today\/?$/.test(path)
      ? todayRoute()
      : /^\/follows\/?(?:\?edit=1)?$/.test(path)
        ? {
            ...todayFollowsRoute,
            params: path.includes('?') ? { edit: '1' } : {},
          }
        : null;
  },
] satisfies WebPathResolver[];
