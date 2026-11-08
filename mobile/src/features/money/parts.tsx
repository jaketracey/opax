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
import { formatMoney, moneyAccessibilityLabel } from '../../design/format';

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
 * A money row for a party: the party dot leading, then the name, one detail
 * line and the amount trailing, as `MoneyRow` draws every other money row.
 */
export function PartyMoneyRow({
  name,
  detail,
  amount,
  href,
  testID,
}: {
  name: string;
  detail?: string;
  amount: number;
  href?: Href;
  testID?: string;
}) {
  return (
    <LinkRow
      title={name}
      detail={detail}
      value={formatMoney(amount)}
      valueEmphasis
      leading={<PartyDot party={name} />}
      href={href}
      accessory={href ? 'chevron' : 'none'}
      accessibilityLabel={[name, detail, moneyAccessibilityLabel(amount)]
        .filter(Boolean)
        .join(', ')}
      testID={testID}
    />
  );
}

/**
 * Money lists order parties Labor, the Coalition (each party its own row),
 * then Other parties alphabetically (journeys/money.md 12.3 item 1).
 */
export function moneyPartyGroups<T>(
  rows: readonly T[],
  nameOf: (row: T) => string,
) {
  const ordered = byPartyGroup(rows, nameOf, { context: 'money' });
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
