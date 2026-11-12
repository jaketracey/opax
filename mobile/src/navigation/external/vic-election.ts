import { isE2E } from '../../design/environment';
import { slugPattern } from '../../features/vic-election/decoders';
import { vicElectionRoute, vicSeatRoute } from '../routes/vic-election';
import type { WebPathResolver } from './types';
export const vicElectionPaths = [
  (path) => {
    const u = new URL(path, 'https://opax.invalid');
    if (/^\/(?:vic-election|vic-election-2026)\/?$/.test(u.pathname)) {
      const route = vicElectionRoute(
        u.searchParams.get('place') ?? u.searchParams.get('q') ?? undefined,
      );
      return {
        ...route,
        params: {
          ...route.params,
          ...(isE2E && u.searchParams.has('fixture')
            ? { fixture: u.searchParams.get('fixture')! }
            : {}),
        },
      };
    }
    const match = /^\/(?:vic-election|vic-election-2026)\/([^/]+)$/.exec(
      u.pathname,
    );
    return match && slugPattern.test(match[1]!)
      ? vicSeatRoute(match[1]!)
      : null;
  },
] satisfies WebPathResolver[];
