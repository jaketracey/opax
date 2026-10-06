import type { RecordResult } from '../../api/client';
import {
  AsAtLine,
  Group,
  OfflineBanner,
  SourceLink,
  StaleNotice,
  Text,
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
export function MoneyAttribution({
  record,
  caveats = true,
}: {
  record: RecordResult<MoneyGraph>;
  caveats?: boolean;
}) {
  const source = moneySource(record.data);
  return (
    <Group>
      <AsAtLine
        asOf={record.asOf}
        savedAt={record.stale ? record.savedAt : null}
        citation={source.citation}
        licence={source.licence}
        testID="money-as-at"
      />
      <SourceLink
        citation={source.label}
        url={source.url}
        kind="register"
        testID="money-source"
      />
      <Text wordSafe variant="fine">
        {disclosureYearNote}
      </Text>
      {Object.values(moneyDecodeLoss(record.data)).some((n) => n > 0) ? (
        <Text wordSafe variant="fine">
          Some records could not be read and are omitted. Displayed
          relationships may be incomplete.
        </Text>
      ) : null}
      {caveats
        ? moneyCaveats(record.data).map((note) => (
            <Text key={note} wordSafe variant="fine">
              {note}
            </Text>
          ))
        : null}
    </Group>
  );
}
