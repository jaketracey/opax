import { Pressable } from './pressable';
import { type Href } from 'expo-router';
import { useRecordLink } from '../navigation/record-link';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useOpenAsk } from '../features/ask/open';
import { useRowIsMyMember } from '../features/your-mp/MyMemberContext';
import { openSource } from '../navigation/external';
import { useAccessibilitySize } from './accessibility';
import { Hoverable, useHover } from './adaptive';
import { ContextMenu } from './context-menu';
import { showMenu } from './menu';
import { Disclosure } from './disclosure';
import { designFlags } from './flags';
import {
  cleanRecordTitle,
  formatCount,
  formatDate,
  formatMoney,
  formatMoneyCompact,
  moneyAccessibilityLabel,
  spokenFigures,
  recordTitleStage,
} from './format';
import { EXTERNAL_GLYPH, Icon, type SFSymbol } from './icon';
import { StatusCapsule } from './labels';
import { PartyLabel, personRowSlug, Portrait, YourMPMark } from './people';
import { isPartyLabel } from './party';
import { partyRoute } from '../navigation/routes/people';
import { router } from 'expo-router';
import { partyFromCode } from '../features/bills/party-codes';
import {
  RowLink,
  menuLeaves,
  rowAccessibilityActions,
  rowMenus,
  useRowFollow,
  type RowMenuAction,
} from './row-link';
import {
  ownsRowPadding,
  useRowCellStyle,
  useRowHighlight,
  useRowInset,
} from './row-padding';
import { SelectedMark, selectedWash, splitRowStyles } from './selection';
import { Skeleton } from './states';
import { symbols } from './symbols';
import { Text, textContent } from './text';
import {
  accents,
  colors,
  minimumTarget,
  radii,
  rhythm,
  textStyles,
  type Accent,
} from './tokens';
import type { TermMatch } from '../features/learn/term-map';
import { useTermWords, withTermAction } from './term';

const chevron = 'chevron.right';
const checkmark = 'checkmark';
type External = { url: string; label: string };
type Navigation = {
  href?: Href;
  onPress?: () => void;
  select?: () => void;
  menu?: RowMenuAction[];
};

export interface LinkRowProps extends Navigation {
  title: ReactNode;
  titleLines?: number;
  detailLines?: number;
  titleRole?: import('./tokens').TextVariant;
  secondary?: ReactNode;
  /** Metadata above a full-width title, rather than beside its first line. */
  aboveTitle?: ReactNode;
  leadingAccessory?: ReactNode;
  valueLoading?: boolean;
  detail?: string;
  value?: string;
  /** Money amounts use the stronger trailing figure treatment. */
  valueEmphasis?: boolean;
  symbol?: SFSymbol;
  symbolInk?: Accent | 'navy';
  external?: External | boolean;
  destructive?: boolean;
  disabled?: boolean;
  leading?: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  titleTestID?: string;
  detailTestID?: string;
  dragPath?: string;
  accessory?: 'chevron' | 'checkmark' | 'none';
  accessoryAlign?: 'center' | 'first-line';
  selected?: boolean;
  highlighted?: boolean;
}
export function LinkRow({
  title,
  titleRole = 'body',
  titleLines,
  detailLines,
  secondary,
  aboveTitle,
  leadingAccessory,
  valueLoading = false,
  detail,
  value,
  valueEmphasis = false,
  symbol,
  symbolInk,
  external = false,
  destructive,
  disabled = false,
  leading,
  href,
  onPress,
  select,
  menu,
  accessibilityLabel,
  accessibilityHint,
  testID,
  titleTestID,
  detailTestID,
  dragPath,
  accessory = 'chevron',
  accessoryAlign = 'center',
  selected,
  highlighted,
}: LinkRowProps) {
  const recordLink = useRecordLink(href);
  const stacked = useAccessibilitySize();
  const { fontScale } = useWindowDimensions();
  const [firstLineHeight, setFirstLineHeight] = useState<number | undefined>();
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  const split = selected !== undefined && accessory !== 'checkmark';
  const [hovered, onHover] = useHover();
  const onActivate = select ?? onPress ?? (href ? recordLink.open : undefined);
  const plainTitle = typeof title === 'string' ? title : textContent(title);
  const glyph = symbol;
  const ink = symbolInk;
  useRowInset(glyph ? 44 : 16);
  const press =
    typeof external === 'object'
      ? () => void openSource(external.url, external.label)
      : onPress;
  const row = (
    <Pressable
      accessible
      accessibilityRole={
        href || external ? 'link' : onPress ? 'button' : undefined
      }
      accessibilityLabel={
        accessibilityLabel ??
        [plainTitle, valueLoading ? 'Loading' : value, detail]
          .filter(Boolean)
          .join(', ')
      }
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled,
        ...(selected !== undefined ? { selected } : {}),
      }}
      disabled={disabled}
      testID={testID}
      onPress={select ?? press}
      style={({ pressed }) => [
        styles.row,
        split ? splitRowStyles.bleed : null,
        cellStyle,
        !disabled && split && selected
          ? selectedWash()
          : (pressed || highlighted || hovered) &&
              !disabled &&
              (href || select || press)
            ? { backgroundColor: highlight }
            : null,
      ]}
    >
      {split && selected ? <SelectedMark /> : null}
      {leadingAccessory}
      {glyph ? (
        <Icon
          name={glyph}
          size={20}
          maxScale={1.5}
          tone={
            ink === 'navy'
              ? 'navy'
              : ink && designFlags.categorySymbols
                ? accents[ink].ink
                : 'inkSoft'
          }
          {...(ink ? { type: 'hierarchical' as const } : {})}
        />
      ) : null}
      <View style={[styles.text, stacked ? styles.stacked : styles.inline]}>
        <View style={[styles.titles, stacked ? null : styles.grow]}>
          {aboveTitle}
          <View style={leading ? styles.titleLine : undefined}>
            {leading ? (
              <View
                style={{ height: firstLineHeight, justifyContent: 'center' }}
              >
                {leading}
              </View>
            ) : null}
            {plainTitle ? (
              <Text
                wordSafe
                numberOfLines={titleLines}
                variant={titleRole}
                tone={destructive ? 'danger' : undefined}
                testID={titleTestID}
                style={leading ? styles.grow : undefined}
                onTextLayout={
                  leading
                    ? (event) => {
                        const line = event.nativeEvent.lines[0];
                        if (line) setFirstLineHeight(line.height);
                      }
                    : undefined
                }
              >
                {title}
              </Text>
            ) : null}
          </View>
          {secondary}
          {detail ? (
            <Text
              wordSafe
              numberOfLines={detailLines}
              variant="secondary"
              testID={detailTestID}
            >
              {detail}
            </Text>
          ) : null}
        </View>
        {valueLoading ? (
          <View style={{ width: 44 }}>
            <Skeleton shape="rows" count={1} label="Loading" />
          </View>
        ) : value ? (
          <Text
            wordSafe
            variant={valueEmphasis ? 'strong' : 'body'}
            tabular
            tone={valueEmphasis ? 'ink' : 'inkSoft'}
            style={
              valueEmphasis
                ? {
                    textAlign: 'right',
                    ...(stacked ? { alignSelf: 'flex-end' } : {}),
                  }
                : undefined
            }
          >
            {value}
          </Text>
        ) : null}
      </View>
      {!destructive && accessory === 'checkmark' && selected ? (
        <Icon name={checkmark} size={13} tone="navy" />
      ) : !destructive && !split && accessory === 'chevron' ? (
        <View
          style={
            accessoryAlign === 'first-line'
              ? {
                  alignSelf: 'flex-start',
                  height:
                    firstLineHeight ??
                    textStyles[titleRole].lineHeight * fontScale,
                  justifyContent: 'center',
                }
              : undefined
          }
        >
          <Icon
            name={external ? EXTERNAL_GLYPH : chevron}
            size={13}
            maxScale={1.5}
            tone="inkSoft"
          />
        </View>
      ) : null}
    </Pressable>
  );
  return (
    <Hoverable
      effect="none"
      onActivate={disabled ? undefined : onActivate}
      onHover={disabled ? undefined : onHover}
      drag={dragPath ? { path: dragPath, title: plainTitle } : undefined}
    >
      {href && !disabled ? (
        <RowLink
          href={href}
          menu={menu}
          select={select ?? (split ? onPress : undefined)}
        >
          {row}
        </RowLink>
      ) : (
        row
      )}
    </Hoverable>
  );
}

function ValueRowContent({
  label,
  detail,
  value,
  accessibilitySize,
}: {
  label: string;
  detail?: string;
  value: string;
  accessibilitySize: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const measurementKey = `${fontScale}:${value}`;
  const [width, setWidth] = useState(0);
  const [measuredValue, setMeasuredValue] = useState({
    key: measurementKey,
    width: 0,
  });
  // Reset the measurement in place when text or Dynamic Type changes, keeping
  // the row's native text and accessibility elements mounted.
  const valueWidth =
    measuredValue.key === measurementKey ? measuredValue.width : 0;
  // Leave the label its 35% minimum and the gap. Measure the actual column,
  // including narrower groups and the space reserved for a link's chevron.
  const stacked =
    accessibilitySize ||
    (width > 0 && valueWidth + rhythm.tight > width * 0.65);
  return (
    <View
      style={[styles.text, stacked ? styles.stacked : styles.inline]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {detail ? (
        // The label with a quieter line under it; the value stays beside
        // (or, stacked, under) the pair.
        <View style={[styles.valueWords, stacked ? null : styles.valueLabel]}>
          <Text wordSafe variant="body">
            {label}
          </Text>
          <Text wordSafe variant="secondary">
            {detail}
          </Text>
        </View>
      ) : (
        <Text
          wordSafe
          variant="body"
          style={stacked ? undefined : styles.valueLabel}
        >
          {label}
        </Text>
      )}
      <Text
        wordSafe
        variant="strong"
        tabular
        style={stacked ? styles.stackedValue : styles.value}
        onTextLayout={(event) => {
          const lines = event.nativeEvent.lines;
          // A value wider than the whole column may arrive on several lines.
          // Keep its combined width so stacking does not toggle on each layout.
          if (lines.length) {
            const nextWidth = lines.reduce((sum, line) => sum + line.width, 0);
            setMeasuredValue((previous) =>
              previous.key === measurementKey && previous.width === nextWidth
                ? previous
                : { key: measurementKey, width: nextWidth },
            );
          }
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function ValueRow({
  label,
  detail,
  value,
  href,
  testID,
}: {
  label: string;
  /** A second, quieter line under the label: "6 for, 3 against". */
  detail?: string;
  value: string;
  href?: Href;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  useRowInset();
  const body = (
    <>
      <ValueRowContent
        label={label}
        detail={detail}
        value={value}
        accessibilitySize={stacked}
      />
      {href ? (
        <Icon name={chevron} size={13} maxScale={1.5} tone="inkSoft" />
      ) : null}
    </>
  );
  const props = {
    accessible: true,
    accessibilityLabel: spokenFigures(
      `${label}, ${value}${detail ? `. ${detail}` : ''}`,
    ),
    testID,
  };
  return href ? (
    <RowLink href={href}>
      <Pressable
        {...props}
        accessibilityRole="link"
        style={({ pressed }) => [
          styles.row,
          cellStyle,
          pressed ? { backgroundColor: highlight } : null,
        ]}
      >
        {body}
      </Pressable>
    </RowLink>
  ) : (
    <View {...props} style={[styles.row, cellStyle]}>
      {body}
    </View>
  );
}

export interface BillRowProps {
  /** Today previews; full record lists keep their complete text. */
  preview?: boolean;
  billKey?: string;
  title: string;
  status: string;
  /** The API status for colour when `status` contains the display label. */
  rawStatus?: string;
  date?: string | null;
  showStatus?: boolean;
  dateLabel?: string;
  meta?: { portfolio: string } | { sponsor: string; party: string | null };
  href?: Href;
  menu?: 'bill' | RowMenuAction[];
  onPress?: () => void;
  select?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  dragPath?: string;
  selected?: boolean;
  highlighted?: boolean;
}
function BillLink({
  billKey,
  title,
  href,
  children,
  select,
}: {
  billKey: string;
  title: string;
  href: Href;
  children: React.ReactElement;
  select?: () => void;
}) {
  const follow = useRowFollow('bill', billKey, title);
  const openAsk = useOpenAsk();
  return (
    <RowLink
      href={href}
      select={select}
      menu={rowMenus.bill({
        billKey,
        title,
        ...follow,
        onAsk: () =>
          openAsk({ question: `What does the record say about ${title}?` }),
      })}
    >
      {children}
    </RowLink>
  );
}
/**
 * The text cut to its whole words that fit in `lines` laid-out lines, with
 * an ellipsis, or the whole text when it fits. Line layout breaks between
 * words; the last kept word goes too, so the ellipsis has room on the line.
 */
export function wordClamp(
  text: string,
  laidOut: readonly { text: string }[],
  lines: number,
): string {
  if (laidOut.length <= lines) return text;
  const kept = laidOut
    .slice(0, lines)
    .map((line) => line.text)
    .join('');
  const words = kept.trimEnd().split(/(\s+)/);
  let cut = kept.trimEnd();
  // Free at least two characters for the ellipsis, a whole word at a time.
  while (words.length > 1 && kept.trimEnd().length - cut.length < 2) {
    words.splice(-2, 2);
    cut = words.join('');
  }
  return `${cut.replace(/[\s,;:·–-]+$/u, '')}…`;
}

/**
 * Up to `lines` lines, never cut inside a word (a portfolio at AX sizes).
 * TextKit's tail truncation cuts mid-word ("Infrastructure, Trans…"), so a
 * hidden, unclamped copy at the same width supplies the line breaks.
 */
function WordClampText({
  lines,
  children,
  style,
  ...props
}: Omit<React.ComponentProps<typeof Text>, 'children' | 'numberOfLines'> & {
  lines: number;
  children: string;
}) {
  const [clamped, setClamped] = useState<{ full: string; text: string }>();
  const text = clamped?.full === children ? clamped.text : children;
  return (
    <View style={style}>
      <Text {...props} numberOfLines={lines} ellipsizeMode="tail">
        {text}
      </Text>
      <Text
        {...props}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="word-clamp-probe"
        style={styles.clampProbe}
        onTextLayout={(event) => {
          const next = wordClamp(children, event.nativeEvent.lines, lines);
          setClamped((old) =>
            old?.full === children && old.text === next
              ? old
              : { full: children, text: next },
          );
        }}
      >
        {children}
      </Text>
    </View>
  );
}

export function BillRow({
  preview = false,
  billKey,
  title,
  status,
  rawStatus,
  date,
  dateLabel,
  showStatus = true,
  meta,
  href,
  menu = 'bill',
  onPress,
  select,
  accessibilityLabel,
  accessibilityHint = 'Opens the bill',
  testID,
  dragPath,
  selected,
  highlighted,
}: BillRowProps) {
  const recordLink = useRecordLink(href);
  const stacked = useAccessibilitySize();
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  useRowInset();
  const split = selected !== undefined;
  const [hovered, onHover] = useHover();
  const onActivate = select ?? onPress ?? (href ? recordLink.open : undefined);
  const formattedDate =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatDate(date, 'short') : date;
  const dated = formattedDate
    ? dateLabel
      ? `${dateLabel} ${formattedDate.replace(/^(?:Introduced|Passed|Assented|Lapsed|Status as at)\s+/i, '')}`
      : formattedDate
    : null;
  const who = meta
    ? 'portfolio' in meta
      ? meta.portfolio
      : meta.sponsor
    : null;
  const affiliation =
    meta && 'sponsor' in meta
      ? { party: meta.party, status: 'unknown' as const }
      : null;
  const row = (
    <Pressable
      accessible
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityLabel={
        accessibilityLabel ??
        [title, status, dated, who, affiliation?.party]
          .filter(Boolean)
          .join(', ')
      }
      accessibilityHint={accessibilityHint}
      accessibilityState={selected !== undefined ? { selected } : undefined}
      accessibilityActions={
        affiliation && isPartyLabel(affiliation.party)
          ? [
              {
                name: 'openParty',
                label: `Open ${affiliation.party} party page`,
              },
            ]
          : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'openParty' && affiliation?.party)
          router.push(partyRoute(partyFromCode(affiliation.party)));
      }}
      testID={testID}
      onPress={select ?? onPress}
      style={({ pressed }) => [
        styles.row,
        split ? splitRowStyles.bleed : null,
        cellStyle,
        selected
          ? selectedWash()
          : (pressed || highlighted || hovered) && (href || select || onPress)
            ? { backgroundColor: highlight }
            : null,
      ]}
    >
      {selected ? <SelectedMark /> : null}
      <View style={styles.main}>
        <View style={[styles.line, stacked ? styles.stacked : null]}>
          {showStatus ? (
            <StatusCapsule status={rawStatus ?? status} label={status} />
          ) : null}
          {dated ? (
            <Text wordSafe variant="secondary">
              {dated}
            </Text>
          ) : null}
        </View>
        <Text
          wordSafe={!preview}
          variant="rowRecord"
          // A preview holds three lines to XXXL; from AX1, six, so the bill
          // reads to its distinguishing words (sweep 1, 2.3).
          numberOfLines={preview ? (stacked ? 6 : 3) : undefined}
          ellipsizeMode={preview ? 'tail' : undefined}
          testID={testID && `${testID}-title`}
        >
          {title}
        </Text>
        {preview && affiliation ? (
          <PartyLabel
            {...affiliation}
            linked
            nested
            singleLine
            prefix={who ?? undefined}
            testID={testID && `${testID}-party`}
          />
        ) : who || affiliation ? (
          <View style={[styles.line, stacked ? styles.stacked : null]}>
            {who && preview && stacked ? (
              <WordClampText
                lines={2}
                variant="secondary"
                style={styles.clampColumn}
              >
                {who}
              </WordClampText>
            ) : who ? (
              <Text
                wordSafe={!preview}
                variant="secondary"
                numberOfLines={preview ? 1 : undefined}
                ellipsizeMode={preview ? 'tail' : undefined}
                style={preview ? { flex: 1 } : undefined}
              >
                {who}
              </Text>
            ) : null}
            {affiliation ? (
              <PartyLabel
                {...affiliation}
                linked
                nested
                testID={testID && `${testID}-party`}
              />
            ) : null}
          </View>
        ) : null}
      </View>
      {!split ? (
        <Icon name={chevron} size={13} maxScale={1.5} tone="inkSoft" />
      ) : null}
    </Pressable>
  );
  const link = href ? (
    menu === 'bill' && billKey ? (
      <BillLink
        billKey={billKey}
        title={title}
        href={href}
        select={select ?? (selected !== undefined ? onPress : undefined)}
      >
        {row}
      </BillLink>
    ) : (
      <RowLink
        href={href}
        menu={Array.isArray(menu) ? menu : undefined}
        select={select ?? (selected !== undefined ? onPress : undefined)}
      >
        {row}
      </RowLink>
    )
  ) : (
    row
  );
  return (
    <Hoverable
      effect="none"
      onActivate={onActivate}
      onHover={onHover}
      drag={dragPath ? { path: dragPath, title } : undefined}
    >
      {link}
    </Hoverable>
  );
}

export interface RecordRowProps {
  meta: string;
  title?: string;
  showTitle?: boolean;
  compact?: boolean;
  excerpt?: { text: string; highlight?: string[] } | null;
  speaker?: {
    name: string;
    party: string | null;
    href?: Href;
    portrait?: ReactNode;
    linkedParty?: boolean;
  } | null;
  href?: Href;
  /** Selects a source or opens it in the reader's detail pane. */
  onPress?: () => void;
  accessibilityHint?: string;
  selected?: boolean;
  leading?: { content: ReactNode; label: string };
  /** A URL to open, or just the glyph when onPress owns deferred navigation. */
  external?: External | boolean;
  menu?: 'record' | RowMenuAction[];
  testID?: string;
}
function Highlight({ text, words }: { text: string; words?: string[] }) {
  if (!words?.length) return <>{text}</>;
  const escaped = words
    .filter(Boolean)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escaped.length) return <>{text}</>;
  return (
    <>
      {text
        .split(new RegExp(`(${escaped.join('|')})`, 'gi'))
        .map((part, index) =>
          words.some(
            (word) =>
              word.toLocaleLowerCase('en-AU') ===
              part.toLocaleLowerCase('en-AU'),
          ) ? (
            <Text
              key={index}
              variant="rowRecord"
              style={{ backgroundColor: colors.navyWash }}
            >
              {part}
            </Text>
          ) : (
            part
          ),
        )}
    </>
  );
}
export function RecordRow({
  meta,
  title = '',
  showTitle = true,
  compact = false,
  excerpt,
  speaker,
  href,
  onPress,
  accessibilityHint,
  selected,
  leading,
  external,
  menu = 'record',
  testID,
}: RecordRowProps) {
  const stacked = useAccessibilitySize();
  const [expanded, setExpanded] = useState(false);
  const [excerptLines, setExcerptLines] = useState({ text: '', count: 0 });
  const truncated =
    excerptLines.text === excerpt?.text && excerptLines.count > 3;
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  const recordLink = useRecordLink(href);
  const speakerLink = useRecordLink(speaker?.href);
  const speakerYourMP = useRowIsMyMember(
    personRowSlug(speaker?.href, speaker?.portrait),
  );
  const separateSpeaker =
    !!speaker?.href || (!!speaker?.linkedParty && isPartyLabel(speaker.party));
  useRowInset(leading && !stacked ? 46 : 16);
  const clean = cleanRecordTitle(title);
  const stage = recordTitleStage(title);
  const datedKind =
    stage &&
    !meta.toLocaleLowerCase('en-AU').includes(stage.toLocaleLowerCase('en-AU'))
      ? `${meta} · ${stage}`
      : meta;
  const label = [
    leading?.label,
    datedKind,
    showTitle ? clean : null,
    excerpt?.text,
    speaker?.name,
    speaker?.party,
    !speaker?.href && speakerYourMP ? 'Your MP' : null,
  ]
    .filter(Boolean)
    .join(', ');
  const path =
    typeof href === 'string'
      ? href
      : href && 'params' in href && href.params && 'slug' in href.params
        ? `/doc/${href.params.slug}`
        : '';
  const actions =
    menu === 'record'
      ? href
        ? rowMenus.record({ title: clean || meta, path })
        : undefined
      : menu;
  const open =
    onPress ??
    (href
      ? recordLink.open
      : typeof external === 'object'
        ? () => void openSource(external.url, external.label)
        : undefined);
  const Content = separateSpeaker ? Pressable : View;
  const row = (
    <Pressable
      accessible={!separateSpeaker}
      accessibilityRole={
        !separateSpeaker && (href || external || onPress) ? 'link' : undefined
      }
      accessibilityState={selected === undefined ? undefined : { selected }}
      accessibilityLabel={separateSpeaker ? undefined : label}
      accessibilityHint={separateSpeaker ? undefined : accessibilityHint}
      testID={separateSpeaker && testID ? `${testID}-container` : testID}
      onPress={separateSpeaker || external || onPress ? open : undefined}
      onLongPress={
        separateSpeaker && actions?.length
          ? () => showMenu('', menuLeaves(actions))
          : undefined
      }
      style={({ pressed }) => [
        styles.row,
        cellStyle,
        (pressed && (href || external || onPress)) || selected
          ? { backgroundColor: highlight }
          : null,
      ]}
    >
      {leading?.content}
      <View style={styles.main}>
        <Content
          {...(separateSpeaker
            ? {
                accessible: true,
                accessibilityRole:
                  href || external || onPress ? ('link' as const) : undefined,
                accessibilityLabel: label,
                accessibilityHint,
                accessibilityState:
                  selected === undefined ? undefined : { selected },
                testID,
                onPress: (
                  event: import('react-native').GestureResponderEvent,
                ) => {
                  event.stopPropagation();
                  open?.();
                },
                onLongPress: actions?.length
                  ? () => showMenu('', menuLeaves(actions))
                  : undefined,
                accessibilityActions: rowAccessibilityActions(actions ?? []),
                onAccessibilityAction: (
                  event: import('react-native').AccessibilityActionEvent,
                ) =>
                  menuLeaves(actions ?? [])
                    .find(
                      (action) => action.title === event.nativeEvent.actionName,
                    )
                    ?.onPress(),
              }
            : {})}
          style={[
            styles.recordContent,
            separateSpeaker ? styles.recordTarget : null,
          ]}
        >
          <Text wordSafe variant="secondary">
            {datedKind}
          </Text>
          {showTitle && clean ? (
            <Text wordSafe variant="rowRecord">
              {clean}
            </Text>
          ) : null}
          {excerpt ? (
            <View>
              {!expanded || compact ? (
                <Text
                  variant="recordText"
                  numberOfLines={compact && stacked ? 2 : 3}
                >
                  <Highlight text={excerpt.text} words={excerpt.highlight} />
                </Text>
              ) : null}
              {!compact ? (
                <Text
                  variant="recordText"
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    opacity: 0,
                  }}
                  onTextLayout={({ nativeEvent }) => {
                    const count = nativeEvent.lines.length;
                    setExcerptLines((current) =>
                      current.text === excerpt.text && current.count === count
                        ? current
                        : { text: excerpt.text, count },
                    );
                    if (nativeEvent.lines.length <= 3) setExpanded(false);
                  }}
                >
                  <Highlight text={excerpt.text} words={excerpt.highlight} />
                </Text>
              ) : null}
            </View>
          ) : null}
        </Content>
        {speaker ? (
          <View style={styles.recordSpeakerSlot}>
            {speaker.portrait}
            <View style={styles.recordSpeakerWords}>
              {speaker.href ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${speaker.name}${speakerYourMP ? ', Your MP' : ''}`}
                  testID={testID && `${testID}-speaker`}
                  onPress={(event) => {
                    event.stopPropagation();
                    speakerLink.open();
                  }}
                  style={[
                    styles.recordSpeaker,
                    speaker.party ? styles.recordSpeakerNameEnd : null,
                  ]}
                >
                  <Text wordSafe variant="secondary" tone="link">
                    {speaker.name}
                  </Text>
                </Pressable>
              ) : (
                <View
                  style={speaker.party ? styles.recordSpeakerNameEnd : null}
                >
                  <Text
                    wordSafe
                    variant="secondary"
                    testID={testID && `${testID}-speaker`}
                  >
                    {speaker.name}
                  </Text>
                </View>
              )}
              {speaker.party ? (
                <View style={styles.recordSpeakerParty}>
                  <PartyLabel
                    party={speaker.party}
                    status="unknown"
                    nested
                    compact
                    linked={speaker.linkedParty ?? false}
                    testID={testID && `${testID}-speaker-party`}
                  />
                </View>
              ) : null}
              {speakerYourMP ? (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <YourMPMark testID={testID && `${testID}-speaker-your-mp`} />
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
      {href || external || onPress ? (
        <Icon
          name={external ? EXTERNAL_GLYPH : chevron}
          size={13}
          maxScale={1.5}
          tone="inkSoft"
        />
      ) : null}
    </Pressable>
  );
  // A RowLink groups its descendants for VoiceOver. Keep the speaker beside
  // the reader's accessible target, within an ungrouped touchable row.
  const linked =
    href && !separateSpeaker ? (
      <RowLink href={href} menu={actions} select={onPress}>
        {row}
      </RowLink>
    ) : (
      row
    );
  return (
    <>
      {linked}
      {excerpt && !compact && truncated ? (
        <Disclosure label="More" open={expanded} onToggle={setExpanded}>
          <Text variant="recordText">
            <Highlight text={excerpt.text} words={excerpt.highlight} />
          </Text>
        </Disclosure>
      ) : null}
    </>
  );
}

export interface DivisionRowProps {
  title: string;
  meta: string;
  outcome: 'Agreed' | 'Not agreed' | 'Voted for' | 'Voted against';
  ayes: number;
  noes: number;
  countsStyle: 'votes' | 'ayesNoes';
  href?: Href;
  menu?: RowMenuAction[];
  testID?: string;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
  split?: { ayes: number; noes: number; partyVote?: 'aye' | 'no' };
  /**
   * The vote bar under the outcome. Off for a block vote, where one colour
   * across the column only repeats the sentence above it. On by default.
   */
  bar?: boolean;
  /**
   * A sentence in place of the counts line, such as "Labor: all 25 against".
   * VoiceOver hears it in place of the counts. Off by default.
   */
  votesLine?: string;
  /** The glossary term in `meta` ("Second reading"), marked inline. */
  metaTerm?: TermMatch | null;
}
export function DivisionRow({
  title,
  meta,
  outcome,
  ayes,
  noes,
  countsStyle,
  href,
  menu,
  testID,
  expandable = false,
  expanded: controlledExpanded,
  onToggle,
  children,
  split,
  bar = true,
  votesLine,
  metaTerm,
}: DivisionRowProps) {
  const metaWords = useTermWords(meta, metaTerm?.term, metaTerm?.phrase);
  const termAction = withTermAction(
    href ? [] : rowAccessibilityActions(menu ?? []),
    metaTerm?.term,
  );
  const [localExpanded, setExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const toggleExpanded = onToggle ?? (() => setExpanded((value) => !value));
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  useRowInset();
  const votes = split ?? { ayes, noes };
  const countWord = (count: number, singular: string, plural: string) =>
    `${formatCount(count)} ${count === 1 ? singular : plural}`;
  const counts =
    countsStyle === 'votes'
      ? votes.ayes && votes.noes
        ? `${countWord(votes.ayes, 'vote', 'votes')} to ${formatCount(votes.noes)}`
        : countWord(votes.ayes || votes.noes, 'vote', 'votes')
      : [
          votes.ayes ? countWord(votes.ayes, 'aye', 'ayes') : null,
          votes.noes ? countWord(votes.noes, 'no', 'noes') : null,
        ]
          .filter(Boolean)
          .join(', ') || 'No votes';
  const spokenCounts =
    countsStyle === 'ayesNoes'
      ? [
          votes.ayes ? countWord(votes.ayes, 'aye', 'ayes') : 'no ayes',
          votes.noes ? countWord(votes.noes, 'no', 'noes') : 'no noes',
        ].join(', ')
      : counts;
  const party = split?.partyVote
    ? `Party voted ${split.partyVote === 'aye' ? 'for' : 'against'}`
    : null;
  const row = (
    <Pressable
      accessible
      accessibilityRole={expandable ? 'button' : href ? 'link' : undefined}
      accessibilityLabel={[
        title,
        // A no-break date is for layout; VoiceOver hears plain words.
        meta.replace(/\u00a0/g, ' '),
        outcome,
        votesLine ?? spokenCounts,
        party,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={expandable ? { expanded } : undefined}
      testID={testID}
      onPress={expandable ? () => toggleExpanded() : undefined}
      accessibilityActions={
        // A linked row's own actions come from its link; it adds only the term's.
        href && !metaTerm ? undefined : termAction.actions
      }
      onAccessibilityAction={(event) => {
        if (termAction.handle(event.nativeEvent.actionName)) return;
        menuLeaves(menu ?? [])
          .find((action) => action.title === event.nativeEvent.actionName)
          ?.onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        cellStyle,
        pressed && (href || expandable) ? { backgroundColor: highlight } : null,
      ]}
    >
      <View style={[styles.main, styles.divisionMain]}>
        <Text wordSafe variant="rowRecord">
          {title}
        </Text>
        <Text wordSafe variant="secondary">
          {metaWords}
        </Text>
        <StatusCapsule status={outcome} />
        {bar ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.voteBar}
            testID={testID && `${testID}-bar`}
          >
            <View
              style={{
                flex: Math.max(0, votes.ayes),
                backgroundColor: colors.ink,
              }}
            />
            <View
              style={{
                flex: Math.max(0, votes.noes),
                backgroundColor: colors.inkFaint,
              }}
            />
          </View>
        ) : null}
        <Text wordSafe variant="secondary">
          {votesLine ?? counts}
        </Text>
        {party ? (
          <Text wordSafe variant="secondary">
            {party}
          </Text>
        ) : null}
      </View>
      {expandable || href ? (
        <Icon
          name={expandable ? symbols.chevronDown : chevron}
          size={13}
          maxScale={1.5}
          tone="inkSoft"
        />
      ) : null}
    </Pressable>
  );
  return (
    <>
      {href ? (
        <RowLink
          href={href}
          select={expandable ? () => toggleExpanded() : undefined}
          menu={menu}
        >
          {row}
        </RowLink>
      ) : menu?.length ? (
        <ContextMenu items={menu}>{row}</ContextMenu>
      ) : (
        row
      )}
      {expandable && expanded ? (
        <View testID={testID && `${testID}-body`} style={styles.expansion}>
          {children}
        </View>
      ) : null}
    </>
  );
}

export function MoneyRow({
  name,
  nameLines,
  detail,
  amount,
  href,
  external,
  compact = false,
  testID,
}: {
  name: string;
  nameLines?: number;
  detail?: string;
  amount: number;
  href?: Href;
  external?: External;
  /**
   * Every amount compact ("$9.4m"), for a ranked list that must read one
   * way. The accessibility label uses the same rounding as the figure.
   */
  compact?: boolean;
  testID?: string;
}) {
  const rounded = compact || Math.abs(amount) >= 10_000_000;
  return (
    <LinkRow
      title={name}
      detail={detail}
      titleLines={nameLines}
      detailLines={2}
      value={rounded ? formatMoneyCompact(amount) : formatMoney(amount)}
      valueEmphasis
      href={href}
      external={external}
      accessory={href || external ? 'chevron' : 'none'}
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

/** Shared by Search's live suggestions and Ask's suggestions. */
export function SuggestionRow({
  name,
  secondary,
  symbol,
  portrait,
  kind,
  matches,
  href,
  onPress,
  menu,
  accessibilityHint,
  testID,
}: {
  name: string;
  secondary?: string;
  symbol?: SFSymbol;
  portrait?: string | null;
  kind?: 'person' | 'bill' | 'electorate' | 'party' | 'topic';
  matches?: string[];
  href?: Href;
  onPress?: () => void;
  menu?: RowMenuAction[];
  accessibilityHint?: string;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  const person = portrait !== undefined || kind === 'person';
  const glyph =
    symbol ??
    (
      {
        person: 'person.crop.circle',
        bill: 'doc.text',
        electorate: 'map',
        party: 'person.3',
        topic: 'number',
      } as const
    )[kind ?? 'topic'];
  useRowInset(stacked ? 16 : person ? 52 : 44);
  const row = (
    <Pressable
      accessible
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityLabel={[name, secondary].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        cellStyle,
        pressed && (href || onPress) ? { backgroundColor: highlight } : null,
      ]}
    >
      <View style={[styles.suggestion, stacked ? styles.stacked : null]}>
        {person ? (
          <Portrait size={28} uri={portrait} />
        ) : (
          <Icon name={glyph} size={20} maxScale={1.5} tone="inkSoft" />
        )}
        <View style={styles.main}>
          <Text wordSafe variant={kind === 'bill' ? 'rowRecord' : 'body'}>
            {matches?.length ? (
              <SuggestionName name={name} matches={matches} />
            ) : (
              name
            )}
          </Text>
          {secondary ? (
            <Text wordSafe variant="secondary">
              {secondary}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
  return href ? (
    <RowLink href={href} menu={menu}>
      {row}
    </RowLink>
  ) : (
    row
  );
}
function SuggestionName({
  name,
  matches,
}: {
  name: string;
  matches: string[];
}) {
  const escaped = matches
    .filter(Boolean)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escaped.length) return <>{name}</>;
  return (
    <>
      {name
        .split(new RegExp(`(${escaped.join('|')})`, 'gi'))
        .map((part, index) =>
          matches.some(
            (match) => match.toLowerCase() === part.toLowerCase(),
          ) ? (
            <Text key={index} variant="strong">
              {part}
            </Text>
          ) : (
            part
          ),
        )}
    </>
  );
}

const styles = StyleSheet.create({
  clampColumn: { alignSelf: 'stretch' },
  clampProbe: { position: 'absolute', left: 0, right: 0, opacity: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  text: { flex: 1, gap: rhythm.tight },
  inline: { flexDirection: 'row', alignItems: 'center' },
  stacked: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
  },
  titles: { gap: rhythm.line, alignSelf: 'stretch', flexShrink: 1 },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.tight,
  },
  grow: { flex: 1 },
  // Wrap the label while keeping the figure's natural width.
  valueLabel: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: '35%',
  },
  valueWords: { gap: rhythm.line },
  value: { flexShrink: 0, textAlign: 'right' },
  stackedValue: { flexShrink: 0 },
  main: { flexGrow: 1, flexShrink: 1, gap: rhythm.line },
  // A division's words take the column left beside the chevron, never their
  // own unwrapped width: at AX3 and AX5 an auto basis let a long stage or
  // count line run past the column, cut mid-letter (BACKLOG D9).
  divisionMain: { flexBasis: 0, minWidth: 0 },
  recordContent: { gap: rhythm.line },
  recordTarget: { minHeight: minimumTarget, minWidth: minimumTarget },
  recordSpeakerSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  recordSpeakerWords: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    gap: rhythm.line,
  },
  recordSpeaker: {
    minHeight: minimumTarget,
    minWidth: minimumTarget,
    justifyContent: 'center',
    flexShrink: 1,
  },
  // Keep the text close while the two links retain separate full-size targets.
  recordSpeakerNameEnd: {
    minHeight: minimumTarget,
    justifyContent: 'flex-end',
  },
  recordSpeakerParty: { minHeight: minimumTarget },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.tight,
    rowGap: rhythm.line,
  },
  suggestion: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.tight,
  },
  voteBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  expansion: { paddingVertical: rhythm.tight, gap: rhythm.tight },
});
[
  LinkRow,
  ValueRow,
  BillRow,
  RecordRow,
  DivisionRow,
  MoneyRow,
  SuggestionRow,
].forEach(ownsRowPadding);
