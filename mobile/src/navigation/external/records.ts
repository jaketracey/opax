import type { WebPathResolver } from './types';
import { isRecordSlug } from '../../api/record-policy';
import {
  docRoute,
  billTextRoute,
  recentRecordsRoute,
  reportRoute,
} from '../routes/records';
import { isReportSlug } from '../../api/official-report-policy';
export const recordsPaths = [
  (path) => {
    const report = /^\/report\/([^/?#]+)\/?$/.exec(path);
    if (report?.[1] && isReportSlug(report[1])) return reportRoute(report[1]);
    if (path === '/#hp-indexed-title' || path === '/#mod-added')
      return recentRecordsRoute;
    const document = /^(?:#)?\/doc\/([a-z0-9-]+)\/?$/.exec(path);
    if (document?.[1] && isRecordSlug(document[1]))
      return docRoute(document[1]);
    // opax://doc-cite/<slug>: the record, then Citation formats over it, so
    // Done lands on the record, cold or warm (records.md 3.2).
    const cite = /^\/doc-cite\/([a-z0-9-]+)\/?$/.exec(path);
    if (cite?.[1] && isRecordSlug(cite[1]))
      return docRoute(cite[1], undefined, { cite: true });
    const text =
      /^\/bill\/(au-federal-[a-z0-9-]+)(?:\?text-version=([rs]\d+-[a-z0-9-]+))?#bill-full-text$/.exec(
        path,
      );
    if (text?.[1]) return billTextRoute(text[1], text[2]);
    return null;
  },
] satisfies WebPathResolver[];
