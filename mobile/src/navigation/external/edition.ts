import type { WebPathResolver } from './types';
import { editionRoute } from '../routes/edition';
export const editionPaths = [
  (path) => {
    const u = new URL(path, 'https://opax.invalid');
    // An id is retained for incoming links; the API currently publishes only latest.
    return /^\/edition\/?$/.test(u.pathname)
      ? editionRoute(u.searchParams.get('id') ?? undefined)
      : null;
  },
] satisfies WebPathResolver[];
