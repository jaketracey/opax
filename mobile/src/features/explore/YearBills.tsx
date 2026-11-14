import { useState } from 'react';
import { View } from 'react-native';
import {
  BillRow,
  Disclosure,
  InlineError,
  LinkRow,
  SectionHeader,
  Skeleton,
  SourceLine,
  Text,
} from '../../design/primitives';
import { counted } from '../../design/format';
import { billEnding, billStatusLabel } from '../../api/bill-status';
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
      status={billStatusLabel(bill.status, billEnding(bill))}
      rawStatus={bill.status}
      date={bill.introduced}
      dateLabel="Introduced"
      href={billRoute(bill.key, title)}
    />
  );
}

const PAGE_SIZE = 20;

/** Only the selected page mounts inside the outer scrolling screen. */
function RemainingBills({ bills }: { bills: Bill[] }) {
  const [page, setPage] = useState(0);
  const start = page * PAGE_SIZE;
  const shown = bills.slice(start, start + PAGE_SIZE);
  const nextCount = Math.min(PAGE_SIZE, bills.length - start - shown.length);
  return (
    <View>
      {bills.length > PAGE_SIZE ? (
        <Text variant="footnote" wordSafe>
          {`Bills ${start + 4} to ${start + shown.length + 3} of ${bills.length + 3}`}
        </Text>
      ) : null}
      {page > 0 ? (
        <LinkRow
          title={`Previous ${counted(PAGE_SIZE, 'bill')}`}
          onPress={() => setPage((current) => current - 1)}
          accessory="none"
          testID="tm-bills-previous"
        />
      ) : null}
      {nextCount > 0 ? (
        <LinkRow
          title={`Next ${counted(nextCount, 'bill')}`}
          onPress={() => setPage((current) => current + 1)}
          accessory="none"
          testID="tm-bills-next"
        />
      ) : null}
      {shown.map((bill) => (
        <Row key={bill.key} bill={bill} />
      ))}
    </View>
  );
}

/** Three bills introduced in the year, the rest in bounded pages on disclosure. */
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
          <Disclosure
            label={counted(bills.length - 3, 'more bill', 'more bills')}
          >
            {() => <RemainingBills key={year} bills={bills.slice(3)} />}
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
