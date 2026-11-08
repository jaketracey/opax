/** The resolver contains no presentation or group policy. */
import type { WebPathResolver } from './types';
import { exploreFromWebPath, exploreRoute } from '../routes/explore';

/**
 * The retired report screens' own app links (09a6b7afe removed them):
 * `opax:///reports` and `opax://report/<slug>` open Explore rather than
 * an unmatched route. The website's `/reports/<slug>` stays a web page.
 */
const legacyReport = /^\/(?:reports\/?|report\/[^/?#]+\/?)(?:\?[^#]*)?$/;
export const explorePaths = [
  (path) => (legacyReport.test(path) ? exploreRoute : null),
  (path) => {
    return exploreFromWebPath(path);
  },
] satisfies WebPathResolver[];
