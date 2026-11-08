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
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { moneyRoute } from '../../navigation/routes/money-map';
import { topicRoute } from '../../navigation/routes/search';
import { topicLabel, type Pairing } from './model';

/** One party's money and speech lines, as the page draws and speaks them. */
export interface PairFigures {
  party: string;
  name: string;
  money: number;
  /** "41% · 1,234 speeches", counts only under the thin base; null if none. */
  speech: string | null;
  /** The matrix did not load: speeches are unknown, never zero. */
  speechMissing: boolean;
}
export const pairMoneyText = (row: Pick<PairFigures, 'party' | 'money'>) =>
  row.money > 0
    ? `Money: ${formatMoney(row.money)}`
    : row.party === 'Independent'
      ? 'Money: Not separated'
      : 'Money: None disclosed';
export const pairSpeechText = (
  row: Pick<PairFigures, 'speech' | 'speechMissing'>,
) =>
  row.speechMissing
    ? 'Speeches: Not loaded'
    : row.speech
      ? `Speeches: ${row.speech}`
      : 'Speeches: No speeches recorded';
const spoken = (text: string) =>
  text
    .replace(/<1%/g, 'less than 1 percent')
    .replace(/%/g, ' percent')
    .replace(/ · /g, ', ');

/** The in-tab money map, filtered to this party and the pairing's industry. */
export function pairMoneyRoute(party: string, industry: string | undefined) {
  const route = moneyRoute(party);
  return {
    ...route,
    params: { ...route.params, ...(industry ? { industry } : {}) },
  };
}

/**
 * One party in a subject's pairing: its name as a header that reads both
 * figures to VoiceOver, then a money line (opens the money map filtered to
 * the industry and party, never the web) and a speech line (opens the
 * subject's speeches by that party). A line with nothing to open is text.
 */
export function PairRow({
  row,
  pairing,
}: {
  row: PairFigures;
  pairing: Pick<Pairing, 'topic' | 'industries'>;
}) {
  const stacked = useAccessibilitySize();
  const money = pairMoneyText(row),
    speech = pairSpeechText(row);
  const label = topicLabel(pairing.topic);
  const line = (
    icon: ReactNode,
    text: string,
    href: Href | null,
    testID: string,
  ): ReactNode => {
    const body = (
      <>
        {icon}
        <Text wordSafe variant="body" tabular style={styles.grow}>
          {text}
        </Text>
      </>
    );
    return href ? (
      <RowLink href={href}>
        <Pressable
          accessible
          accessibilityRole="link"
          accessibilityLabel={`${row.name}, ${spoken(text)}`}
          testID={testID}
          style={({ pressed }) => [
            styles.line,
            pressed ? { backgroundColor: colors.sunken } : null,
          ]}
        >
          {body}
          <Icon
            name={symbols.chevron}
            size={13}
            tone="inkSoft"
            maxScale={1.5}
          />
        </Pressable>
      </RowLink>
    ) : (
      <View
        accessible
        accessibilityLabel={`${row.name}, ${spoken(text)}`}
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
        accessibilityLabel={`${row.name}. ${spoken(money)}. ${spoken(speech)}.`}
        style={stacked ? null : styles.header}
      >
        <PartyLabel party={row.name} nested linked={false} />
      </View>
      {line(
        <Icon
          name={symbols.money}
          size={15}
          type="hierarchical"
          ink="money"
          maxScale={1.5}
        />,
        money,
        row.money > 0
          ? (pairMoneyRoute(row.party, pairing.industries[0]) as Href)
          : null,
        `wd-money-${row.party}`,
      )}
      {line(
        <Icon name={symbols.speech} size={15} tone="inkSoft" maxScale={1.5} />,
        speech,
        !row.speechMissing && row.speech
          ? topicRoute(pairing.topic, { party: row.party }, label)
          : null,
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
  grow: { flex: 1 },
});
