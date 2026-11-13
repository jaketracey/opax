import type { Href } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import type { RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';
import { Card } from '../../design/card';
import { copy } from '../../design/copy';
import {
  formatFinancialYear,
  formatMoneyCompact,
  moneyAccessibilityLabel,
} from '../../design/format';
import { Icon, type SFSymbol } from '../../design/icon';
import { SourceLine, type SourceDetails } from '../../design/source';
import { InlineError, Skeleton } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, radii, rhythm } from '../../design/tokens';
import { moneyRoute } from '../../navigation/routes/money-map';
import {
  agenciesRoute,
  grantsRoute,
} from '../../navigation/routes/public-money';
import { presentSource } from '../../navigation/sheets';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import type { MoneyGraph } from '../money/data';
import { useMoneyRecord } from '../money/hooks';
import { partiesFigureWords, partyDonationsTotal } from '../money/records';
import { defaultMoneyFilters } from '../money/view';
import type { GrantIndex } from './data';
import {
  counted,
  fy,
  fyRange,
  moneyCitation,
  readableDates,
  recordSource,
  yearRange,
} from './parts';
import { money } from './runtime';

/** Written in each card's source sheet, under "How this is chosen". */
export const ORDER_RULE =
  'Public money first: grants, then government contracts, then donations to parties. The order is fixed.';
export const DONATIONS_CAVEAT =
  "Totals are a minimum: donations under the disclosure threshold aren't published.";
export const CONTRACTS_CAVEAT =
  'Contract values as last published, not amounts paid.';
export const GRANTS_CAVEAT =
  'Award values as last published, not amounts paid.';
export const FUTURE_YEARS_NOTE =
  "Some agreements are recorded against financial years that haven't started yet.";

/** One dated figure and the line saying what it counts, or why there is none. */
export interface CardFigure {
  value: number;
  line: string;
  source: SourceDetails;
}

/**
 * The Commonwealth grants headline (journeys/money.md 3.6): the latest
 * complete year once the data names it (D1), else the all-years total with
 * its range in the line.
 */
export function grantsFigure(index: GrantIndex, words = 'Commonwealth grants') {
  const latest = index.meta.latestCompleteYear;
  const year = latest ? index.byYear[latest] : undefined;
  const years = index.meta.years;
  return year
    ? {
        value: year.total,
        line: `in ${counted(year.count, words.replace(/s$/, ''), words)} in ${fy(latest)}`,
        allYears: {
          label: `All years, ${fyRange(years[0] ?? '', years.at(-1) ?? '')}`,
          value: index.counts.dollars,
        },
      }
    : {
        value: index.counts.dollars,
        line: `in ${counted(index.counts.grants, words.replace(/s$/, ''), words)}, ${fyRange(years[0] ?? '', years.at(-1) ?? '')}`,
        allYears: null,
      };
}

/**
 * Money received by every party on the federal graph: the party nodes'
 * totals, which cover every cleaned receipt except public funding (not the
 * 400 donors the map holds). The money map's donations figure at default
 * filters is the same sum. A year from the data's latest complete year
 * only (D1), keyed as the graph keys it, by the year the FY starts.
 */
export function partyDonations(graph: MoneyGraph) {
  const parties = graph.nodes.filter((n) => n.kind === 'party');
  const latest =
    typeof graph.meta.latest_complete_year === 'string'
      ? graph.meta.latest_complete_year
      : '';
  const key = latest.slice(0, 4);
  const range = /(\d{4}-\d{2}) to (\d{4}-\d{2})/.exec(graph.meta.coverage);
  const { hubLine } = partiesFigureWords(graph);
  if (key && parties.some((p) => p.byYear?.[key]))
    return {
      value: partyDonationsTotal(graph, { from: Number(key), to: Number(key) })
        .total,
      line: `${hubLine} in ${formatFinancialYear(Number(key))}`,
    };
  return {
    value: partyDonationsTotal(graph, defaultMoneyFilters(graph)).total,
    line: `${hubLine}${range ? `, ${fyRange(range[1]!, range[2]!)}` : ''}`,
  };
}

type CardState =
  | { status: 'loading' }
  | { status: 'error'; offline: boolean; retry: () => void }
  | { status: 'ready'; figure: CardFigure };

const offline = (error: unknown) =>
  error instanceof ApiError && ['offline', 'timeout'].includes(error.code);

/**
 * A question card (DIRECTION 6.7, journeys/money.md 4.3): the destination's
 * name as a kicker beside the category symbol, the question, the figure in
 * money ink, one line, and the card's own SourceLine at its foot, outside
 * the whole-card link so it keeps its 44 pt band.
 */
export function QuestionCard({
  kicker,
  symbol,
  question,
  href,
  state,
  testID,
  aliases = [],
}: {
  kicker: string;
  symbol: SFSymbol;
  question: string;
  href: Href;
  state: CardState;
  testID: string;
  /** Older test IDs carried by the same card. */
  aliases?: string[];
}) {
  const figure = state.status === 'ready' ? state.figure : null;
  const spoken = figure
    ? `${question} ${moneyAccessibilityLabel(figure.value, true)} ${figure.line}.`
    : question;
  const openSources = () =>
    figure
      ? presentSource(figure.source, { testID: `${testID}-source` })
      : null;
  const card = (
    <Card
      href={href}
      testID={testID}
      accessibilityLabel={spoken}
      accessibilityHint={`Opens ${kicker}.`}
      accessibilityActions={
        figure
          ? [{ name: 'Sources', label: copy.sources, onAction: openSources }]
          : []
      }
    >
      <View style={styles.body}>
        <View style={styles.kicker}>
          <Icon name={symbol} size={20} ink="money" type="hierarchical" />
          <Text wordSafe variant="footnote" tone="inkSoft">
            {kicker}
          </Text>
        </View>
        <View style={styles.question}>
          <Text wordSafe variant="sectionTitle" style={styles.grow}>
            {question}
          </Text>
          <Icon name={symbols.chevron} size={15} tone="inkFaint" />
        </View>
        {state.status === 'loading' ? (
          <Skeleton
            shape="figure"
            count={1}
            label={`Loading ${kicker}`}
            testID={`${testID}-loading`}
          />
        ) : state.status === 'error' ? (
          state.offline ? (
            <Text wordSafe variant="secondary" testID={`${testID}-unsaved`}>
              {copy.notSaved}.
            </Text>
          ) : (
            <InlineError
              subject="Figures"
              message="Figures couldn't be loaded."
              onRetry={state.retry}
              testID={`${testID}-error`}
            />
          )
        ) : (
          <View testID={`${testID}-figure`}>
            <Text wordSafe variant="figure" tone="moneyInk">
              {formatMoneyCompact(state.figure.value)}
            </Text>
            <Text wordSafe variant="secondary">
              {state.figure.line}
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
  return (
    <View style={styles.frame}>
      {aliases.reduceRight(
        (inner, alias) => (
          <View testID={alias} collapsable={false}>
            {inner}
          </View>
        ),
        card,
      )}
      <View style={styles.source}>
        {figure ? (
          <SourceLine {...figure.source} testID={`${testID}-source`} />
        ) : null}
      </View>
    </View>
  );
}

function cardState<T>(
  status: { record: RecordResult<T> | null; error: unknown; retry: () => void },
  figure: (record: RecordResult<T>) => CardFigure,
): CardState {
  if (status.record) return { status: 'ready', figure: figure(status.record) };
  if (status.error)
    return {
      status: 'error',
      offline: offline(status.error),
      retry: status.retry,
    };
  return { status: 'loading' };
}
const sheet = (record: RecordResult<unknown>, details: SourceDetails) => {
  const state = recordSource(record);
  return {
    ...details,
    savedAt: state.savedAt,
    state: state.state,
    rule: ORDER_RULE,
    notes: [...(details.notes ?? []), ...state.stateNotes].map(readableDates),
  };
};

export function GrantsCard() {
  const load = useCallback(
    (refresh: boolean, _publish: unknown, signal?: AbortSignal) =>
      money.grants('federal', refresh, signal),
    [],
  );
  const status = useCatalogRecord(load);
  return (
    <QuestionCard
      kicker="Commonwealth grants"
      symbol={symbols.money}
      question="Who gets grants?"
      href={grantsRoute({ jur: 'federal' })}
      testID="money-card-grants"
      aliases={['money-federal']}
      state={cardState(status, (record) => {
        const index = record.data,
          figure = grantsFigure(index);
        return {
          value: figure.value,
          line: figure.line,
          source: sheet(record, {
            asOf: index.meta.asOf,
            citation: [moneyCitation(index.meta.source)],
            originals: index.meta.sourceUrl
              ? [{ label: 'GrantConnect', url: index.meta.sourceUrl }]
              : [],
            notes: [
              index.meta.coverage,
              GRANTS_CAVEAT,
              FUTURE_YEARS_NOTE,
              index.meta.threshold,
              ...index.meta.caveats,
            ],
            licence: index.meta.licence,
          }),
        };
      })}
    />
  );
}

export function ContractsCard() {
  const load = useCallback(
    (refresh: boolean, _publish: unknown, signal?: AbortSignal) =>
      money.agencies(refresh, signal),
    [],
  );
  const status = useCatalogRecord(load);
  return (
    <QuestionCard
      kicker="Government agencies"
      symbol={symbols.contracts}
      question="Who wins government contracts?"
      href={agenciesRoute}
      testID="money-card-contracts"
      aliases={['money-agencies']}
      state={cardState(status, (record) => {
        const data = record.data,
          span = yearRange(data.publishedFrom, data.publishedTo);
        return {
          value: data.agencies.reduce((sum, a) => sum + a.total, 0),
          line: `in Commonwealth contracts across ${counted(data.agencies.length, 'agency', 'agencies')}${span ? `, published ${span}` : ''}`,
          source: sheet(record, {
            asOf: data.meta.asOf,
            citation: [moneyCitation(data.meta.source)],
            originals: data.meta.sourceUrl
              ? [{ label: 'AusTender', url: data.meta.sourceUrl }]
              : [],
            notes: [CONTRACTS_CAVEAT, ...data.meta.caveats],
            licence: data.meta.licence,
          }),
        };
      })}
    />
  );
}

export function PartiesCard() {
  const status = useMoneyRecord('federal');
  return (
    <QuestionCard
      kicker="Money map"
      symbol={symbols.party}
      question="Who gives to parties?"
      href={{ ...moneyRoute(), params: { view: 'list' } } as Href}
      testID="money-card-parties"
      state={cardState(status, (record) => {
        const graph = record.data,
          figure = partyDonations(graph);
        return {
          value: figure.value,
          line: figure.line,
          source: sheet(record, {
            asOf: graph.meta.generated,
            citation: [
              { label: 'AEC', title: 'Australian Electoral Commission' },
            ],
            originals:
              typeof graph.meta.source_url === 'string'
                ? [{ label: 'AEC', url: graph.meta.source_url }]
                : [],
            notes: [
              DONATIONS_CAVEAT,
              'Election returns are counted in the year of the poll.',
              typeof graph.meta.party_totals_note === 'string'
                ? graph.meta.party_totals_note
                : null,
            ],
          }),
        };
      })}
    />
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.raised,
    borderRadius: radii.container,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  body: { gap: rhythm.tight },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: rhythm.line * 2 },
  question: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  grow: { flex: 1 },
  source: { paddingHorizontal: 20, paddingBottom: 12 },
});
