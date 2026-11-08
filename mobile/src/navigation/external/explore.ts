import type { WebPathResolver } from './types';
import { exploreFromWebPath } from '../routes/explore';
export const explorePaths = [
  (path) => {
    return exploreFromWebPath(path);
  },
] satisfies WebPathResolver[];
