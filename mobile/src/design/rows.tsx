import { useRef, type ReactNode } from 'react';
import { ownsRowPadding } from './row-padding';
import { showMenu } from './menu';
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  findNodeHandle,
} from 'react-native';
import { openOnWeb, openSource } from '../navigation/external';
import { useAccessibilitySize } from './accessibility';
import { Hoverable, useHover } from './adaptive';
import { EXTERNAL_GLYPH, Icon, type SFSymbol } from './icon';
import { StatusLabel } from './labels';
import type { PartyContext } from './party';
import { PartyLabel } from './people';
import { SelectedMark, selectedWash, splitRowStyles } from './selection';
import { SourceAffordance } from './source';
import { Text } from './text';
import {
  accents,
  colors,
  minimumTarget,
  radii,
  rhythm,
  type Accent,
} from './tokens';

/**
 * A compact navigation row: an optional tinted symbol, a title, an optional
 * detail line or trailing value, and a chevron (or ↗ for anything that
 * leaves the app). 44pt minimum; the whole row is one VoiceOver button.
 */
export function LinkRow({
  title,
  detail,
  value,
  icon,
  accent,
  external = false,
  disabled = false,
  leading,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
  titleTestID,
  detailTestID,
  dragPath,
  selected,
  highlighted = false,
}: {
  title: string;
  detail?: string;
  value?: string;
  icon?: SFSymbol;
  accent?: Accent;
  /** Leaves the app (opax.com.au, an original): ↗, not a chevron. */
  external?: boolean;
  disabled?: boolean;
  /** Drawn before the title instead of an icon tile: a "For" label, a chip. */
  leading?: ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  titleTestID?: string;
  detailTestID?: string;
  dragPath?: string;
  /**
   * In an iPad split list: true for the row shown in the detail pane, false
   * for the others (no chevron; the pane is the destination). Undefined is
   * an ordinary navigation row.
   */
  selected?: boolean;
  /** The keyboard's place in a split list: drawn as the hover tint. */
  highlighted?: boolean;
}) {
  const stacked = useAccessibilitySize();
  const [hovered, onHover] = useHover();
  const inSplit = selected !== undefined;
  return (
    <Hoverable
      effect="none"
      onHover={disabled ? undefined : onHover}
      onActivate={disabled ? undefined : onPress}
      drag={dragPath ? { path: dragPath, title } : undefined}
    >
      <Pressable
        accessibilityRole={external ? 'link' : 'button'}
        accessibilityLabel={
          accessibilityLabel ??
          [title, value, detail].filter(Boolean).join(', ')
        }
        accessibilityHint={accessibilityHint}
        accessibilityState={inSplit ? { disabled, selected } : { disabled }}
        disabled={disabled}
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          inSplit ? splitRowStyles.bleed : null,
          selected
            ? selectedWash(accent)
            : pressed || ((hovered || highlighted) && !disabled)
              ? { backgroundColor: colors.sunken }
              : null,
        ]}
      >
        {selected ? <SelectedMark accent={accent} /> : null}
        {icon ? <IconTile name={icon} accent={accent} /> : null}
        <View style={[styles.text, stacked ? styles.stacked : styles.inline]}>
          <View style={[styles.titles, stacked ? null : styles.grow]}>
            {leading}
            <Text wordSafe variant="strong" testID={titleTestID}>
              {title}
            </Text>
            {detail ? (
              <Text wordSafe variant="metadata" testID={detailTestID}>
                {detail}
              </Text>
            ) : null}
          </View>
          {value ? (
            <Text variant="strong" tabular tone="inkSoft">
              {value}
            </Text>
          ) : null}
        </View>
        {inSplit && !external ? null : (
          <Icon
            name={external ? EXTERNAL_GLYPH : 'chevron.right'}
            size={external ? 16 : 13}
            tone={external ? 'navy' : 'inkSoft'}
          />
        )}
      </Pressable>
    </Hoverable>
  );
}

const TILE_SCALE = 1.35;
/** A rounded tile with a tinted SF Symbol: section and row identity. */
export function IconTile({
  name,
  accent,
  size = 'row',
}: {
  name: SFSymbol;
  accent?: Accent;
  size?: 'row' | 'section';
}) {
  const tone = accent ? accents[accent] : accents.people;
  // The tile and its symbol grow a little with text size, never past 1.35x.
  const { fontScale } = useWindowDimensions();
  const scale = Math.min(Math.max(fontScale, 1), TILE_SCALE);
  const box = Math.round((size === 'section' ? 30 : 28) * scale);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.tile,
        {
          width: box,
          height: box,
          backgroundColor: colors[tone.wash],
        },
      ]}
    >
      <Icon
        name={name}
        size={size === 'section' ? 16 : 15}
        maxScale={TILE_SCALE}
        tone={tone.ink}
      />
    </View>
  );
}

/**
 * One bill in a list, the same on Today and in Bills (P2-8): its status and
 * date on one line, the title in the record's serif (`subheading`, never cut
 * short, never broken mid-word), then who brought it: a portfolio, or a
 * sponsor with their party as a dot and its name (never a bare code). One
 * VoiceOver element that opens the bill; a chevron, or in an iPad split
 * list the selected wash and no chevron. Callers say the words: the status
 * in sentence case, the date ("Introduced 17 Sep"), the spoken label.
 */
export function BillRow({
  title,
  status,
  date,
  by,
  party,
  detail,
  onPress,
  accessibilityLabel,
  accessibilityHint = 'Opens the bill',
  testID,
  dragPath,
  selected,
  highlighted = false,
}: {
  /** The bill's title as the record has it. */
  title: string;
  /** The recorded status word, in sentence case ("Passed both houses"). */
  status: string;
  /** Beside the status: "Introduced 17 Sep 2026". */
  date?: string | null;
  /** Who brought it: the portfolio, or the sponsor's name. */
  by?: string | null;
  /** The sponsor's party, drawn after `by` as a nested PartyLabel. */
  party?: PartyContext | null;
  /** One more metadata line: the chamber, "House of Representatives". */
  detail?: string | null;
  onPress: () => void;
  /** The whole row as VoiceOver says it: title, status, date, who. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  testID?: string;
  /** "/bill/<key>", for dragging on iPad. */
  dragPath?: string;
  /** In an iPad split list: true for the bill in the detail pane. */
  selected?: boolean;
  /** The keyboard's place in a split list. */
  highlighted?: boolean;
}) {
  const stacked = useAccessibilitySize();
  const [hovered, onHover] = useHover();
  const inSplit = selected !== undefined;
  return (
    <Hoverable
      effect="none"
      onHover={onHover}
      onActivate={onPress}
      drag={dragPath ? { path: dragPath, title } : undefined}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={inSplit ? undefined : accessibilityHint}
        accessibilityState={inSplit ? { selected } : undefined}
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [
          styles.bill,
          inSplit ? splitRowStyles.bleed : null,
          selected
            ? selectedWash()
            : pressed || hovered || highlighted
              ? { backgroundColor: colors.sunken }
              : null,
        ]}
      >
        {selected ? <SelectedMark /> : null}
        <View style={styles.billMain}>
          <View style={[styles.billLine, stacked ? styles.billStacked : null]}>
            <StatusLabel label={status} hidden />
            {date ? (
              <Text wordSafe variant="fine">
                {date}
              </Text>
            ) : null}
          </View>
          <Text
            wordSafe
            variant="subheading"
            testID={testID && `${testID}-title`}
          >
            {title}
          </Text>
          {by || party ? (
            <View
              style={[styles.billLine, stacked ? styles.billStacked : null]}
            >
              {by ? (
                <Text wordSafe variant="metadata">
                  {by}
                </Text>
              ) : null}
              {party ? <PartyLabel {...party} linked={false} nested /> : null}
            </View>
          ) : null}
          {detail ? (
            <Text wordSafe variant="metadata">
              {detail}
            </Text>
          ) : null}
        </View>
        {inSplit ? null : (
          <Icon name="chevron.right" size={13} tone="inkSoft" />
        )}
      </Pressable>
    </Hoverable>
  );
}

export interface Original {
  /** Who holds the record: "They Vote For You", "Register of interests". */
  label: string;
  /** An https source, or an OPAX web path ("/subject/person/…"). */
  url: string;
}
/**
 * @deprecated A block's originals belong in its SourceLine (`originals`),
 * listed in the source sheet. This adapter draws the source line's anatomy
 * ("View original", 32pt drawn, 44pt to touch, full width at accessibility
 * sizes). With one source it opens it; with several, a native menu names
 * each one.
 */
export function ViewOriginal({
  sources,
  label = 'View original',
  testID,
  children,
}: {
  sources: readonly Original[];
  label?: string;
  testID?: string;
  children?: ReactNode;
}) {
  const anchor = useRef<View>(null);
  const usable = sources.filter(
    (s, i) =>
      (s.url.startsWith('https://') || s.url.startsWith('/')) &&
      sources.findIndex((o) => o.url === s.url) === i,
  );
  if (!usable.length) return children ? <>{children}</> : null;
  const open = (s: Original) =>
    s.url.startsWith('/')
      ? openOnWeb(s.url, s.label)
      : openSource(s.url, s.label);
  const press = () => {
    if (usable.length === 1) {
      void open(usable[0]!);
      return;
    }
    showMenu(
      'Original records',
      usable.map((source) => ({
        title: source.label,
        onPress: () => void open(source),
      })),
      findNodeHandle(anchor.current) ?? undefined,
    );
  };
  return (
    <SourceAffordance
      ref={anchor}
      glyph={usable.length === 1 ? EXTERNAL_GLYPH : 'list.bullet.rectangle'}
      name={label}
      accessibilityRole="link"
      accessibilityLabel={
        usable.length === 1
          ? `${label}: ${usable[0]!.label}`
          : `${label}, ${usable.length} records`
      }
      accessibilityHint={
        usable.length === 1 ? 'Opens the source' : 'Lists the original records'
      }
      testID={testID}
      onPress={press}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
    minHeight: minimumTarget,
    paddingVertical: 6,
  },
  text: { flex: 1, gap: rhythm.tight },
  inline: { flexDirection: 'row', alignItems: 'center' },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  // flex: 1 only beside the value: in a stacked column it would collapse.
  titles: { gap: 2, alignSelf: 'stretch', flexShrink: 1 },
  grow: { flex: 1 },
  bill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
    minHeight: minimumTarget,
    paddingVertical: rhythm.tight,
  },
  // flex: 1 would become a zero height basis if the row ever stacked.
  billMain: { flexGrow: 1, flexShrink: 1, gap: rhythm.line + 2 },
  // Status and date; who and their party. Stacked at accessibility sizes.
  billLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.tight,
    rowGap: rhythm.line,
  },
  billStacked: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
  },
  tile: {
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

ownsRowPadding(LinkRow);
ownsRowPadding(BillRow);
