import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import {
  ContentUnavailable,
  FigureBlock,
  Heading,
  Icon,
  InlineError,
  PopUpButton,
  Screen,
  Skeleton,
  Text,
  copy,
  haptic,
  type FigureSource,
} from '../../design/primitives';
import { formatCount, formatMoney } from '../../design/format';
import { symbols } from '../../design/symbols';
import { rhythm } from '../../design/tokens';
import { reports } from '../../api/runtime';
import type { RecordResult } from '../../api/client';
import type { IndustryMoney } from '../reports/model';
import { isOffline } from '../CatalogState';
import { useRead } from '../reports/parts';
import { explore } from './runtime';
import { readExploreChoices, saveExploreChoice } from './repository';
import {
  THIN_PARTY_BASE,
  WORDS_NOTE,
  combinedIndustryNote,
  pairings,
  partyShares,
  topicLabel,
  wordsPanel,
  type Matrix,
  type Pairing,
} from './model';
import { ExploreHeader } from './parts';
import { PairRow, type PairFigures } from './PairRow';

const SUBJECTS = pairings.map((p) => ({
  value: p.topic,
  label: topicLabel(p.topic),
  testID: `wd-subject-${p.topic}`,
}));
const pairingFor = (topic: string | undefined): Pairing =>
  pairings.find((p) => p.topic === topic) ?? pairings[0]!;

/**
 * The page's one source line: AEC annual returns for the money, dated from
 * the money file; OPAX topics for the speeches, dated from `generated_at`.
 */
export function wordsSource(
  money: RecordResult<IndustryMoney>,
  matrix: RecordResult<Matrix> | null,
  pairing: Pairing,
): FigureSource {
  const moneyAsOf = money.data.meta.generated ?? null;
  const topicsAsOf = matrix?.data.generated_at ?? null;
  const combined = combinedIndustryNote(pairing);
  return {
    asOf: moneyAsOf,
    savedAt: money.stale ? money.savedAt : null,
    citation: [
      { label: 'AEC annual returns', asOf: moneyAsOf },
      { label: 'OPAX topics', asOf: topicsAsOf },
    ],
    originals: [
      {
        label: 'AEC Transparency Register',
        url: 'https://transparency.aec.gov.au/',
        record: 'annual returns',
        asOf: moneyAsOf,
      },
      { label: 'OPAX topics', url: '/topics', asOf: topicsAsOf },
    ],
    notes: [
      WORDS_NOTE,
      money.data.meta.methodology,
      ...(combined ? [combined] : []),
    ],
    testID: 'wd-as-at',
  };
}

/** A pairing's parties as drawn: wordsPanel order, matrix shares. */
export function pairFigures(
  pairing: Pairing,
  matrix: Matrix | null,
  money: IndustryMoney,
) {
  const panel = wordsPanel(pairing, matrix, money);
  const cells = matrix?.cells[pairing.topic] ?? {};
  const shares = new Map(
    partyShares(cells, panel.base).map((s) => [s.party, s.text]),
  );
  return {
    panel,
    rows: panel.rows.map(
      (row): PairFigures => ({
        party: row.party,
        name: row.name,
        money: row.money,
        speech: row.speeches > 0 ? (shares.get(row.party) ?? null) : null,
        speechMissing: !matrix,
      }),
    ),
  };
}

/**
 * One subject at a time: what its industry disclosed to each party beside
 * how much of the subject's debate each party gave. Comparison, never
 * causation. Money opens the money map; speeches open the topic.
 */
export default function WordsDollars() {
  const money = useRead(reports.money),
    matrix = useRead(explore.matrix);
  const [topic, setTopic] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void readExploreChoices().then((saved) => {
      if (live) setTopic((now) => now ?? pairingFor(saved.subject).topic);
    });
    return () => {
      live = false;
    };
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    money.retry();
    if (matrix.error) matrix.retry();
    setTimeout(() => setRefreshing(false), 300);
  };
  const pairing = pairingFor(topic ?? undefined);
  const settled = !!money.record && (!!matrix.record || !!matrix.error);
  const figures =
    settled && money.record
      ? pairFigures(pairing, matrix.record?.data ?? null, money.record.data)
      : null;
  const base = figures?.panel.base ?? 0;
  return (
    <>
      <ExploreHeader title="Words per dollar" game="wd" />
      <Screen
        testID="explore-wd-screen"
        barTitle="Words per dollar"
        offline={money.record?.stale ? { savedAt: money.record.savedAt } : null}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <Heading level={1} kind="page">
          Words per dollar
        </Heading>
        <Text wordSafe variant="body">
          What an industry disclosed to each party, beside how much of that
          subject’s debate each party gave. Comparison, never causation.
        </Text>
        <PopUpButton
          label="Subject"
          value={pairing.topic}
          options={SUBJECTS}
          onChange={(next) => {
            haptic('selection');
            setTopic(next);
            saveExploreChoice({ subject: next });
          }}
          testID="wd-subject"
        />
        {!money.record && isOffline(money.error) ? (
          <ContentUnavailable
            symbol="wifi.slash"
            title={copy.notSaved}
            body={copy.notSavedBody}
            action={{ label: copy.tryAgain, onPress: money.retry }}
            testID="wd-unavailable"
          />
        ) : !money.record && money.error ? (
          <InlineError
            subject="Donations"
            onRetry={money.retry}
            testID="wd-error"
          />
        ) : !money.record || !figures ? (
          <Skeleton
            shape="rows"
            count={6}
            label="Loading donations and speeches"
            testID="wd-loading"
          />
        ) : (
          <View style={styles.body}>
            <FigureBlock
              value={formatMoney(figures.panel.moneyTotal)}
              ink="money"
              label={`disclosed by ${pairing.industryNoun} to political parties`}
              caveat="A floor, not a ceiling: donations under the disclosure threshold are not reported."
              {...{
                source: wordsSource(money.record, matrix.record, pairing),
              }}
              testID="wd-figure"
            />
            <View
              style={styles.legend}
              accessible
              accessibilityLabel={`Money: disclosed by ${pairing.industryNoun}. Speeches: share of ${topicLabel(pairing.topic)} speeches with a recorded party.`}
            >
              <View style={styles.key}>
                <Icon
                  name={symbols.money}
                  size={15}
                  type="hierarchical"
                  ink="money"
                  maxScale={1.5}
                />
                <Text wordSafe variant="footnote" style={styles.grow}>
                  {`Money: disclosed by ${pairing.industryNoun}`}
                </Text>
              </View>
              <View style={styles.key}>
                <Icon
                  name={symbols.speech}
                  size={15}
                  tone="inkSoft"
                  maxScale={1.5}
                />
                <Text wordSafe variant="footnote" style={styles.grow}>
                  {`Speeches: share of ${topicLabel(pairing.topic)} speeches with a recorded party`}
                </Text>
              </View>
            </View>
            {matrix.error && !matrix.record ? (
              <InlineError
                subject="Speeches"
                onRetry={matrix.retry}
                testID="wd-speech-error"
              />
            ) : null}
            {figures.rows.length ? (
              <View>
                {figures.rows.map((row) => (
                  <PairRow key={row.party} row={row} pairing={pairing} />
                ))}
              </View>
            ) : (
              <Text wordSafe variant="body">
                No donations or speeches are recorded for this subject.
              </Text>
            )}
            {matrix.record && base > 0 && base < THIN_PARTY_BASE ? (
              <Text wordSafe variant="footnote" testID="wd-thin">
                {`A party is recorded for only ${formatCount(base)} of these speeches, so shares are not shown.`}
              </Text>
            ) : null}
          </View>
        )}
      </Screen>
    </>
  );
}
const styles = StyleSheet.create({
  body: { gap: rhythm.block },
  legend: { gap: rhythm.line },
  key: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  grow: { flex: 1 },
});
