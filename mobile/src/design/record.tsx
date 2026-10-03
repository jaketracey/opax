import { Pressable, StyleSheet, View } from 'react-native';
import { openOnWeb, openSource } from '../navigation/external';
import {
  asAtText,
  formatCount,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  moneyAccessibilityLabel,
  savedText,
  votesAsAtText,
  type AsAt,
  type VotesMeta,
} from './format';
import { Icon } from './icon';
import { Text } from './text';
import { colors, minimumTarget, spacing } from './tokens';

export type AsAtLineProps =
  | (AsAt & { testID?: string; votes?: never })
  | {
      /** W12 `_meta` from votes.json; null before the first export that writes it. */
      votes: VotesMeta | null;
      jurisdiction?: string;
      citation?: string;
      licence?: string;
      savedAt?: number | string | null;
      testID?: string;
    };
/**
 * Under every data block: the source file's own date and the source.
 * "As at 17 September 2026 · Source: Remuneration Tribunal; Parliamentary
 * Handbook". The votes variant reads "Record last changed … · Divisions
 * through …". A saved copy adds "Saved [date]".
 */
export function AsAtLine(props: AsAtLineProps) {
  let text: string;
  if ('votes' in props && props.votes !== undefined) {
    const named = [props.citation, props.licence].filter(Boolean).join(', ');
    text = [
      votesAsAtText(props.votes, props.jurisdiction),
      named ? `Source: ${named}` : null,
      props.savedAt != null ? savedText(props.savedAt) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  } else text = asAtText(props as AsAt);
  return (
    <Text variant="fine" testID={props.testID}>
      {text}
    </Text>
  );
}

export interface SourceLinkProps {
  /**
   * The citation: who holds the record ("They Vote For You", "AusTender
   * register"). `source` is reserved for image sources.
   */
  citation: string;
  /** What the record is: "division, 19 Aug 2026" or "record CN3407266". */
  record?: string;
  url: string;
  /**
   * `record`: a stable page for this exact record. `register`: the source's
   * search or home page; `record` then carries the ID to look up there.
   */
  kind: 'record' | 'register';
  testID?: string;
}
/**
 * A link to the original source, opened in the in-app browser. The label says
 * where it goes: "They Vote For You · division, 19 Aug 2026" or
 * "AusTender register · record CN3407266".
 */
export function SourceLink({
  citation,
  record,
  url,
  kind,
  testID,
}: SourceLinkProps) {
  const label = record ? `${citation} · ${record}` : citation;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${citation}${record ? `, ${record}` : ''}`}
      accessibilityHint={
        kind === 'register' ? 'Opens the register' : 'Opens the source'
      }
      testID={testID}
      onPress={() => openSource(url, label)}
      style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}
    >
      <Text wordSafe variant="body" tone="bronzeInk" style={styles.linkText}>
        {label}
      </Text>
      <Icon name="arrow.up.right.square" size={16} tone="bronzeInk" />
    </Pressable>
  );
}

/**
 * A web-only OPAX page (community, the money map, Methods). It opens in
 * Safari, outside the app, and says so.
 */
export function OpaxWebLink({
  label,
  path,
  testID,
}: {
  label: string;
  /** A path on the public site, such as "/subject/person/anthony-albanese". */
  path: string;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Opens on opax.com.au"
      testID={testID}
      onPress={() => openOnWeb(path, label)}
      style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}
    >
      <View style={styles.linkText}>
        <Text variant="body" tone="bronzeInk">
          {label}
        </Text>
        <Text variant="fine">Opens on opax.com.au</Text>
      </View>
      <Icon name="safari" size={18} tone="bronzeInk" />
    </Pressable>
  );
}

type FigureSize = 'tile' | 'inline';
/** A count or share with tabular figures. Numbers get thousands separators. */
export function Figure({
  value,
  format = 'count',
  label,
  size = 'tile',
  testID,
}: {
  value: number;
  format?: 'count' | 'percent';
  label?: string;
  size?: FigureSize;
  testID?: string;
}) {
  const text = format === 'percent' ? formatPercent(value) : formatCount(value);
  return (
    <FigureLayout
      text={text}
      spoken={
        format === 'percent'
          ? `${formatPercent(value).slice(0, -1)} percent`
          : text
      }
      label={label}
      size={size}
      testID={testID}
    />
  );
}

/**
 * Money with tabular figures. To the dollar for records and rates of pay;
 * `compact` ("$4.2m", "$1.1bn") only in charts and tight figures.
 */
export function MoneyFigure({
  amount,
  compact = false,
  label,
  size = 'tile',
  testID,
}: {
  amount: number;
  compact?: boolean;
  label?: string;
  size?: FigureSize;
  testID?: string;
}) {
  return (
    <FigureLayout
      text={compact ? formatMoneyCompact(amount) : formatMoney(amount)}
      spoken={moneyAccessibilityLabel(amount, compact)}
      label={label}
      size={size}
      testID={testID}
    />
  );
}

function FigureLayout({
  text,
  spoken,
  label,
  size,
  testID,
}: {
  text: string;
  spoken: string;
  label?: string;
  size: FigureSize;
  testID?: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={label ? `${spoken}, ${label}` : spoken}
      testID={testID}
      style={styles.figure}
    >
      <Text variant={size === 'tile' ? 'figure' : 'figureInline'}>{text}</Text>
      {label ? <Text variant="metadata">{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: minimumTarget,
    paddingVertical: spacing.s2,
  },
  linkText: { flex: 1 },
  pressed: { backgroundColor: colors.sunken },
  figure: { gap: spacing.s1 },
});
