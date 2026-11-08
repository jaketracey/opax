import { View } from 'react-native';
import {
  BillRow,
  Disclosure,
  InlineError,
  SectionHeader,
  Skeleton,
  SourceLine,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { billRoute } from '../../navigation/routes/bills';
import type { BillIndex } from '../../api/catalog-decoders';
import type { RecordResult } from '../../api/client';

type Bill = BillIndex['bills'][number];
/** Bills introduced in the year, newest first; ties by title. */
export function yearBills(bills: readonly Bill[], year: number) {
  return bills
    .filter((b) => b.introduced?.startsWith(String(year)))
    .sort(
      (a, b) =>
        (b.introduced ?? '').localeCompare(a.introduced ?? '') ||
        a.title.localeCompare(b.title),
    );
}
function Row({ bill }: { bill: Bill }) {
  const title = bill.short_title || bill.title;
  return (
    <BillRow
      billKey={bill.key}
      title={title}
      status={bill.status}
      date={bill.introduced}
      dateLabel="Introduced"
      href={billRoute(bill.key, title)}
    />
  );
}

/** Three bills introduced in the year, the rest one tap further. */
export function YearBills({
  year,
  read,
}: {
  year: number;
  read: {
    record: RecordResult<BillIndex> | null;
    error: unknown;
    retry: () => void;
  };
}) {
  if (!read.record)
    return read.error ? (
      <View style={{ gap: rhythm.block }}>
        <SectionHeader title="Bills" />
        <InlineError
          subject="Bills"
          onRetry={read.retry}
          testID="tm-bills-error"
        />
      </View>
    ) : (
      <View style={{ gap: rhythm.block }}>
        <SectionHeader title="Bills" />
        <Skeleton shape="bills" count={3} label="Loading bills" />
      </View>
    );
  const bills = yearBills(read.record.data.bills, year);
  if (!bills.length) return null;
  return (
    <View style={{ gap: rhythm.block }}>
      <SectionHeader title="Bills" />
      <View testID="tm-bills">
        {bills.slice(0, 3).map((b) => (
          <Row key={b.key} bill={b} />
        ))}
        {bills.length > 3 ? (
          <Disclosure label={`${bills.length - 3} more bills`}>
            {() => (
              <View>
                {bills.slice(3).map((b) => (
                  <Row key={b.key} bill={b} />
                ))}
              </View>
            )}
          </Disclosure>
        ) : null}
      </View>
      <SourceLine
        asOf={read.record.asOf}
        savedAt={read.record.stale ? read.record.savedAt : null}
        citation="ParlInfo"
        originals={[
          {
            label: 'ParlInfo',
            url: 'https://parlinfo.aph.gov.au/',
            record: 'bills and legislation',
          },
        ]}
        testID="tm-bill-register"
      />
    </View>
  );
}
