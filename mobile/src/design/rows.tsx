import type { ReactNode } from 'react';
import { ownsRowPadding } from './row-padding';
import { showMenu } from './menu';
import {
  ActionSheetIOS,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { openOnWeb, openSource } from '../navigation/external';
import { useAccessibilitySize } from './accessibility';
import { Icon, type SFSymbol } from './icon';
import { Text } from './text';
import {
  accents,
  colors,
  minimumTarget,
  radius,
  rhythm,
  type Accent,
} from './tokens';

/**
 * A compact navigation row: an optional tinted symbol, a title, an optional
 * detail line or trailing value, and a chevron (or the Safari symbol for a
 * page on opax.com.au). 44pt minimum; the whole row is one VoiceOver button.
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
}: {
  title: string;
  detail?: string;
  value?: string;
  icon?: SFSymbol;
  accent?: Accent;
  /** Leaves the app (opax.com.au in Safari): a Safari symbol, not a chevron. */
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
}) {
  const stacked = useAccessibilitySize();
  return (
    <Pressable
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={
        accessibilityLabel ?? [title, value, detail].filter(Boolean).join(', ')
      }
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.sunken } : null,
      ]}
    >
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
          <Text variant="figureInline" tone="inkSoft">
            {value}
          </Text>
        ) : null}
      </View>
      <Icon
        name={external ? 'safari' : 'chevron.right'}
        size={external ? 16 : 13}
        tone={external ? 'navy' : 'inkSoft'}
      />
    </Pressable>
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

export interface Original {
  /** Who holds the record: "They Vote For You", "Register of interests". */
  label: string;
  /** An https source, or an OPAX web path ("/subject/person/…"). */
  url: string;
}
/**
 * One small "View original" action for a record's original documents. With
 * one source it opens it; with several, a native menu names each one. The
 * source names stay out of the reading flow (Sources and licences, in About,
 * lists every dataset in full).
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
  // Fixed width at accessibility sizes, as SourceLink: the label's frame never
  // follows its own text size.
  const fixed = useAccessibilitySize();
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
    if (Platform.OS === 'android') {
      showMenu(
        'Original records',
        usable.map((source) => ({
          title: source.label,
          onPress: () => void open(source),
        })),
      );
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Original records',
        options: [...usable.map((s) => s.label), 'Cancel'],
        cancelButtonIndex: usable.length,
      },
      (index) => {
        if (index < usable.length) void open(usable[index]!);
      },
    );
  };
  const spoken =
    usable.length === 1
      ? `${label}: ${usable[0]!.label}`
      : `${label}, ${usable.length} records`;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={spoken}
      accessibilityHint={
        usable.length === 1 ? 'Opens the source' : 'Lists the original records'
      }
      testID={testID}
      onPress={press}
      hitSlop={{ top: 8, bottom: 8 }}
      style={({ pressed }) => [
        styles.original,
        fixed ? styles.fixedWidth : null,
        pressed ? { backgroundColor: colors.sunken } : null,
      ]}
    >
      <Icon
        name={
          usable.length === 1
            ? 'arrow.up.right.square'
            : 'list.bullet.rectangle'
        }
        size={14}
        tone="bronzeInk"
      />
      <Text
        wordSafe={fixed}
        variant="fine"
        tone="bronzeInk"
        style={styles.originalText}
      >
        {label}
      </Text>
    </Pressable>
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
  tile: {
    borderRadius: radius + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  original: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: rhythm.line + 2,
    minHeight: 28,
    paddingHorizontal: rhythm.line,
    marginHorizontal: -rhythm.line,
    borderRadius: radius,
  },
  originalText: { flexShrink: 1 },
  fixedWidth: { alignSelf: 'stretch', width: '100%' },
});

ownsRowPadding(LinkRow);
