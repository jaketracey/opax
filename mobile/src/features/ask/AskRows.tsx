import { router, type Href } from 'expo-router';
import { useRef } from 'react';
import { Pressable, StyleSheet, type View } from 'react-native';
import { CitationBadge } from '../../design/citation-mark';
import { Icon } from '../../design/icon';
import { confirmAction } from '../../design/menu';
import { type RowMenuAction } from '../../design/row-link';
import { RecordRow } from '../../design/rows';
import { speakerSlot } from '../records/speaker';
import {
  useRowCellStyle,
  useRowHighlight,
  useRowInset,
} from '../../design/row-padding';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { minimumTarget, rhythm } from '../../design/tokens';
import type { SourcePlacement } from '../../analytics/events';
import { openSource, trackSourceOpen } from '../../navigation/external';
import { docRoute } from '../../navigation/routes/records';
import { shareRecord } from '../../navigation/share';
import { citationPassage } from './CitationContent';
import { citeStyles, copyCitation } from './cite';
import type { Source } from './model';
import { personName, sourceMeta, sourceTitle } from './source-present';
import { recordRoute } from '../records/route';
import { openAnswerLink } from './AnswerBody';
import type { AskPerson } from './people';
import { useTermWords, withTermAction } from '../../design/term';
import type { TermMatch } from '../learn/term-map';

/** A source's long-press menu, the same in Records cited, the sheet and the pane. */
export function sourceMenu(
  source: Source,
  showPassage?: () => void,
  placement: SourcePlacement = 'inline',
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
            onPress: () =>
              void openSource(source.url!, sourceTitle(source), placement),
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
  const route = recordRoute(source);
  return route?.pathname === '/doc/[slug]'
    ? docRoute(route.params.slug, sourceTitle(source), {
        passage: citationPassage(source) ?? undefined,
      })
    : route;
}
/** The pane and the phone use the same repaired document destination. */
export function sourcePath(source: Source): string {
  const route = sourceRoute(source);
  if (typeof route !== 'object' || route?.pathname !== '/doc/[slug]')
    return source.href || source.url || '';
  const passage = citationPassage(source);
  return `/doc/${route.params?.slug}${
    passage
      ? `?${new URLSearchParams({ passage: passage.slice(0, 4000) })}`
      : ''
  }`;
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
  profiles,
  placement = 'inline',
  testID,
}: {
  record: Source;
  /** The numeral; none for an uncited answer's "Records found". */
  n?: number;
  /** Replaces opening the record (the iPad pane, an open citation sheet). */
  onPress?: () => void;
  onShowPassage?: () => void;
  selected?: boolean;
  profiles?: Map<string, AskPerson>;
  /** Where the row is, for analytics: the answer, or the Sources list. */
  placement?: SourcePlacement;
  testID?: string;
}) {
  const title = sourceTitle(source);
  const meta = sourceMeta(source);
  const speaker = source.speaker ? personName(source.speaker) : null;
  const person = source.speaker
    ? (profiles?.get(source.speaker) ?? profiles?.get(speaker ?? ''))
    : undefined;
  const href = sourceRoute(source);
  const open = () => {
    if (onPress) onPress();
    else if (href) {
      router.push(href);
      trackSourceOpen('app', placement);
    } else openAnswerLink(source.url || source.href || '', placement);
  };
  const slot = speakerSlot(speaker, source.party ?? null, person?.slug);
  return (
    <RecordRow
      meta={meta}
      title={title}
      leading={
        n
          ? { content: <CitationBadge label={String(n)} />, label: `${n}.` }
          : undefined
      }
      speaker={slot ? { ...slot, linkedParty: true } : null}
      href={href ?? undefined}
      onPress={onPress ?? (!href ? open : undefined)}
      selected={selected}
      menu={sourceMenu(source, onShowPassage, placement)}
      testID={testID}
    />
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
  minimumHeight,
  term,
  testID,
}: {
  question: string;
  variant: 'send' | 'fill';
  onPress: () => void;
  offline?: boolean;
  menu?: RowMenuAction[];
  /** Ask next's two-line slot; the full question remains its accessible label. */
  minimumHeight?: number;
  /** The glossary term the question leans on ("senators"), marked inline. */
  term?: TermMatch | null;
  testID?: string;
}) {
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  useRowInset(44);
  const leaves = (menu ?? []).flatMap((item) =>
    'items' in item ? item.items : [item],
  ) as Extract<RowMenuAction, { onPress: () => void }>[];
  const termAction = withTermAction(
    leaves.map((item) => ({ name: item.title, label: item.title })),
    term?.term,
  );
  const words = useTermWords(question, term?.term, term?.phrase);
  const row = useRef<View>(null);
  return (
    <Pressable
      ref={row}
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
      accessibilityActions={termAction.actions}
      onAccessibilityAction={(event) => {
        if (termAction.handle(event.nativeEvent.actionName)) return;
        leaves
          .find((item) => item.title === event.nativeEvent.actionName)
          ?.onPress();
      }}
      onPress={offline ? undefined : onPress}
      onLongPress={
        leaves.length && !offline
          ? () =>
              // The menu comes from the row: Android's popup without a
              // trigger fell back to the top corner, and an iOS popover
              // (iPad, an unfolded iPhone Duo) points at it.
              confirmAction(question, leaves, row.current ?? undefined)
          : undefined
      }
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        cellStyle,
        minimumHeight ? { minHeight: minimumHeight } : null,
        pressed && !offline ? { backgroundColor: highlight } : null,
      ]}
    >
      <Icon name={symbols.ask} size={20} tone="navy" maxScale={1.5} />
      <Text
        wordSafe
        variant="body"
        numberOfLines={minimumHeight ? 2 : undefined}
        tone={offline ? 'inkSoft' : undefined}
        style={styles.main}
      >
        {words}
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
  main: { flex: 1, gap: rhythm.line },
});
