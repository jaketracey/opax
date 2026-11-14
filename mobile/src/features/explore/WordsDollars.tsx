import { LoadingStatus } from '../../design/states';
import { useEffect, useState } from 'react';
import { Platform, RefreshControl, StyleSheet, View } from 'react-native';
import type { RecordResult } from '../../api/client';
import { reports } from '../../api/runtime';
import { useRead } from '../../api/useRead';
import { counted, formatMoney } from '../../design/format';
import {
  ContentUnavailable,
  Heading,
  Icon,
  InlineError,
  PopUpButton,
  Screen,
  Skeleton,
  SourceLine,
  Text,
  copy,
  haptic,
  type SourceDetails,
  type TextTone,
} from '../../design/primitives';
import { symbols } from '../../design/symbols';
import { accents, rhythm } from '../../design/tokens';
import { isOffline } from '../CatalogState';
import type { IndustryMoney } from '../reports/model';
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
import { PairRow, type PairFigures } from './PairRow';
import { ExploreChrome } from './parts';
import { readExploreChoices, saveExploreChoice } from './repository';
import { explore } from './runtime';

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
  partial = false,
): SourceDetails {
  const moneyAsOf = money.data.meta.generated ?? null;
  const topicsAsOf = matrix?.data.generated_at ?? null;
  const combined = combinedIndustryNote(pairing);
  return {
    asOf: moneyAsOf,
    savedAt: money.stale ? money.savedAt : null,
    ...(partial ? { state: 'partial' as const } : {}),
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
  };
}

/**
 * A pairing's parties as drawn: wordsPanel order, matrix shares, and the
 * largest party amount and share on this subject, which scale the bars.
 */
export function pairFigures(
  pairing: Pairing,
  matrix: Matrix | null,
  money: IndustryMoney,
) {
  const panel = wordsPanel(pairing, matrix, money);
  const cells = matrix?.cells[pairing.topic] ?? {};
  const shares = new Map(
    partyShares(cells, panel.base).map((s) => [s.party, s]),
  );
  const rows = panel.rows.map((row): PairFigures => {
    const share = shares.get(row.party);
    return {
      party: row.party,
      name: row.name,
      money: row.money,
      count: row.speeches,
      share: row.share,
      percent:
        share?.percent == null
          ? null
          : share.percent === 0
            ? '<1%'
            : `${share.percent}%`,
      speechMissing: !matrix,
    };
  });
  return {
    panel,
    rows,
    moneyMax: Math.max(0, ...rows.map((r) => r.money)),
    shareMax: matrix ? Math.max(0, ...rows.map((r) => r.share)) : 0,
    /** Nothing to compare: no donations and, with speeches loaded, none. */
    empty: panel.moneyTotal === 0 && !!matrix && rows.every((r) => !r.count),
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
      <ExploreChrome name="Words per dollar" game="wd" />
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
        <PopUpButton
          label="Subject"
          value={pairing.topic}
          options={SUBJECTS}
          onChange={(next) => {
            // Android's menu already fires its own selection haptic.
            if (Platform.OS === 'ios') haptic('selection');
            setTopic(next);
            saveExploreChoice({ subject: next });
          }}
          testID="wd-subject"
        />
        <Text wordSafe variant="footnote">
          Comparison, never causation
        </Text>
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
          <LoadingStatus
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Loading donations and speeches"
            accessibilityState={{ busy: true }}
            testID="wd-loading"
          >
            {/* The page's final shape: the figure, then four party rows. */}
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.body}
            >
              <Skeleton shape="figure" count={1} />
              <Skeleton shape="rows" count={4} />
            </View>
          </LoadingStatus>
        ) : (
          <View style={styles.body}>
            {figures.empty ? (
              <Text wordSafe variant="body" testID="wd-empty">
                {`No donations or speeches with a topic label are recorded for ${topicLabel(pairing.topic).toLowerCase()}.`}
              </Text>
            ) : (
              <>
                {figures.panel.moneyTotal > 0 ? (
                  <View style={styles.figure}>
                    <View
                      accessible
                      accessibilityLabel={`${formatMoney(figures.panel.moneyTotal)}, disclosed by ${pairing.industryNoun} to political parties`}
                      testID="wd-figure"
                    >
                      <Text
                        wordSafe
                        variant="figure"
                        tone={accents.money.ink as TextTone}
                      >
                        {formatMoney(figures.panel.moneyTotal)}
                      </Text>
                      <Text wordSafe variant="secondary">
                        {`disclosed by ${pairing.industryNoun} to political parties`}
                      </Text>
                    </View>
                    <Text wordSafe variant="footnote">
                      A floor, not a ceiling: donations under the disclosure
                      threshold are not reported.
                    </Text>
                  </View>
                ) : null}
                <View
                  style={styles.legend}
                  accessible
                  accessibilityLabel={`Donations. Share of ${topicLabel(pairing.topic)} speeches.`}
                >
                  <View style={styles.key}>
                    <Icon
                      name={symbols.money}
                      size={13}
                      tone="inkSoft"
                      maxScale={1.5}
                    />
                    <Text wordSafe variant="footnote">
                      Donations
                    </Text>
                  </View>
                  <View style={styles.key}>
                    <Icon
                      name={symbols.speech}
                      size={13}
                      tone="inkSoft"
                      maxScale={1.5}
                    />
                    <Text wordSafe variant="footnote">
                      {`Share of ${topicLabel(pairing.topic)} speeches`}
                    </Text>
                  </View>
                </View>
                <View>
                  {figures.rows.map((row) => (
                    <PairRow
                      key={row.party}
                      row={row}
                      pairing={pairing}
                      moneyMax={figures.moneyMax}
                      shareMax={figures.shareMax}
                    />
                  ))}
                </View>
                {matrix.error && !matrix.record ? (
                  <InlineError
                    subject="Speech shares"
                    message={
                      isOffline(matrix.error)
                        ? 'Speech shares need a connection.'
                        : undefined
                    }
                    onRetry={matrix.retry}
                    testID="wd-speech-error"
                  />
                ) : null}
                {matrix.record && base > 0 && base < THIN_PARTY_BASE ? (
                  <Text wordSafe variant="footnote" testID="wd-thin">
                    {`A party is recorded for only ${counted(base, 'speech', 'speeches')} on this subject, so shares are not shown.`}
                  </Text>
                ) : null}
              </>
            )}
            <SourceLine
              {...wordsSource(
                money.record,
                matrix.record,
                pairing,
                !!matrix.error && !matrix.record,
              )}
              testID="wd-as-at"
            />
          </View>
        )}
      </Screen>
    </>
  );
}
const styles = StyleSheet.create({
  body: { gap: rhythm.block },
  figure: { gap: rhythm.line },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: rhythm.block,
    rowGap: rhythm.line,
  },
  key: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
});
