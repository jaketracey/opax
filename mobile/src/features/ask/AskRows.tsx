import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { CitationBadge } from '../../design/citation-mark';
import { useAccessibilitySize } from '../../design/accessibility';
import { Icon } from '../../design/icon';
import { symbols } from '../../design/symbols';
import { confirmAction } from '../../design/menu';
import { PartyLabel } from '../../design/people';
import { RowLink, type RowMenuAction } from '../../design/row-link';
import {
  useRowCellStyle,
  useRowHighlight,
  useRowInset,
} from '../../design/row-padding';
import { Text } from '../../design/text';
import { minimumTarget, rhythm } from '../../design/tokens';
import { fromWebPath } from '../../navigation/routes';
import { openSource } from '../../navigation/external';
import { shareRecord } from '../../navigation/share';
import { copyCitation, citeStyles } from './cite';
import type { Source } from './model';
import { personName, sourceMeta, sourceTitle } from './source-present';

/** A source's long-press menu, the same in Records cited, the sheet and the pane. */
export function sourceMenu(
  source: Source,
  showPassage?: () => void,
): RowMenuAction[] {
  return [
    ...(showPassage
      ? [
          {
            title: 'Show passage',
            symbol: 'text.quote' as const,
            onPress: showPassage,
          },
        ]
      : []),
    {
      title: 'Cite',
      inline: true,
      items: citeStyles.map((style) => ({
        title: `Copy ${style.label}`,
        onPress: () => void copyCitation([source], style.id),
      })),
    },
    ...(source.url?.startsWith('https://')
      ? [
          {
            title: 'Open original',
            symbol: 'arrow.up.right.square' as const,
            onPress: () => void openSource(source.url!, sourceTitle(source)),
          },
        ]
      : []),
    {
      title: 'Share',
      symbol: 'square.and.arrow.up' as const,
      onPress: () =>
        void shareRecord({ path: source.href, title: sourceTitle(source) }),
    },
  ];
}
export function sourceRoute(source: Source): Href | null {
  if (!source.href.startsWith('/')) return null;
  try {
    // A relative href needs no origin: retry its path without the query
    // or fragment (origins belong in build config, qa-static).
    return (
      fromWebPath(source.href) ?? fromWebPath(source.href.split(/[?#]/)[0]!)
    );
  } catch {
    return null;
  }
}
/**
 * One cited record: the numeral badge (as in the text), one meta line, the
 * cleaned title, the speaker with their party, a chevron. A 44 pt target for
 * every citation, whatever the inline mark's size.
 */
export function CitedRecordRow({
  record: source,
  n,
  onPress,
  onShowPassage,
  selected = false,
  testID,
}: {
  record: Source;
  /** The numeral; none for an uncited answer's "Records found". */
  n?: number;
  /** Replaces opening the record (the iPad pane, an open citation sheet). */
  onPress?: () => void;
  onShowPassage?: () => void;
  selected?: boolean;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  useRowInset(n && !stacked ? 46 : 16);
  const title = sourceTitle(source);
  const meta = sourceMeta(source);
  const speaker = source.speaker ? personName(source.speaker) : null;
  const href = sourceRoute(source);
  const open = () =>
    onPress
      ? onPress()
      : href
        ? router.push(href)
        : source.url
          ? void openSource(source.url, title)
          : undefined;
  const row = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[n ? `${n}.` : null, meta, title, speaker]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={selected ? { selected } : undefined}
      onPress={open}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        cellStyle,
        stacked ? styles.stacked : null,
        pressed || selected ? { backgroundColor: highlight } : null,
      ]}
    >
      {n ? <CitationBadge label={String(n)} /> : null}
      <View style={styles.main}>
        <Text wordSafe variant="secondary">
          {meta}
        </Text>
        <Text wordSafe variant="rowRecord">
          {title}
        </Text>
        {speaker ? (
          <View style={styles.speaker}>
            <Text variant="secondary">{speaker}</Text>
            {source.party ? <PartyLabel party={source.party} /> : null}
          </View>
        ) : null}
      </View>
      {stacked ? null : (
        <Icon name={symbols.chevron} size={13} tone="inkFaint" maxScale={1.5} />
      )}
    </Pressable>
  );
  const menu = sourceMenu(source, onShowPassage);
  return href ? (
    <RowLink href={href} menu={menu} select={onPress}>
      {row}
    </RowLink>
  ) : (
    row
  );
}
/**
 * Ask's suggestion rows (specs/ask.md 9.2, journeys/ask.md 4.1). The
 * trailing glyph says what a tap does: `arrow.up.circle` asks at once;
 * `arrow.up.left` puts the question in the composer. No chevron: these are
 * questions, not navigation. Offline the question stays in `inkSoft`, the
 * glyph goes and a tap does nothing.
 */
export function AskSuggestionRow({
  question,
  variant,
  onPress,
  offline = false,
  menu,
  testID,
}: {
  question: string;
  variant: 'send' | 'fill';
  onPress: () => void;
  offline?: boolean;
  menu?: RowMenuAction[];
  testID?: string;
}) {
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  useRowInset(44);
  const leaves = (menu ?? []).flatMap((item) =>
    'items' in item ? item.items : [item],
  ) as Extract<RowMenuAction, { onPress: () => void }>[];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={question}
      accessibilityHint={
        offline
          ? 'Needs a connection'
          : variant === 'send'
            ? 'Asks this question.'
            : 'Puts this question in the box.'
      }
      accessibilityState={offline ? { disabled: true } : undefined}
      accessibilityActions={leaves.map((item) => ({
        name: item.title,
        label: item.title,
      }))}
      onAccessibilityAction={(event) =>
        leaves
          .find((item) => item.title === event.nativeEvent.actionName)
          ?.onPress()
      }
      onPress={offline ? undefined : onPress}
      onLongPress={
        leaves.length && !offline
          ? () => confirmAction(question, leaves)
          : undefined
      }
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        cellStyle,
        pressed && !offline ? { backgroundColor: highlight } : null,
      ]}
    >
      <Icon name={symbols.ask} size={20} tone="navy" maxScale={1.5} />
      <Text
        wordSafe
        variant="body"
        tone={offline ? 'inkSoft' : undefined}
        style={styles.main}
      >
        {question}
      </Text>
      {offline ? null : (
        <Icon
          // Send asks; the pencil puts the question in the box to edit. The
          // journey's `arrow.up.circle` and `arrow.up.left` wait for roles in
          // design/symbols.ts (follow-up).
          name={variant === 'send' ? symbols.send : symbols.newConversation}
          size={20}
          tone="inkFaint"
          maxScale={1.5}
        />
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight + 4,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  main: { flex: 1, gap: rhythm.line },
  speaker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
  },
});
