import type { WebPathResolver } from './types';
import { isRecordSlug } from '../../api/record-policy';
import { docRoute, billTextRoute, recentRecordsRoute } from '../routes/records';
export const recordsPaths = [
  (path) => {
    if (path === '/#hp-indexed-title' || path === '/#mod-added')
      return recentRecordsRoute;
    const document = /^(?:#)?\/doc\/([a-z0-9-]+)\/?$/.exec(path);
    if (document?.[1] && isRecordSlug(document[1]))
      return docRoute(document[1]);
    const text =
      /^\/bill\/(au-federal-[a-z0-9-]+)(?:\?text-version=([rs]\d+-[a-z0-9-]+))?#bill-full-text$/.exec(
        path,
      );
    if (text?.[1]) return billTextRoute(text[1], text[2]);
    return null;
  },
] satisfies WebPathResolver[];
