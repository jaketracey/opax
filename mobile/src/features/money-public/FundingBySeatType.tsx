import { RouteOptions } from '../../navigation/preview';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { useCallback, useRef } from 'react';
import { RefreshControl, View } from 'react-native';

import { ApiError } from '../../api/errors';
import { copy } from '../../design/copy';
import { InsetGroup, Screen } from '../../design/layout';
import { ValueRow } from '../../design/rows';
import { SourceLine } from '../../design/source';
import { ContentUnavailable, OfflineLine, Skeleton } from '../../design/states';
import { Heading, Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { money } from './runtime';
import { moneyBar, readableDates, recordSource } from './parts';

/**
 * CPI's Table 3 row labels for the names `mlci.json` stores, by exact match
 * (specs/money.md 2.6.1). Interim until the data lane stores CPI's labels
 * verbatim (M-D3); a stored name not in the map is shown as stored.
 */
export const CPI_LABELS: Readonly<Record<string, string>> = {
  'Labor safe': 'ALP Safe',
  'Labor fairly safe': 'ALP Fairly Safe',
  'Marginal, Labor competitive': 'Marginal (ALP Competitive)',
  'Marginal, Labor non-competitive': 'Marginal (ALP Non-Competitive)',
  'Other parties fairly safe': 'Non-ALP Fairly Safe',
  'Other parties safe': 'Non-ALP Safe',
};
export const cpiLabel = (stored: string) => CPI_LABELS[stored] ?? stored;
/** "$125,125,027", in full dollars as CPI prints them. */
export const fullDollars = (value: number) =>
  `$${Math.round(Math.abs(value)).toLocaleString('en-AU')}`;
/** CPI's signed difference: "-$12,821,262" / "+$62,909,469". */
export const signedDollars = (value: number) =>
  `${value < 0 ? '-' : '+'}${fullDollars(value)}`;

export const SEAT_TYPE_NOTE =
  'This table reproduces the Centre for Public Integrity’s published Table 3 as published, including its notional 2025 boundaries, four by-election results and Brisbane competitiveness exception. OPAX has not recalculated it from each project’s location. The normalised value shares funding by the number of seats of each type.';
const CPI = {
  label: 'Centre for Public Integrity',
  title: 'Centre for Public Integrity, Public money, political advantage',
};

/**
 * Funding by seat type (specs/money.md 2.6.1): the Centre for Public
 * Integrity's Table 3 exactly as published, its rows, labels, figures and
 * order. No colour, no bars, no ranking.
 */
export default function FundingBySeatType() {
  const load = useCallback(
    (refresh: boolean, _publish: unknown, signal?: AbortSignal) =>
      money.allocation(refresh, signal),
    [],
  );
  const status = useCatalogRecord(load);
  const data = status.record?.data;
  const saved = recordSource(status.record);
  const name = 'Funding by seat type';
  const offline =
    status.error instanceof ApiError &&
    ['offline', 'timeout'].includes(status.error.code);
  const report = data?.sources.cpi;
  // The bar title fades in by scroll with no width at rest, so the back
  // button keeps its label (money-03), and truncates inside the bar items.
  const barTitleRef = useRef<View>(null);
  const barTitle = useTitleOnScroll(barTitleRef, name || undefined);
  return (
    <>
      <RouteOptions
        options={{
          title: name,
          ...moneyBar({
            name,
            path: '/money/grants?jur=federal&program=GO7867',
            share: false,
          }),
        }}
      />
      <Screen
        onScroll={barTitle.onScroll}
        grouped
        testID="funding-by-seat-type"
        refreshControl={
          <RefreshControl
            refreshing={status.refreshing}
            onRefresh={status.refresh}
          />
        }
      >
        <View
          ref={barTitleRef}
          collapsable={false}
          onLayout={barTitle.onTitleLayout}
        >
          <Heading level={1} kind="page" testID="seat-type-title">
            {name}
          </Heading>
        </View>
        <Text wordSafe variant="body">
          The Centre for Public Integrity’s Table 3, as published: what each
          type of seat received, and what it would have received if funding were
          shared by the number of seats.
        </Text>
        {status.record?.stale && !status.record.staleReason ? (
          <OfflineLine savedAt={status.record.savedAt} />
        ) : null}
        {data ? (
          <>
            {data.comparison.map((row, i) => (
              <InsetGroup
                key={row.name}
                header={cpiLabel(row.name)}
                testID={`seat-type-${i}`}
              >
                <ValueRow
                  label="Actual Grant Value"
                  value={fullDollars(row.actual)}
                  testID={`seat-type-${i}-actual`}
                />
                <ValueRow
                  label="Normalised Grant Value"
                  value={fullDollars(row.expected)}
                  testID={`seat-type-${i}-normalised`}
                />
                <ValueRow
                  label="Difference (Value)"
                  value={signedDollars(row.actual - row.expected)}
                  testID={`seat-type-${i}-difference`}
                />
              </InsetGroup>
            ))}
            <SourceLine
              dateLabel="Published Sep 2026"
              citation={[CPI]}
              savedAt={saved.savedAt}
              state={saved.state}
              originals={
                report
                  ? [
                      {
                        label:
                          'Centre for Public Integrity · Public money, political advantage (PDF), Table 3',
                        url: report,
                      },
                    ]
                  : []
              }
              notes={[SEAT_TYPE_NOTE, ...saved.stateNotes].map(readableDates)}
              testID="seat-type-source"
            />
          </>
        ) : status.error ? (
          offline ? (
            <ContentUnavailable
              symbol="wifi.slash"
              title={copy.notSaved}
              body={copy.notSavedBody}
              action={{ label: copy.tryAgain, onPress: status.retry }}
              testID="seat-type-offline"
            />
          ) : (
            <ContentUnavailable
              symbol="exclamationmark.triangle"
              title="The seat type table couldn’t be loaded"
              action={{ label: copy.tryAgain, onPress: status.retry }}
              testID="seat-type-error"
            />
          )
        ) : (
          <View style={{ gap: rhythm.block }}>
            <Skeleton
              shape="rows"
              count={18}
              label="Loading the seat type table"
              testID="seat-type-loading"
            />
          </View>
        )}
      </Screen>
    </>
  );
}
