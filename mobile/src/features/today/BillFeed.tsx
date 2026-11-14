import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { RecentBillsKind } from '../../api/catalogs';
import type { recentBillsFor } from '../../api/selectors';
import { billName } from '../../api/bill-transforms';
import { catalogs } from '../../api/runtime';
import { SegmentedPicker } from '../../design/controls';
import { formatDate } from '../../design/format';
import { InsetGroup } from '../../design/layout';
import { billStatus } from '../../design/parliament';
import { BillRow } from '../../design/rows';
import { Skeleton } from '../../design/states';
import { rhythm } from '../../design/tokens';
import { billListRoute, billRoute } from '../../navigation/routes';
import { perfOnce } from '../../perf/probe';
import { partyFromCode } from '../bills/party-codes';
import { rowDate, statusEventText } from '../bills/status-event';
import { billsSources } from './sources';
import { blockState, reportOf, TodayBlock, useTodayRead } from './TodayBlock';

type Bill = NonNullable<ReturnType<typeof recentBillsFor>['data']>[number];

/** "JLN" as "Jacqui Lambie Network"; a recorded name as written. */
export const sponsorPartyName = (party: string | null | undefined) =>
  partyFromCode(party);

/**
 * What a Today bill row says. New: the status capsule and "Introduced {d MMM
 * yyyy}". Passed: no capsule (the segment says it), and the date of the
 * newest event: "Royal Assent {d MMM yyyy}" when the record names it, else
 * "Passed {d MMM yyyy}". The title is the short title; the meta line is
 * the portfolio, or the sponsor and their party for a private bill.
 */
export function billRowText(bill: Bill, kind: RecentBillsKind = 'new') {
  const status = billStatus(bill.status);
  const event =
    kind === 'new'
      ? bill.introduced
        ? { label: bill.introducedLabel, date: bill.introduced }
        : null
      : (() => {
          const e = rowDate(bill);
          if (!e) return null;
          return 'resolved' in e && !e.resolved ? { ...e, label: 'Passed' } : e;
        })();
  const name = billName(bill);
  const party = bill.portfolio ? null : sponsorPartyName(bill.sponsor_party);
  const meta = bill.portfolio
    ? { portfolio: `${bill.portfolio} portfolio` }
    : bill.sponsor
      ? { sponsor: bill.sponsor, party: party ?? null }
      : undefined;
  return {
    name,
    status,
    date: event ? statusEventText(event) : null,
    meta,
    label: [
      name,
      kind === 'new' ? status : null,
      event ? `${event.label} ${formatDate(event.date, 'long')}` : null,
      bill.portfolio
        ? `${bill.portfolio} portfolio`
        : [bill.sponsor, party].filter(Boolean).join(', ') || null,
    ]
      .filter(Boolean)
      .join(', '),
  };
}

/** Three compact previews; the bill page keeps the full title and portfolio. */
export function BillFeed({
  bills,
  kind = 'new',
}: {
  bills: readonly Bill[];
  kind?: RecentBillsKind;
}) {
  return (
    <InsetGroup testID="today-bills-group">
      {bills.map((bill, i) => {
        if (i === 0) perfOnce('today-bill-0');
        const text = billRowText(bill, kind);
        return (
          <BillRow
            preview
            key={bill.key}
            billKey={bill.key}
            title={text.name}
            status={text.status}
            rawStatus={bill.status}
            showStatus={kind === 'new'}
            date={text.date}
            meta={text.meta}
            href={billRoute(bill.key, text.name)}
            accessibilityLabel={text.label}
            testID={`today-bill-${i}`}
            dragPath={`/bill/${bill.key}`}
          />
        );
      })}
    </InsetGroup>
  );
}

const segments = [
  { value: 'new' as const, label: 'New', testID: 'today-bills-new' },
  { value: 'passed' as const, label: 'Passed', testID: 'today-bills-passed' },
];

/**
 * Bills (today.md 5.7): "See all" pushes the list inside Today for the
 * segment; New or Passed for the session; three rows; the line after them.
 * It loads on its own (the bills index alone).
 */
export function BillsBlock({
  attempt,
  onAnswer,
  onRetry,
}: {
  attempt: number;
  /** Told once the first read has answered (hit, miss or failure). */
  onAnswer?: () => void;
  onRetry: () => void;
}) {
  const [kind, setKind] = useState<RecentBillsKind>('new');
  const block = useTodayRead(
    `bills-${kind}`,
    async (refresh) => {
      const result = await catalogs.todayBills(3, kind, refresh);
      onAnswer?.();
      return result;
    },
    attempt,
  );
  const state = blockState(block);
  return (
    <TodayBlock
      title="Bills"
      term="bill"
      action={{
        accessibilityLabel:
          kind === 'new' ? 'See all new bills' : 'See all passed bills',
        href:
          kind === 'new'
            ? billListRoute({ scope: 'all', sort: 'newest' })
            : billListRoute({ scope: 'passed' }),
        testID: 'today-bills-all',
      }}
      above={
        <View style={styles.segments}>
          <SegmentedPicker
            options={segments}
            value={kind}
            onChange={setKind}
            accessibilityLabel="Bills"
            // At AX sizes the heading above already says Bills (sweep 1, 2.2).
            menuTitle="Showing"
            testID="today-bills-segment"
          />
        </View>
      }
      state={state}
      skeleton={
        <Skeleton
          shape={kind === 'new' ? 'bills' : 'rows'}
          count={3}
          label="Loading bills"
          testID="today-bills-loading"
        />
      }
      empty={
        kind === 'new' ? 'No bills introduced yet.' : 'No bills passed yet.'
      }
      error="Bills couldn’t be loaded."
      onRetry={onRetry}
      report={reportOf(block)}
      line={
        block && block.status !== 'loading' && block.status !== 'error'
          ? { ...billsSources(block, kind), testID: 'today-bills-sources' }
          : undefined
      }
      testID="today-bills"
    >
      {(bills) => <BillFeed bills={bills} kind={kind} />}
    </TodayBlock>
  );
}

const styles = StyleSheet.create({
  // 8 pt under the header (the block's gap), 12 pt above the group.
  segments: { marginBottom: rhythm.line },
});
