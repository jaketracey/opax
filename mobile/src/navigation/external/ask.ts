import type { WebPathResolver } from './types';
import { askRoute } from '../routes/ask';
import { webOrigin } from '../../design/environment';
export const askPaths = [
  (path) => {
    const u = new URL(path, webOrigin);
    if (u.pathname !== '/ask' || u.searchParams.has('view')) return null;
    return askRoute({
      question: u.searchParams.get('q') || '',
      ...Object.fromEntries(
        ['speaker', 'party', 'state', 'topic', 'from', 'to', 'kind'].flatMap(
          (k) => (u.searchParams.has(k) ? [[k, u.searchParams.get(k)!]] : []),
        ),
      ),
    });
  },
] satisfies WebPathResolver[];
