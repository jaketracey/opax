import {
  StyleSheet,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import type { Href } from 'expo-router';
import { LinkRow } from '../../design/primitives';
import { partyDot } from '../../design/party';
import { partyDotSize } from '../../design/people';
import { byPartyGroup, partyGroup } from '../../design/party-groups';
import {
  formatMoney,
  formatMoneyCompact,
  moneyAccessibilityLabel,
} from '../../design/format';

/** A party's colour dot, drawn only (the row says the party). */
export function PartyDot({ party }: { party: string }) {
  const scheme = useColorScheme();
  const colour = partyDot(party, scheme === 'dark' ? 'dark' : 'light');
  const size = partyDotSize(useWindowDimensions().fontScale);
  if (!colour) return null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderCurve: 'continuous',
          backgroundColor: colour,
        },
      ]}
    />
  );
}

/**
 * Rows on a money record read compact from $1 million ("$7.5m", "$2m") and
 * exact below it. VoiceOver uses the same rounding as the row.
 * One rule for a donor's party rows and a party's donor rows, so the pair
 * of pages agree on the same money (sweep 2 item 6.3).
 */
export const ROW_COMPACT_FROM = 1_000_000;
export const rowCompact = (amount: number) =>
  Math.abs(amount) >= ROW_COMPACT_FROM;

/**
 * A money row for a party: the party dot leading, then the name, one detail
 * line and the amount trailing, as `MoneyRow` draws every other money row.
 */
export function PartyMoneyRow({
  name,
  detail,
  amount,
  compact = false,
  href,
  testID,
}: {
  name: string;
  detail?: string;
  amount: number;
  /** The record's rule: compact from $1 million (`rowCompact`). */
  compact?: boolean;
  href?: Href;
  testID?: string;
}) {
  const rounded = compact && rowCompact(amount);
  return (
    <LinkRow
      title={name}
      detail={detail}
      value={rounded ? formatMoneyCompact(amount) : formatMoney(amount)}
      valueEmphasis
      leading={<PartyDot party={name} />}
      href={href}
      accessory={href ? 'chevron' : 'none'}
      accessibilityLabel={[
        name,
        detail,
        moneyAccessibilityLabel(amount, rounded),
      ]
        .filter(Boolean)
        .join(', ')}
      testID={testID}
    />
  );
}

/**
 * Money lists order parties Labor, the Coalition (each party its own row),
 * then Other parties alphabetically (journeys/money.md 12.3 item 1). Given
 * `amountOf`, rows within each of those groups run largest first instead,
 * as a record's rows do (sweep 2 item 6.5); the groups keep their order.
 */
export function moneyPartyGroups<T>(
  rows: readonly T[],
  nameOf: (row: T) => string,
  amountOf?: (row: T) => number,
) {
  const grouped = byPartyGroup(rows, nameOf, { context: 'money' });
  const rank = new Map<string, number>();
  for (const row of grouped) {
    const group = partyGroup(nameOf(row), 'money');
    if (!rank.has(group)) rank.set(group, rank.size);
  }
  const ordered = amountOf
    ? grouped
        .map((row, index) => ({ row, index }))
        .sort(
          (a, b) =>
            rank.get(partyGroup(nameOf(a.row), 'money'))! -
              rank.get(partyGroup(nameOf(b.row), 'money'))! ||
            amountOf(b.row) - amountOf(a.row) ||
            a.index - b.index,
        )
        .map(({ row }) => row)
    : grouped;
  return {
    main: ordered.filter((row) => partyGroup(nameOf(row), 'money') !== 'other'),
    other: ordered.filter(
      (row) => partyGroup(nameOf(row), 'money') === 'other',
    ),
  };
}

const styles = StyleSheet.create({
  dot: { alignSelf: 'center' },
});
