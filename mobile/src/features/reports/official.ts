import type { ApiClient, RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';
import { isReportSlug } from '../../api/official-report-policy';
import { decodeReport, type OfficialReport } from '../../api/report-decoders';
import { ReadSession } from '../../api/read-session';
import { recordClient } from '../../api/runtime';

export class OfficialReports {
  private session = new ReadSession<RecordResult<OfficialReport>>(32);
  constructor(private client: Pick<ApiClient, 'get'>) {}
  read(slug: string, signal?: AbortSignal) {
    if (!isReportSlug(slug))
      return Promise.reject(
        new ApiError('not-found', 'This report is not available.'),
      );
    return this.session.read(
      `/api/report/${slug}`,
      (requestSignal) =>
        this.client.get(
          `/api/report/${slug}`,
          (value) => {
            const report = decodeReport(value);
            if (report.slug !== slug)
              throw new ApiError(
                'invalid-data',
                'The report identity does not match.',
              );
            return report;
          },
          false,
          { signal: requestSignal, retries: 0 },
        ),
      { signal },
    );
  }
}
export const officialReports = new OfficialReports(recordClient);
