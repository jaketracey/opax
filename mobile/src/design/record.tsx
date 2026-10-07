import { Pressable, StyleSheet, View } from 'react-native';
import { ownsRowPadding } from './row-padding';
import { openOnWeb, openSource } from '../navigation/external';
import { fromWebPath } from '../navigation/routes';
import {
  asAtText,
  captionText,
  formatCount,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  moneyAccessibilityLabel,
  votesAsAtText,
  votesCaptionText,
  type AsAt,
  type VotesMeta,
} from './format';
import { useAccessibilitySize } from './accessibility';
import { Icon } from './icon';
import { Text, type TextTone } from './text';
import {
  accents,
  colors,
  minimumTarget,
  radius,
  rhythm,
  spacing,
  type Accent,
} from './tokens';

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
 * One quiet caption under a data block: "Updated 4 Oct 2026". The votes
 * variant reads "Updated 3 Oct 2026 · Divisions to 25 Sep 2026". A saved copy
 * adds "Saved [date]". Source names and licences are not printed here (they
 * live on Sources and licences, in About); VoiceOver still hears the full
 * as-at sentence with its sources, so nothing is lost to it.
 */
export function AsAtLine(props: AsAtLineProps) {
  let text: string;
  let spoken: string;
  if ('votes' in props && props.votes !== undefined) {
    text = votesCaptionText(props.votes, props.jurisdiction, props.savedAt);
    const named = [props.citation, props.licence].filter(Boolean).join(', ');
    spoken = [
      votesAsAtText(props.votes, props.jurisdiction),
      named ? `Source: ${named}` : null,
    ]
      .filter(Boolean)
      .join('. ');
  } else {
    const at = props as AsAt;
    text = captionText(at);
    // A year-only date ("2021", Census vintages) is said as a year.
    const year =
      typeof at.asOf === 'string' && /^\d{4}$/.test(at.asOf) ? at.asOf : null;
    spoken = year
      ? asAtText({ ...at, asOf: null }).replace(
          'Date not published',
          `As at ${year}`,
        )
      : asAtText(at);
  }
  return (
    <Text
      wordSafe
      variant="caption"
      accessibilityLabel={spoken}
      testID={props.testID}
    >
      {text}
    </Text>
  );
}

export interface SourceLinkProps {
  /**
   * The citation: who holds the record ("They Vote For You", "AusTender
   * register"). `source` is reserved for image sources. VoiceOver and the
   * destination screen name it; the visible label stays short.
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
  /** The visible label; "View original" by default. */
  label?: string;
  testID?: string;
}
/**
 * A small link to the original record, opened in the in-app browser: an
 * arrow symbol and "View original" (or a short label), never a full-width
 * row. VoiceOver hears where it goes: "View original: They Vote For You,
 * division, 19 Aug 2026".
 */
export function SourceLink({
  citation,
  record,
  url,
  kind,
  label = 'View original',
  testID,
}: SourceLinkProps) {
  const destination = record ? `${citation} · ${record}` : citation;
  // A hugging link's width follows its text, so word-safe sizing could chase
  // its own frame (in a wrapping row above all). At accessibility sizes the
  // link takes its column's full width, a fixed frame for word-safe text; at
  // other sizes the short label never breaks inside a word.
  const fixed = useAccessibilitySize();
  return (
    <Pressable
      accessibilityRole="link"
      // The visible label first (Voice Control says what it sees), then
      // where it goes: "View original, They Vote For You, division, 19 Aug".
      accessibilityLabel={[label, citation, record]
        .filter(
          (part, i, all): part is string => !!part && all.indexOf(part) === i,
        )
        .join(', ')}
      accessibilityHint={
        kind === 'register' ? 'Opens the register' : 'Opens the source'
      }
      testID={testID}
      hitSlop={{ top: 8, bottom: 8 }}
      onPress={() => openSource(url, destination)}
      style={({ pressed }) => [
        styles.small,
        fixed ? styles.fixedWidth : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Icon name="arrow.up.right.square" size={14} tone="bronzeInk" />
      <Text
        wordSafe={fixed}
        variant="kicker"
        tone="bronzeInk"
        style={styles.shrink}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A web-only OPAX page (community, the money map, Methods), opened in
 * Safari: a compact row with the Safari symbol, which says it leaves the app
 * (VoiceOver: "Opens on opax.com.au").
 */
export function OpaxWebLink({
  label,
  accessibilityLabel,
  path,
  testID,
}: {
  label: string;
  /** What VoiceOver says when the visible label needs its context. */
  accessibilityLabel?: string;
  /** A path on the public site, such as "/subject/person/anthony-albanese". */
  path: string;
  testID?: string;
}) {
  const route = fromWebPath(path);
  const nativeReader =
    route?.pathname === '/doc/[slug]' || route?.pathname === '/bill-text/[key]';
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={
        nativeReader ? 'Opens the reader' : 'Opens on opax.com.au'
      }
      testID={testID}
      onPress={() => openOnWeb(path, label)}
      style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}
    >
      <Text wordSafe variant="body" tone="navy" style={styles.shrink}>
        {label}
      </Text>
      <Icon
        name={nativeReader ? 'chevron.right' : 'safari'}
        size={16}
        tone="navy"
      />
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
      {label ? (
        <Text wordSafe variant="metadata">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The number a block is about, in display type: "$1,284,310" over "Claimed
 * expenses, 2017 to 2026". One VoiceOver element: `spoken` (money in words)
 * then the label. The accent tints the figure.
 */
export function BigFigure({
  value,
  spoken,
  label,
  detail,
  accent,
  accessibilityLabel,
  testID,
}: {
  value: string;
  /** What VoiceOver reads for the value: "1,284,310 dollars". */
  spoken?: string;
  label: string;
  detail?: string;
  accent?: Accent;
  /** Overrides "value, label, detail" where a sentence needs its own order. */
  accessibilityLabel?: string;
  testID?: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={
        accessibilityLabel ??
        [spoken ?? value, label, detail].filter(Boolean).join(', ')
      }
      testID={testID}
      style={styles.big}
    >
      <Text
        wordSafe
        variant="display"
        tone={accent ? (accents[accent].ink as TextTone) : undefined}
      >
        {value}
      </Text>
      <Text wordSafe variant="metadata" tone="ink">
        {label}
      </Text>
      {detail ? (
        <Text wordSafe variant="metadata">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  small: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.s2,
    minHeight: 28,
    maxWidth: '100%',
    paddingHorizontal: rhythm.line,
    marginHorizontal: -rhythm.line,
    borderRadius: radius,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: 6,
  },
  shrink: { flexShrink: 1 },
  // The column's full width, whatever row the link sits in.
  fixedWidth: { alignSelf: 'stretch', width: '100%' },
  pressed: { backgroundColor: colors.sunken },
  figure: { gap: spacing.s1 },
  big: { gap: 2 },
});

ownsRowPadding(OpaxWebLink);
