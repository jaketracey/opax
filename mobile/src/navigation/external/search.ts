import type { WebPathResolver } from './types';
import {
  searchRouteFromWebPath,
  topicRoute,
  topicsRoute,
} from '../routes/search';
export const searchPaths = [
  (path) => {
    const search = searchRouteFromWebPath(path);
    if (search) return search;
    if (path === '/subject/topic') return topicsRoute;
    const m = /^\/subject\/topic\/([a-z0-9-]+)\/?$/.exec(path.split('?')[0]!);
    if (m?.[1]) {
      const q = new URLSearchParams(path.split('?')[1]);
      if (
        [...q.keys()].some(
          (k) =>
            !['party', 'state', 'from', 'to', 'debate'].includes(k) ||
            q.getAll(k).length !== 1,
        )
      )
        return null;
      return topicRoute(m[1], Object.fromEntries(q));
    }
    return null;
  },
] satisfies WebPathResolver[];
