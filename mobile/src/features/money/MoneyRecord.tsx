import type { RecordResult } from '../../api/client';
import {
  AsAtLine,
  Group,
  OfflineBanner,
  StaleNotice,
} from '../../design/primitives';
import { moneyDecodeLoss, type MoneyGraph } from './data';
import { moneyCaveats, moneySource } from './records';
import { disclosureYearNote } from '../../design/format';

export function MoneyRecordStatus({
  record,
}: {
  record: RecordResult<MoneyGraph>;
}) {
  return record.stale ? (
    <Group>
      <OfflineBanner />
      <StaleNotice savedAt={record.savedAt} testID="money-stale" />
    </Group>
  ) : null;
}
/** Methodology stays available in full, behind the section's info button. */
export function moneyNotes(graph: MoneyGraph): string[] {
  return [
    ...moneyCaveats(graph).filter((note) => !note.startsWith('Source:')),
    disclosureYearNote,
    'Disclosed donations, largest first. Public grants and contracts are recorded separately in each donor’s record.',
    'On the map for the public money it holds, not for the size of its donations. These public-money records have no donation rank.',
    'Position is the category cluster, colour the category, size the connectedness, and depth fades through fog.',
    'Drag with one finger to orbit, pinch to zoom, tap a node for its record. The list gives the same recorded figures.',
    ...(Object.values(moneyDecodeLoss(graph)).some((n) => n > 0)
      ? [
          'Some records could not be read and are omitted. Displayed relationships may be incomplete.',
        ]
      : []),
  ];
}
/** One quiet, source-dated caption; terms live in Sources and licences. */
export function MoneyAttribution({
  record,
}: {
  record: RecordResult<MoneyGraph>;
}) {
  return (
    <AsAtLine
      asOf={record.asOf}
      savedAt={record.stale ? record.savedAt : null}
      citation={moneySource(record.data).citation}
      testID="money-as-at"
    />
  );
}
