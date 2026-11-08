import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { ownsRowPadding, useRowHighlight } from './row-padding';
import { openOnWeb, openSource } from '../navigation/external';
import { fromWebPath } from '../navigation/routes';
import {
  asAtText,
  formatCount,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  moneyAccessibilityLabel,
  votesAsAtText,
  votesCaptionText,
  type AsAt,
  type DateInput,
  type VotesMeta,
} from './format';
import { useAccessibilitySize } from './accessibility';
import { AUTHORISATION_LINE, CORRECTION_CONTACT } from './authorisation';
import { copy } from './copy';
import { confirmAction } from './menu';
import { copyText } from '../features/records/actions';
import { haptic } from './haptics';
import { EXTERNAL_GLYPH, Icon } from './icon';
import { LinkRow } from './rows';
import { SourceAffordance, SourceLine, type SourceDetails } from './source';
import { Text, type TextTone } from './text';
import {
  accents,
  colors,
  hairline,
  minimumTarget,
  rhythm,
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
 * @deprecated Use `SourceLine`, which also takes the block's originals and
 * notes. This adapter draws a SourceLine: "Updated 4 Oct 2026 · AEC annual
 * returns", opening the source sheet (the as-at date, the sources, the
 * licence and Sources and licences). The votes variant reads "Updated 3 Oct
 * 2026 · They Vote For You · Divisions to 25 Sep 2026". A saved copy adds
 * "Saved [date]". VoiceOver hears the full as-at sentence as before ("As at
 * 4 October 2026 · Source: …"), which the journeys read.
 */
export function AsAtLine(props: AsAtLineProps) {
  if ('votes' in props && props.votes !== undefined) {
    const named = [props.citation, props.licence].filter(Boolean).join(', ');
    const spoken = [
      votesAsAtText(props.votes, props.jurisdiction),
      named ? `Source: ${named}` : null,
    ]
      .filter(Boolean)
      .join('. ');
    const { date, coverage } = votesCaptionParts(
      props.votes,
      props.jurisdiction,
    );
    return (
      <SourceLine
        asOf={props.votes?.content_changed_at ?? null}
        dateLabel={date}
        coverage={coverage}
        citation={props.citation}
        licence={props.licence}
        savedAt={props.savedAt}
        accessibilityLabel={spoken}
        testID={props.testID}
      />
    );
  }
  const at = props as AsAt & { testID?: string };
  // A year-only date ("2021", Census vintages) is said as a year.
  const year =
    typeof at.asOf === 'string' && /^\d{4}$/.test(at.asOf) ? at.asOf : null;
  const spoken = year
    ? asAtText({ ...at, asOf: null }).replace(
        'Date not published',
        `As at ${year}`,
      )
    : asAtText(at);
  return (
    <SourceLine
      asOf={at.asOf}
      citation={at.citation}
      licence={at.licence}
      coverage={at.detail}
      savedAt={at.savedAt}
      accessibilityLabel={spoken}
      testID={at.testID}
    />
  );
}

/** The votes line's date and coverage parts, as votesCaptionText says them. */
function votesCaptionParts(
  meta: VotesMeta | null,
  jurisdiction?: string,
): { date: string | null; coverage: string | null } {
  const caption = votesCaptionText(meta, jurisdiction);
  const [first, ...rest] = caption.split(' · ');
  if (first!.startsWith('Updated ') || first === 'Record date not published')
    return { date: first!, coverage: rest.join(' · ') || null };
  return { date: null, coverage: caption };
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
 * @deprecated A block's originals belong in its SourceLine (`originals`),
 * listed in the source sheet. This adapter draws the source line's anatomy
 * (a glyph and a bronze label, 32pt drawn, 44pt to touch, full width at
 * accessibility sizes) and opens the original directly, as before.
 * VoiceOver hears where it goes: "View original, They Vote For You,
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
  return (
    <SourceAffordance
      glyph={EXTERNAL_GLYPH}
      name={label}
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
      onPress={() => void openSource(url, destination)}
    />
  );
}

/**
 * @deprecated Use `LinkRow` with `external`. A web-only OPAX page
 * (community, the money map, Methods), opened in Safari: a LinkRow with the
 * Safari symbol, which says it leaves the app (VoiceOver: "Opens on
 * opax.com.au"). A path the app reads natively keeps a chevron.
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
    <LinkRow
      title={label}
      external={!nativeReader}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={
        nativeReader ? 'Opens the reader' : 'Opens on opax.com.au'
      }
      testID={testID}
      onPress={() => void openOnWeb(path, label)}
    />
  );
}

type FigureSize = 'tile' | 'inline';
/**
 * @deprecated Use `FigureBlock` for the number a block is about. A count or
 * share with tabular figures; numbers get thousands separators.
 */
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
 * @deprecated Use `FigureBlock` with `formatMoney`. Money with tabular
 * figures. To the dollar for records and rates of pay;
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
      <Text variant={size === 'tile' ? 'tileFigure' : 'strong'} tabular>
        {text}
      </Text>
      {label ? (
        <Text wordSafe variant="secondary">
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
/** @deprecated Use FigureBlock with a required date and source. */
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
        variant="figure"
        tone={accent ? (accents[accent].ink as TextTone) : undefined}
      >
        {value}
      </Text>
      <Text wordSafe variant="secondary" tone="ink">
        {label}
      </Text>
      {detail ? (
        <Text wordSafe variant="secondary">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  figure: { gap: rhythm.line },
  big: { gap: 2 },
});

ownsRowPadding(OpaxWebLink);

export type FigureSource = SourceDetails & {
  asOf: DateInput | null;
  citation: NonNullable<SourceDetails['citation']>;
  testID?: string;
};
/** A figure is always dated, including an explicit unknown date, and sourced. */
export function FigureBlock({
  value,
  ink,
  label,
  caveat,
  source,
  accessibilityLabel,
  testID,
}: {
  value: string;
  ink?: Accent;
  label: string;
  caveat?: string;
  source: FigureSource;
  accessibilityLabel?: string;
  testID?: string;
}) {
  return (
    <View testID={testID} style={{ gap: rhythm.line }}>
      <View
        accessible
        accessibilityLabel={accessibilityLabel ?? `${value}, ${label}`}
      >
        <Text
          wordSafe
          variant="figure"
          tone={ink ? (accents[ink].ink as TextTone) : undefined}
        >
          {value}
        </Text>
        <Text wordSafe variant="secondary">
          {label}
        </Text>
      </View>
      {caveat ? (
        <Text wordSafe variant="footnote">
          {caveat}
        </Text>
      ) : null}
      <SourceLine {...source} />
    </View>
  );
}
export interface StatTileProps {
  value: string;
  label: string;
  ink?: Accent;
  onPress?: () => void;
  testID?: string;
}
const statChevron = 'chevron.right';
export function StatTile({
  value,
  label,
  ink,
  onPress,
  testID,
}: StatTileProps) {
  const highlight = useRowHighlight();
  const body = (
    <>
      <Text
        wordSafe
        variant="tileFigure"
        tone={ink ? (accents[ink].ink as TextTone) : undefined}
      >
        {value}
      </Text>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: rhythm.line }}
      >
        <Text wordSafe variant="footnote" style={{ flexShrink: 1 }}>
          {label}
        </Text>
        {onPress ? (
          <Icon name={statChevron} size={13} maxScale={1.5} tone="inkFaint" />
        ) : null}
      </View>
    </>
  );
  const props = {
    accessible: true,
    accessibilityLabel: `${value}, ${label}`,
    testID,
  };
  return onPress ? (
    <Pressable
      {...props}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        { minHeight: minimumTarget, gap: rhythm.line },
        pressed ? { backgroundColor: highlight } : null,
      ]}
    >
      {body}
    </Pressable>
  ) : (
    <View {...props} style={{ minHeight: minimumTarget, gap: rhythm.line }}>
      {body}
    </View>
  );
}
export function StatStrip({
  tiles,
  testID,
}: {
  tiles: StatTileProps[];
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  return (
    <View
      testID={testID}
      style={{ flexDirection: stacked ? 'column' : 'row', gap: rhythm.block }}
    >
      {tiles.map((tile, index) => (
        <View
          key={tile.testID ?? tile.label}
          style={stacked ? undefined : { flex: 1 }}
        >
          {index ? (
            <View
              style={
                stacked
                  ? {
                      height: hairline,
                      backgroundColor: colors.dividerSubtle,
                      marginBottom: rhythm.block,
                    }
                  : {
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: -rhythm.tight,
                      width: hairline,
                      backgroundColor: colors.dividerSubtle,
                    }
              }
            />
          ) : null}
          <StatTile {...tile} />
        </View>
      ))}
    </View>
  );
}
/** One correction entry point, including a copy fallback when Mail is unavailable. */
export async function openCorrection() {
  try {
    if (await Linking.canOpenURL(CORRECTION_CONTACT)) {
      await Linking.openURL(CORRECTION_CONTACT);
      return;
    }
  } catch {
    /* Offer the address when Mail cannot open. */
  }
  confirmAction(copy.correctionsEmail, [
    {
      title: copy.copyAddress,
      onPress: () => {
        void copyText(copy.correctionsEmail).then((copied) => {
          if (copied) haptic('success');
        });
      },
    },
  ]);
}
export function PageFoot({ variant }: { variant: 'today' | 'authorised' }) {
  const highlight = useRowHighlight();
  return (
    <View style={{ gap: rhythm.tight }}>
      {variant === 'today' ? (
        <Text wordSafe variant="footnote">
          {copy.independence}
        </Text>
      ) : (
        <>
          <View
            style={{ height: hairline, backgroundColor: colors.dividerSubtle }}
          />
          <Text wordSafe variant="footnote">
            {AUTHORISATION_LINE}
          </Text>
          <Text wordSafe variant="footnote">
            We aim to respond within 2 business days.
          </Text>
        </>
      )}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={copy.reportCorrection}
        onPress={() => void openCorrection()}
        style={({ pressed }) => [
          { minHeight: minimumTarget, justifyContent: 'center' },
          pressed ? { backgroundColor: highlight } : null,
        ]}
      >
        <Text wordSafe variant="footnote" tone="navy">
          {variant === 'today'
            ? copy.reportCorrection
            : `Report a correction: ${copy.correctionsEmail}`}
        </Text>
      </Pressable>
    </View>
  );
}
