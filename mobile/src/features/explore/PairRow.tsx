import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import {
  Icon,
  PartyLabel,
  RowLink,
  Text,
  useAccessibilitySize,
} from '../../design/primitives';
import { formatMoney } from '../../design/format';
import { symbols } from '../../design/symbols';
import { colors, minimumTarget, radii, rhythm } from '../../design/tokens';
import { moneyRoute } from '../../navigation/routes/money-map';
import { topicRoute } from '../../navigation/routes/search';
import { speechesText, topicLabel, type Pairing } from './model';

/** One party's two figures on a subject, as the page draws and speaks them. */
export interface PairFigures {
  party: string;
  name: string;
  /** Disclosed donations from the pairing's industry. */
  money: number;
  /** Speeches on the subject by this party. */
  count: number;
  /** Exact share (0 to 100) of the subject's speeches with a recorded party. */
  share: number;
  /** "41%" or "<1%"; null on a thin subject, where only counts are shown. */
  percent: string | null;
  /** The matrix did not load: speeches are unknown, never zero. */
  speechMissing: boolean;
}
/** The money line's trailing value. */
export const pairMoneyText = (row: Pick<PairFigures, 'party' | 'money'>) =>
  row.money > 0
    ? formatMoney(row.money)
    : row.party === 'Independent'
      ? 'Not separated'
      : 'None disclosed';
/** The speech line's trailing value. */
export const pairSpeechText = (
  row: Pick<PairFigures, 'count' | 'percent' | 'speechMissing'>,
) =>
  row.speechMissing
    ? 'Not loaded'
    : row.count === 0
      ? 'No speeches recorded'
      : row.percent
        ? `${row.percent} · ${speechesText(row.count)}`
        : speechesText(row.count);
const spoken = (text: string) =>
  text
    .replace(/<1%/g, 'less than 1 percent')
    .replace(/%/g, ' percent')
    .replace(/ · /g, ', ');
const hasSpeeches = (row: PairFigures) => !row.speechMissing && row.count > 0;

/**
 * What VoiceOver reads for a party: the header with both figures, then each
 * line. "Labor. $10,763,834 from gambling donors. 41 percent of gambling
 * speeches with a recorded party."
 */
export function pairLabels(
  row: PairFigures,
  pairing: Pick<Pairing, 'topic' | 'industryNoun'>,
  links: { money: boolean; speech: boolean },
) {
  const subject = topicLabel(pairing.topic).toLowerCase();
  const money = pairMoneyText(row);
  const speechFigure = !hasSpeeches(row)
    ? pairSpeechText(row)
    : row.percent
      ? `${row.percent} of ${subject} speeches with a recorded party`
      : `${speechesText(row.count)} on ${subject}`;
  return {
    header: spoken(
      `${row.name}. ${row.money > 0 ? `${money} from ${pairing.industryNoun}` : money}. ${speechFigure}.`,
    ),
    money: spoken(
      `${row.name}, donations from ${pairing.industryNoun}, ${money}.${links.money ? ' Opens the money map.' : ''}`,
    ),
    speech: spoken(
      hasSpeeches(row)
        ? `${row.name}, ${speechFigure}${row.percent ? `, ${speechesText(row.count)}` : ''}.${links.speech ? ' Opens the topic.' : ''}`
        : `${row.name}, share of ${subject} speeches, ${speechFigure}.`,
    ),
  };
}

/** The in-tab money map, filtered to this party and the pairing's industry. */
export function pairMoneyRoute(party: string, industry: string | undefined) {
  const route = moneyRoute(party);
  return {
    ...route,
    params: { ...route.params, ...(industry ? { industry } : {}) },
  };
}

/** A 6 pt ink bar on the line's flexible middle; nothing for zero. */
function Bar({ ratio, full }: { ratio: number; full: boolean }) {
  return (
    <View
      style={full ? styles.trackFull : styles.track}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {ratio > 0 ? (
        <View style={[styles.bar, { width: `${Math.min(1, ratio) * 100}%` }]} />
      ) : null}
    </View>
  );
}

/**
 * One party in a subject's pairing: its name as a header that reads both
 * figures, then a donations line (opens the money map filtered to the
 * industry and party, never the web) and a speech line (opens the
 * subject's speeches by that party). The two bars are told apart by their
 * symbols; each bar's value is written beside it, so the bars are hidden
 * from VoiceOver. A line with nothing to open is text, without a chevron.
 */
export function PairRow({
  row,
  pairing,
  moneyMax,
  shareMax,
}: {
  row: PairFigures;
  pairing: Pick<Pairing, 'topic' | 'industries' | 'industryNoun'>;
  moneyMax: number;
  shareMax: number;
}) {
  const stacked = useAccessibilitySize();
  const moneyHref =
    row.money > 0
      ? (pairMoneyRoute(row.party, pairing.industries[0]) as Href)
      : null;
  const speechHref = hasSpeeches(row)
    ? topicRoute(pairing.topic, { party: row.party }, topicLabel(pairing.topic))
    : null;
  const labels = pairLabels(row, pairing, {
    money: !!moneyHref,
    speech: !!speechHref,
  });
  const line = (
    symbol: typeof symbols.money | typeof symbols.speech,
    value: string,
    ratio: number,
    label: string,
    href: Href | null,
    testID: string,
  ): ReactNode => {
    const icon = <Icon name={symbol} size={15} tone="inkSoft" maxScale={1.5} />;
    const text = (
      <Text
        wordSafe
        variant="strong"
        tabular
        style={stacked ? styles.grow : null}
      >
        {value}
      </Text>
    );
    const chevron = href ? (
      <Icon name={symbols.chevron} size={13} tone="inkSoft" maxScale={1.5} />
    ) : null;
    const body = stacked ? (
      <View style={styles.stack}>
        <View style={styles.head}>
          {icon}
          {text}
          {chevron}
        </View>
        <Bar ratio={ratio} full />
      </View>
    ) : (
      <>
        {icon}
        <Bar ratio={ratio} full={false} />
        {text}
        {chevron}
      </>
    );
    return href ? (
      <RowLink href={href}>
        <Pressable
          accessible
          accessibilityRole="link"
          accessibilityLabel={label}
          testID={testID}
          style={({ pressed }) => [
            styles.line,
            pressed ? { backgroundColor: colors.sunken } : null,
          ]}
        >
          {body}
        </Pressable>
      </RowLink>
    ) : (
      <View
        accessible
        accessibilityLabel={label}
        testID={testID}
        style={styles.line}
      >
        {body}
      </View>
    );
  };
  return (
    <View style={styles.block} testID={`wd-row-${row.party}`}>
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={labels.header}
        style={styles.header}
      >
        <PartyLabel party={row.name} nested linked={false} />
      </View>
      {line(
        symbols.money,
        pairMoneyText(row),
        moneyMax > 0 ? row.money / moneyMax : 0,
        labels.money,
        moneyHref,
        `wd-money-${row.party}`,
      )}
      {line(
        symbols.speech,
        pairSpeechText(row),
        hasSpeeches(row) && shareMax > 0 ? row.share / shareMax : 0,
        labels.speech,
        speechHref,
        `wd-speech-${row.party}`,
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  block: { paddingVertical: rhythm.tight },
  header: { minHeight: 24, justifyContent: 'center' },
  line: {
    minHeight: minimumTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  stack: { flex: 1, gap: rhythm.line, paddingVertical: rhythm.line },
  head: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  grow: { flex: 1 },
  track: { flex: 1, height: 6, justifyContent: 'center' },
  trackFull: { alignSelf: 'stretch', height: 6 },
  bar: {
    height: 6,
    backgroundColor: colors.ink,
    borderRadius: radii.bar,
    borderCurve: 'continuous',
  },
});
