import type { WebPathResolver } from './types';
import { communityFromWebPath } from '../../features/community/entry';
export const accountPaths = [
  (path) => {
    return communityFromWebPath(path);
  },
] satisfies WebPathResolver[];
