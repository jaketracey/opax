import { useCallback } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import {
  LinkRow,
  BigFigure,
  Group,
  RowList,
  Section,
  SectionHeader,
  SourceLine,
  Text,
} from '../../design/primitives';
import { FigureBlock } from '../../design/record';
import { InlineError, Skeleton } from '../../design/states';
import {
  formatCount,
  formatDate,
  formatMoneyCompact,
  formatPercent,
  moneyAccessibilityLabel,
} from '../../design/format';
import { rhythm } from '../../design/tokens';
import { RecordStatus } from '../RecordStatus';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { money } from './runtime';
import type { GrantIndex } from './data';
import {
  counted,
  fyRange,
  moneyCitation,
  moneyRegister,
  readableDates,
  recordSource,
  type Saved,
} from './parts';

export const SEAT_CAVEAT =
  'Matched by postcode where one is recorded, so this is a minimum.';
/** The attribution rule, said in the seat's source sheet (specs/your-mp.md 3.6). */
export const SEAT_RULE =
  'Grants are counted in an electorate by the delivery or recipient postcode given in GrantConnect, so the electorate is approximate. A grant counted here says nothing about who arranged it.';
/** How much of the money has a postcode (specs/money.md 2.2). */
export function postcodeNote(index: GrantIndex) {
  const share = index.counts.electorateKnownShare;
  return `Grants are matched to an electorate from the delivery or recipient postcode. About half of grant dollars have a recorded postcode${share ? ` (${formatPercent(share * 100, 0)} as at ${formatDate(index.meta.asOf)})` : ''}, and a postcode that straddles a boundary is matched to one electorate.`;
}
export const noSeatMatch = (name: string) =>
  `No grants are matched to ${name} in the grant records. This is not a zero total.`;

/** The grant index's row for a federal seat, by name and state. */
export function seatRow(index: GrantIndex, name: string, state?: string) {
  const lower = (v: string) => v.toLocaleLowerCase('en-AU');
  return index.seats.find(
    (s) =>
      lower(s.name) === lower(name) &&
      (!state || lower(s.state) === lower(state)),
  );
}

/**
 * The seat's grants figure block (specs/money.md 2.2 and 2.3): the seat's
 * figure in money ink, its count and the index's period on the line, the
 * one minimum caveat, and its dated SourceLine. Nothing national.
 */
export function SeatFigure({
  index,
  record,
  name,
  state,
  testID,
}: {
  index: GrantIndex;
  record: Saved;
  name: string;
  state?: string;
  testID: string;
}) {
  const seat = seatRow(index, name, state);
  const saved = recordSource(record);
  const source = {
    asOf: index.meta.asOf,
    citation: [moneyCitation(index.meta.source)],
    savedAt: saved.savedAt,
    state: saved.state,
    originals: index.meta.sourceUrl
      ? [{ label: 'GrantConnect', url: index.meta.sourceUrl }]
      : [],
    notes: [SEAT_RULE, postcodeNote(index), ...saved.stateNotes],
    licence: index.meta.licence,
    testID: `${testID}-source`,
  };
  const years = index.meta.years;
  if (!seat)
    return (
      <Group gap={rhythm.tight}>
        <Text wordSafe testID={`${testID}-unmatched`}>
          {noSeatMatch(name)}
        </Text>
        <SourceLine {...source} />
      </Group>
    );
  const line = `in ${counted(seat.count, 'Commonwealth grant')}${years.length ? `, ${fyRange(years[0]!, years.at(-1)!)}` : ''}`;
  return (
    <FigureBlock
      value={formatMoneyCompact(seat.total)}
      ink="money"
      label={line}
      caveat={SEAT_CAVEAT}
      accessibilityLabel={`${moneyAccessibilityLabel(seat.total, true)}, ${line}`}
      {...{ source }}
      testID={`${testID}-total`}
    />
  );
}

/**
 * Grants in a seat, embedded on Your MP and the electorate page.
 *
 * `default` draws the block as it was before the Apple-design programme, so
 * its current call sites keep working until wave 6. `seat-home` is the
 * redesign (specs/money.md 2.3, specs/your-mp.md 3.6): "Grants in
 * Grayndler" with no action until the per-seat slice ships (D5), the span
 * line, the minimum caveat and the postcode note in its source sheet.
 */
export function SeatGrants({
  name,
  state,
  eligible = true,
  variant = 'default',
}: {
  name: string;
  state: string;
  eligible?: boolean;
  variant?: 'default' | 'seat-home';
}) {
  const load = useCallback(
    (refresh: boolean) => money.grants('federal', refresh),
    [],
  );
  const status = useCatalogRecord(load),
    data = status.record?.data;
  // A seat that isn't a federal division has no block at all
  // (journeys/money.md 7, specs/your-mp.md 3.6).
  if (variant === 'seat-home' && !eligible) return null;
  if (variant === 'seat-home')
    return (
      <View testID="seat-grants" style={{ gap: rhythm.tight }}>
        <SectionHeader title={`Grants in ${name}`} testID="seat-grants-title" />
        {data ? (
          <SeatFigure
            index={data}
            record={status.record}
            name={name}
            state={state}
            testID="seat-grants"
          />
        ) : status.error ? (
          <InlineError
            subject="Grants"
            message="Grants couldn't be loaded."
            onRetry={status.retry}
            testID="seat-grants-error"
          />
        ) : (
          <Skeleton
            shape="figure"
            count={1}
            label={`Loading grants in ${name}`}
            testID="seat-grants-loading"
          />
        )}
      </View>
    );
  return (
    <LegacySeatGrants
      name={name}
      state={state}
      eligible={eligible}
      status={status}
    />
  );
}

/** The block exactly as drawn before this programme (variant `default`). */
function LegacySeatGrants({
  name,
  state,
  eligible,
  status,
}: {
  name: string;
  state: string;
  eligible: boolean;
  status: ReturnType<
    typeof useCatalogRecord<Awaited<ReturnType<typeof money.grants>>>
  >;
}) {
  const data = status.record?.data;
  const seat = eligible
    ? data?.seats.find(
        (s) =>
          s.name.toLowerCase() === name.toLowerCase() &&
          s.state.toLowerCase() === state.toLowerCase(),
      )
    : undefined;
  return (
    <Section title="Grants in this seat" accent="money" testID="seat-grants">
      <RecordStatus
        {...status}
        label="Loading grants in this seat"
        testID="seat-grants-status"
      />
      {data ? (
        <Group gap={rhythm.tight}>
          {seat ? (
            <BigFigure
              value={formatMoneyCompact(seat.total)}
              spoken={moneyAccessibilityLabel(seat.total, true)}
              label={`In ${formatCount(seat.count)} Commonwealth grants`}
              accent="money"
              testID="seat-grants-total"
            />
          ) : (
            <Text wordSafe>
              No matching federal division in the grant records. This is not a
              zero total.
            </Text>
          )}
          <SourceLine
            title="About grants in this seat"
            asOf={data.meta.asOf}
            citation={[moneyCitation(data.meta.source)]}
            savedAt={status.record?.stale ? status.record.savedAt : null}
            originals={
              data.meta.sourceUrl
                ? [
                    {
                      label: moneyRegister(data.meta.source),
                      url: data.meta.sourceUrl,
                    },
                  ]
                : []
            }
            notes={[
              data.meta.coverage,
              data.meta.threshold,
              ...data.meta.caveats,
              'Electorate mappings are approximate and use the award’s delivery or recipient postcode.',
            ].map(readableDates)}
            licence={data.meta.licence}
            testID="seat-grants-source"
          />
        </Group>
      ) : null}
      <RowList>
        {data ? (
          <LinkRow
            title="See all"
            testID="seat-grants-all"
            onPress={() =>
              router.push({
                pathname: '/grants',
                params: {
                  jur: 'federal',
                  seat: name,
                  state,
                  view: 'electorates',
                },
              })
            }
          />
        ) : null}
        <LinkRow
          title="Public money"
          testID="seat-public-money"
          onPress={() => router.push('/public-money')}
        />
      </RowList>
    </Section>
  );
}
