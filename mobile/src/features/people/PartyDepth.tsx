import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { peopleDepth } from '../../api/runtime';
import { useReduceMotion } from '../../design/accessibility';
import { BarSeries } from '../../design/charts';
import { Button } from '../../design/controls';
import { Disclosure } from '../../design/disclosure';
import {
  formatCount,
  formatDate,
  formatFinancialYear,
  formatMoney,
  formatMoneyCompact,
} from '../../design/format';
import { Group, Section } from '../../design/layout';
import { jurisdictionName } from '../../design/parliament';
import { ValueRow } from '../../design/rows';
import { HeightReveal } from '../../design/reveal';
import { InlineError, Skeleton } from '../../design/states';
import { Heading, Text } from '../../design/text';
import { colors, hairline, rhythm } from '../../design/tokens';
import { Amount } from './FinancialBlocks';
import { ReadDate, useRead } from './Sections';
import { receiptsSeries } from './model';

export type Funding = Awaited<ReturnType<typeof peopleDepth.funding>>;
const fy = (year: string) => formatFinancialYear(Number(year.slice(0, 4)));

/** The AEC annual-returns read, shared by Each year's return and Debts. */
export function usePartyFunding(
  afterFrame?: (signal?: AbortSignal) => Promise<void>,
) {
  return useRead(
    (signal?: AbortSignal) =>
      afterFrame
        ? afterFrame(signal).then(() => peopleDepth.funding(signal))
        : peopleDepth.funding(signal),
    'funding',
  );
}

/** The notes the returns and debts carry into their section's source sheet. */
export function fundingNotes(record: Funding, name: string): string[] {
  const rows = receiptsSeries(record.data.parties[name]?.returns);
  return [
    '“Not itemised” is receipts minus the sums itemised as donations and as other receipts on the same return; the AEC does not require receipts under the disclosure threshold to be itemised. Public election funding is left where the return puts it.',
    'Debts are the balances the party’s branches listed as owed at 30 June on their own AEC annual returns, all branches summed: bank loans sit beside trade creditors and tax owed, and a balance is not new borrowing. Creditors under the disclosure threshold are not itemised.',
    rows.some((r) => r.clamped)
      ? 'Some historic rows report itemised components above the headline receipts total; their components are clamped to that total.'
      : '',
  ].filter(Boolean);
}

/**
 * Each year's return (people.md 2.2, inside Receipts): every financial
 * year's return total as bars, newest at the right, with the chart's own
 * table; then the latest year's lines. Collapses with no return.
 */
export function PartyReturns({
  record,
  name,
}: {
  record: Funding;
  name: string;
}) {
  const rows = receiptsSeries(record.data.parties[name]?.returns);
  const latest = rows[0];
  if (!latest) return null;
  const series = [...rows].reverse();
  const first = Number(series[0]!.year.slice(0, 4));
  const last = Number(latest.year.slice(0, 4));
  return (
    <View style={styles.block} testID="party-annual-returns">
      <Heading level={3}>Each year’s return</Heading>
      <Text wordSafe variant="secondary">
        All branches combined
      </Text>
      <View testID="party-returns-chart">
        <BarSeries
          data={series.map((r) => ({ label: fy(r.year), value: r.receipts }))}
          sourceLine={false}
          ink="money"
          format={formatMoneyCompact}
          tableTitle="Each year’s return"
          {...{
            dateRange: { start: `${first}-07-01`, end: `${last + 1}-06-30` },
            citation: 'AEC annual returns',
          }}
        />
      </View>
      <View testID="party-returns-latest">
        <Text
          wordSafe
          variant="groupHeader"
          accessibilityRole="header"
          style={styles.groupHeader}
        >
          {`${fy(latest.year)} return`}
        </Text>
        <ValueRow label="Total receipts" value={formatMoney(latest.receipts)} />
        <ValueRow
          label="Itemised donations"
          value={formatMoney(latest.donations)}
        />
        <ValueRow
          label="Itemised other receipts"
          value={formatMoney(latest.other)}
        />
        <ValueRow
          label="Not itemised"
          value={formatMoney(latest.notItemised)}
        />
      </View>
    </View>
  );
}

/**
 * Debts (people.md 2.2, inside Debts and associated entities): the balance
 * owed at the latest 30 June, the share owed to lenders, the largest
 * creditors, and the balance at each 30 June. Collapses with no debt.
 */
export function PartyDebts({
  record,
  name,
}: {
  record: Funding;
  name: string;
}) {
  const d = record.data.parties[name]?.debts;
  if (!d) return null;
  return (
    <View style={styles.block} testID="party-debts">
      <Heading level={3}>Debts</Heading>
      <Amount
        amount={d.total}
        line={`owed at 30 June ${Number(d.year.slice(0, 4)) + 1}`}
        testID="party-debts-total"
      />
      <View>
        <ValueRow
          label="Owed to banks and lenders"
          value={formatMoney(d.financial_total)}
        />
        <ValueRow label="Creditors listed" value={formatCount(d.lenders)} />
      </View>
      {d.top.length ? (
        <View>
          <Text
            wordSafe
            variant="groupHeader"
            accessibilityRole="header"
            style={styles.groupHeader}
          >
            {`Largest creditors, ${fy(d.year)}`}
          </Text>
          <Creditors rows={d.top} />
        </View>
      ) : null}
      <Disclosure
        label="Owed at each 30 June"
        value={formatCount(d.by_year.length)}
        testID="party-debt-years"
      >
        {() =>
          d.by_year.map(([year, total]) => (
            <ValueRow key={year} label={fy(year)} value={formatMoney(total)} />
          ))
        }
      </Disclosure>
    </View>
  );
}

/** Creditors shown before "Show all N". */
export const CREDITORS_SHOWN = 5;

/**
 * The largest creditors: the first five, then the rest eased open below
 * them, so the list does not stand between the reader and the sections
 * after it.
 */
function Creditors({
  rows,
}: {
  rows: readonly { name: string; amount: number }[];
}) {
  const [all, setAll] = useState(false);
  const reduceMotion = useReduceMotion();
  const row = (l: { name: string; amount: number }, i: number) => (
    <ValueRow
      key={`${l.name}-${i}`}
      label={l.name}
      value={formatMoney(l.amount)}
    />
  );
  const hidden = rows.length - CREDITORS_SHOWN;
  return (
    <View testID="party-creditors">
      {rows.slice(0, CREDITORS_SHOWN).map(row)}
      <HeightReveal reduceMotion={reduceMotion}>
        {all && hidden > 0 ? (
          <View testID="party-creditors-rest">
            {rows
              .slice(CREDITORS_SHOWN)
              .map((l, i) => row(l, i + CREDITORS_SHOWN))}
          </View>
        ) : null}
      </HeightReveal>
      {hidden > 0 ? (
        <View style={styles.showAll}>
          <Button
            variant="plain"
            label={all ? 'Show fewer' : `Show all ${formatCount(rows.length)}`}
            trailingIcon={all ? 'chevron.up' : 'chevron.down'}
            expanded={all}
            onPress={() => setAll((open) => !open)}
            testID="party-creditors-all"
          />
        </View>
      ) : null}
    </View>
  );
}

/** Whether the funding read holds anything for this party. */
export const hasFunding = (record: Funding, name: string) => {
  const p = record.data.parties[name];
  return !!(p?.debts || receiptsSeries(p?.returns).length);
};

/** The one error for the returns and debts read (people.md 2.2). */
export function FundingError({ retry }: { retry: () => void }) {
  return (
    <InlineError
      subject="Returns and debts"
      onRetry={retry}
      testID="party-funding-error"
    />
  );
}

/** A skeleton in the shape of a figure block. */
export function FundingLoading() {
  return (
    <Skeleton
      shape="figure"
      count={1}
      label="Loading returns and debts"
      testID="party-funding-loading"
    />
  );
}

/**
 * Meetings and lobbying (people.md 2.2): who they met and whose registered
 * lobbying client they are. Each half collapses when empty, and the section
 * with them.
 */
export function PartyAccess({ name }: { name: string }) {
  const { read, retry } = useRead(
    (signal?: AbortSignal) => peopleDepth.access(signal),
    'access',
  );
  if (read.status === 'loading')
    return (
      <Section
        title="Meetings and lobbying"
        testID="party-access"
        headingTestID="party-access-heading"
      >
        <Skeleton
          shape="rows"
          count={3}
          label="Loading meetings and lobbying"
          testID="party-access-loading"
        />
      </Section>
    );
  if (read.status === 'error')
    return (
      <Section
        title="Meetings and lobbying"
        testID="party-access"
        headingTestID="party-access-heading"
      >
        <InlineError
          subject="Meetings"
          onRetry={retry}
          testID="party-access-error"
        />
      </Section>
    );
  const record = read.value;
  const d = record.data.donors[name];
  const meetings = d?.meetings ?? [];
  const lobbyists = d?.lobbyists ?? [];
  if (!meetings.length && !lobbyists.length) return null;
  return (
    <Section
      title="Meetings and lobbying"
      testID="party-access"
      headingTestID="party-access-heading"
    >
      <Group>
        {meetings.length ? (
          <View style={styles.block}>
            <Heading level={3}>Who they met</Heading>
            <View>
              {meetings.map((m, i) => (
                <View
                  key={i}
                  accessible
                  style={[styles.row, i ? styles.inset : null]}
                >
                  <Text wordSafe variant="body">
                    {m.minister}
                  </Text>
                  <Text wordSafe variant="secondary">
                    {[
                      jurisdictionName(m.jurisdiction.toLowerCase()),
                      m.date ? formatDate(m.date, 'short') : null,
                      m.purpose,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              ))}
            </View>
            {(d?.meetings_total ?? 0) > meetings.length ? (
              <Text wordSafe variant="footnote">
                {`${formatCount(meetings.length)} of ${formatCount(d!.meetings_total!)} shown, newest first.`}
              </Text>
            ) : null}
          </View>
        ) : null}
        {lobbyists.length ? (
          <View style={styles.block}>
            <Heading level={3}>Registered lobbying client of</Heading>
            <View>
              {lobbyists.map((l, i) => (
                <View
                  key={i}
                  accessible
                  style={[styles.row, i ? styles.inset : null]}
                >
                  <Text wordSafe variant="body">
                    {l.firm}
                  </Text>
                  <Text wordSafe variant="secondary">
                    {[
                      jurisdictionName(l.jurisdiction.toLowerCase()),
                      l.registered
                        ? `from ${formatDate(l.registered, 'short')}`
                        : null,
                      l.ceased ? 'ceased' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              ))}
            </View>
            {(d?.lobbyists_total ?? 0) > lobbyists.length ? (
              <Text wordSafe variant="footnote">
                {`${formatCount(lobbyists.length)} of ${formatCount(d!.lobbyists_total!)} shown.`}
              </Text>
            ) : null}
          </View>
        ) : null}
        <ReadDate
          record={record}
          citation="NSW and QLD ministerial diary disclosures; six lobbyist registers"
          about={{
            title: 'Meetings and lobbying',
            notes: [
              'From NSW and QLD ministerial diary disclosures and the six lobbyist registers; name matching is exact after normalisation, so a company using several trading names may be under-counted.',
            ],
          }}
          testID="party-access-source"
        />
      </Group>
    </Section>
  );
}

const styles = StyleSheet.create({
  block: { gap: rhythm.heading },
  groupHeader: { paddingTop: rhythm.tight },
  row: { paddingVertical: rhythm.tight, gap: rhythm.line },
  inset: { borderTopWidth: hairline, borderTopColor: colors.dividerSubtle },
  showAll: { alignItems: 'flex-start' },
});
