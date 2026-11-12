import type { OfficialReport } from '../../api/report-decoders';
import { Group } from '../../design/primitives';
import { formatDate } from '../../design/format';
import { presentSource } from '../../navigation/sheets';
import { Link, Text } from './report-ui';

/** The same native source sheet and evidence, on the report's theme surface. */
export function ReportProvenance({ report }: { report: OfficialReport }) {
  return (
    <Group testID="report-provenance">
      <Text variant="secondary">{`Record snapshot: ${formatDate(report.snapshot_at)}`}</Text>
      <Link
        title={`Sources and caveats: ${report.body}`}
        onPress={() =>
          presentSource(
            {
              dateRole: 'recorded',
              asOf: report.snapshot_at,
              citation: [report.body],
              originals: [
                {
                  label: report.body,
                  url: report.citation.url,
                  record: report.citation.document,
                },
              ],
              notes: report.caveats,
            },
            { testID: 'report-provenance' },
          )
        }
      />
    </Group>
  );
}
