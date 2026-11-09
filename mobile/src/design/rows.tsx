import { router, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useOpenAsk } from '../features/ask/open';
import { openSource } from '../navigation/external';
import { useAccessibilitySize } from './accessibility';
import { Hoverable, useHover } from './adaptive';
import { ContextMenu } from './context-menu';
import { Disclosure } from './disclosure';
import { designFlags } from './flags';
import {
  cleanRecordTitle,
  formatCount,
  formatDate,
  formatMoney,
  moneyAccessibilityLabel,
  recordTitleStage,
} from './format';
import { EXTERNAL_GLYPH, Icon, type SFSymbol } from './icon';
import { StatusCapsule } from './labels';
import { PartyLabel, Portrait } from './people';
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
  type Accent,
} from './tokens';

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
  titleRole?: import('./tokens').TextVariant;
  secondary?: ReactNode;
  leadingAccessory?: ReactNode;
  valueLoading?: boolean;
  detail?: string;
  value?: string;
  /** Money amounts use the stronger trailing figure treatment. */
  valueEmphasis?: boolean;
  symbol?: SFSymbol;
  symbolInk?: Accent;
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
  selected?: boolean;
  highlighted?: boolean;
}
export function LinkRow({
  title,
  titleRole = 'body',
  secondary,
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
  selected,
  highlighted,
}: LinkRowProps) {
  const stacked = useAccessibilitySize();
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  const split = selected !== undefined && accessory !== 'checkmark';
  const [hovered, onHover] = useHover();
  const onActivate =
    select ?? onPress ?? (href ? () => router.push(href) : undefined);
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
            ink && designFlags.categorySymbols ? accents[ink].ink : 'inkSoft'
          }
          {...(ink ? { type: 'hierarchical' as const } : {})}
        />
      ) : null}
      <View style={[styles.text, stacked ? styles.stacked : styles.inline]}>
        <View style={[styles.titles, stacked ? null : styles.grow]}>
          {leading}
          <Text
            wordSafe
            variant={titleRole}
            tone={destructive ? 'danger' : undefined}
            testID={titleTestID}
          >
            {title}
          </Text>
          {secondary}
          {detail ? (
            <Text wordSafe variant="secondary" testID={detailTestID}>
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
          >
            {value}
          </Text>
        ) : null}
      </View>
      {!destructive && accessory === 'checkmark' && selected ? (
        <Icon name={checkmark} size={13} tone="navy" />
      ) : !destructive && !split && accessory === 'chevron' ? (
        <Icon
          name={external ? EXTERNAL_GLYPH : chevron}
          size={13}
          maxScale={1.5}
          tone="inkSoft"
        />
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

export function ValueRow({
  label,
  value,
  href,
  testID,
}: {
  label: string;
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
      <View style={[styles.text, stacked ? styles.stacked : styles.inline]}>
        <Text wordSafe variant="body" style={stacked ? undefined : styles.grow}>
          {label}
        </Text>
        <Text wordSafe variant="strong" tabular>
          {value}
        </Text>
      </View>
      {href ? (
        <Icon name={chevron} size={13} maxScale={1.5} tone="inkSoft" />
      ) : null}
    </>
  );
  const props = {
    accessible: true,
    accessibilityLabel: `${label}, ${value}`,
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
  billKey?: string;
  title: string;
  status: string;
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
export function BillRow({
  billKey,
  title,
  status,
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
  const stacked = useAccessibilitySize();
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  useRowInset();
  const split = selected !== undefined;
  const [hovered, onHover] = useHover();
  const onActivate =
    select ?? onPress ?? (href ? () => router.push(href) : undefined);
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
          {showStatus ? <StatusCapsule status={status} /> : null}
          {dated ? (
            <Text wordSafe variant="secondary">
              {dated}
            </Text>
          ) : null}
        </View>
        <Text wordSafe variant="rowRecord" testID={testID && `${testID}-title`}>
          {title}
        </Text>
        {who || affiliation ? (
          <View style={[styles.line, stacked ? styles.stacked : null]}>
            {who ? (
              <Text wordSafe variant="secondary">
                {who}
              </Text>
            ) : null}
            {affiliation ? (
              <PartyLabel {...affiliation} linked={false} nested />
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
  speaker?: { name: string; party: string | null } | null;
  href?: Href;
  external?: External;
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
  useRowInset();
  const clean = cleanRecordTitle(title);
  const stage = recordTitleStage(title);
  const datedKind =
    stage &&
    !meta.toLocaleLowerCase('en-AU').includes(stage.toLocaleLowerCase('en-AU'))
      ? `${meta} · ${stage}`
      : meta;
  const row = (
    <Pressable
      accessible
      accessibilityRole={href || external ? 'link' : undefined}
      accessibilityLabel={[
        datedKind,
        showTitle ? clean : null,
        excerpt?.text,
        speaker?.name,
        speaker?.party,
      ]
        .filter(Boolean)
        .join(', ')}
      testID={testID}
      onPress={
        external
          ? () => void openSource(external.url, external.label)
          : undefined
      }
      style={({ pressed }) => [
        styles.row,
        cellStyle,
        pressed && (href || external) ? { backgroundColor: highlight } : null,
      ]}
    >
      <View style={styles.main}>
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
                style={{ position: 'absolute', left: 0, right: 0, opacity: 0 }}
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
        {speaker ? (
          <View style={[styles.line, stacked ? styles.stacked : null]}>
            <Text wordSafe variant="secondary">
              {speaker.name}
            </Text>
            {speaker.party ? (
              <PartyLabel
                party={speaker.party}
                status="unknown"
                nested
                linked={false}
              />
            ) : null}
          </View>
        ) : null}
      </View>
      {href || external ? (
        <Icon
          name={external ? EXTERNAL_GLYPH : chevron}
          size={13}
          maxScale={1.5}
          tone="inkSoft"
        />
      ) : null}
    </Pressable>
  );
  const path =
    typeof href === 'string'
      ? href
      : href && 'params' in href && href.params && 'slug' in href.params
        ? `/doc/${href.params.slug}`
        : '';
  const linked = href ? (
    <RowLink
      href={href}
      menu={
        menu === 'record'
          ? rowMenus.record({ title: clean || meta, path })
          : menu
      }
    >
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
  outcome: 'Agreed to' | 'Not agreed to' | 'Voted for' | 'Voted against';
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
}: DivisionRowProps) {
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
      accessibilityLabel={[title, meta, outcome, spokenCounts, party]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={expandable ? { expanded } : undefined}
      testID={testID}
      onPress={expandable ? () => toggleExpanded() : undefined}
      accessibilityActions={
        href ? undefined : rowAccessibilityActions(menu ?? [])
      }
      onAccessibilityAction={(event) =>
        menuLeaves(menu ?? [])
          .find((action) => action.title === event.nativeEvent.actionName)
          ?.onPress()
      }
      style={({ pressed }) => [
        styles.row,
        cellStyle,
        pressed && (href || expandable) ? { backgroundColor: highlight } : null,
      ]}
    >
      <View style={styles.main}>
        <Text wordSafe variant="rowRecord">
          {title}
        </Text>
        <Text wordSafe variant="secondary">
          {meta}
        </Text>
        <StatusCapsule status={outcome} />
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.voteBar}
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
        <Text wordSafe variant="secondary">
          {counts}
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
  detail,
  amount,
  href,
  external,
  testID,
}: {
  name: string;
  detail?: string;
  amount: number;
  href?: Href;
  external?: External;
  testID?: string;
}) {
  return (
    <LinkRow
      title={name}
      detail={detail}
      value={formatMoney(amount)}
      valueEmphasis
      href={href}
      external={external}
      accessory={href || external ? 'chevron' : 'none'}
      accessibilityLabel={[name, detail, moneyAccessibilityLabel(amount)]
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
  grow: { flex: 1 },
  main: { flexGrow: 1, flexShrink: 1, gap: rhythm.line },
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
