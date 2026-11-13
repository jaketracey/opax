import { Fragment, type ReactNode, type RefObject } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CitationMark } from '../../design/citation-mark';
import { useAccessibilitySize } from '../../design/accessibility';
import { webOrigin } from '../../design/environment';
import { Text } from '../../design/text';
import { colors, hairline, rhythm } from '../../design/tokens';
import { fromWebPath } from '../../navigation/routes';
import {
  openSource,
  sourceUrl,
  trackSourceOpen,
} from '../../navigation/external';
import type { SourcePlacement } from '../../analytics/events';
import type { Block, Inline } from './answer-markdown';

/**
 * Opens a link in an answer: native pages in the Ask stack, else the browser.
 * A `placement` marks a source opened from the answer, for analytics.
 */
export function openAnswerLink(path: string, placement?: SourcePlacement) {
  if (!path.trim()) return;
  try {
    const url = new URL(path, webOrigin);
    if (url.protocol !== 'https:' || url.username || url.password) return;
    const route =
      url.hostname === new URL(webOrigin).hostname
        ? fromWebPath(url.pathname + url.search + url.hash) ||
          fromWebPath(url.pathname)
        : null;
    if (route) {
      router.push(route);
      if (placement) trackSourceOpen('app', placement);
    } else void openSource(sourceUrl(url.toString()), undefined, placement);
  } catch {
    /* Malformed model/source links never navigate. */
  }
}
export type Claim = { block: string; sentence: number };
/**
 * An answer's Markdown, drawn once by the same reader while it streams and
 * when it is final (specs/ask.md 6.2). Paragraphs in `body`; bullets with a
 * hanging indent; `#` lines as `strong` with no header trait (the question
 * stays the turn's one heading); tables as a grid, stacked at accessibility
 * sizes; citation numbers as inline marks. Nothing is set above 17 pt.
 */
export function AnswerBody({
  blocks,
  streaming = false,
  selectionMode = false,
  onCite,
  onLink = (href) => openAnswerLink(href),
  titleFor,
  claim,
  selected,
  blockRefs,
  markFallback,
  testID,
}: {
  blocks: Block[];
  /** Links are inert and no marks are drawn until the final answer. */
  streaming?: boolean;
  /** Android's explicit Select text mode, so ordinary citation taps stay live. */
  selectionMode?: boolean;
  onCite?: (numbers: number[], claim: Claim) => void;
  onLink?: (href: string, title: string) => void;
  /** A source's title and date, for a mark's spoken label. */
  titleFor?: (n: number) => string | undefined;
  /** The claim the open citation sheet shows: its sentence is highlighted. */
  claim?: Claim | null;
  /** The source number the open sheet shows. */
  selected?: number | null;
  /** Each block's view, so the thread can scroll a claim above the sheet. */
  blockRefs?: RefObject<Map<string, View | null>>;
  markFallback?: 'superscript';
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  // A final answer stays selectable (the system Copy menu, journeys/ask.md
  // 4.5). iOS only: on iOS a tap on a nested mark or link still reaches
  // React Native's touch handler (RCTParagraphComponentView's long press
  // only claims a hold); Android's setTextIsSelectable takes the touches,
  // so it is enabled only after the reader chooses Select text.
  const selectable =
    !streaming &&
    (Platform.OS === 'ios' || (Platform.OS === 'android' && selectionMode));
  const isLit = (span: Inline, block: string) =>
    !streaming &&
    claim?.block === block &&
    claim.sentence === span.sentence &&
    span.kind !== 'cite';
  // Only the claim's block lights, so its first lit span carries the ID.
  const spans = (items: Inline[], block: string): ReactNode => {
    const firstLit = items.findIndex((span) => isLit(span, block));
    return items.map((span, i) => {
      const lit = isLit(span, block);
      const first = i === firstLit;
      const wash = lit ? styles.claim : null;
      const id = first ? 'ask-sentence-highlight' : undefined;
      switch (span.kind) {
        case 'text':
          return lit ? (
            <Text key={i} style={wash} testID={id}>
              {span.text}
            </Text>
          ) : (
            <Fragment key={i}>{span.text}</Fragment>
          );
        case 'strong':
          return (
            <Text key={i} variant="strong" style={wash} testID={id}>
              {span.text}
            </Text>
          );
        case 'link':
          return streaming ? (
            <Fragment key={i}>{span.text}</Fragment>
          ) : (
            <Text
              key={i}
              tone="link"
              accessibilityRole="link"
              onPress={() => onLink(span.href, span.text)}
              style={wash}
              testID={id}
            >
              {span.text}
            </Text>
          );
        case 'cite':
          return streaming ? null : (
            <CitationMark
              key={i}
              numbers={span.numbers}
              label={span.label}
              title={titleFor?.(span.numbers[0]!)}
              selected={
                !!selected &&
                claim?.block === block &&
                claim.sentence === span.sentence &&
                span.numbers.includes(selected)
              }
              fallback={markFallback}
              onPress={() =>
                onCite?.(span.numbers, { block, sentence: span.sentence })
              }
              testID={`ask-citation-mark-${span.numbers[0]}`}
            />
          );
      }
    });
  };
  const keep = (key: string) => (node: View | null) => {
    blockRefs?.current?.set(key, node);
  };
  return (
    <View style={styles.body} testID={testID}>
      {blocks.map((block, index) => {
        const key = String(index);
        switch (block.kind) {
          case 'paragraph':
            return (
              <View key={key} ref={keep(key)} collapsable={false}>
                <Text variant="body" selectable={selectable}>
                  {spans(block.spans, key)}
                </Text>
              </View>
            );
          case 'heading':
            return (
              <View key={key} ref={keep(key)} collapsable={false}>
                <Text variant="strong" selectable={selectable}>
                  {spans(block.spans, key)}
                </Text>
              </View>
            );
          case 'quote':
            return (
              <View
                key={key}
                ref={keep(key)}
                collapsable={false}
                style={styles.quote}
              >
                <Text variant="recordText" selectable={selectable}>
                  {spans(block.spans, key)}
                </Text>
              </View>
            );
          case 'bullets':
          case 'numbered':
            return (
              <View key={key} accessibilityRole="list" style={styles.list}>
                {block.items.map((item, i) => {
                  const itemKey = `${key}.${i}`;
                  return (
                    <View
                      key={itemKey}
                      ref={keep(itemKey)}
                      collapsable={false}
                      style={styles.item}
                    >
                      <Text variant="body" style={styles.marker}>
                        {block.kind === 'bullets' ? '•' : `${block.start + i}.`}
                      </Text>
                      <Text
                        variant="body"
                        selectable={selectable}
                        style={styles.itemText}
                      >
                        {spans(item, itemKey)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          case 'table':
            return (
              <AnswerTable
                key={key}
                header={block.header.map((cell, c) =>
                  spans(cell, `${key}.h${c}`),
                )}
                rows={block.rows.map((row, r) =>
                  row.map((cell, c) => spans(cell, `${key}.${r}.${c}`)),
                )}
                stacked={stacked}
              />
            );
        }
      })}
    </View>
  );
}
function AnswerTable({
  header,
  rows,
  stacked,
}: {
  header: ReactNode[];
  rows: ReactNode[][];
  stacked: boolean;
}) {
  if (stacked)
    return (
      <View style={styles.stackedTable}>
        {rows.map((row, r) => (
          <View key={r} style={styles.stackedRow}>
            {row.map((cell, c) => (
              <View key={c} style={styles.stackedCell}>
                <Text variant="footnote" tone="inkSoft">
                  {header[c]}
                </Text>
                <Text variant="body" tabular>
                  {cell}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.table}>
        <View style={styles.tableRow}>
          {header.map((cell, c) => (
            <View key={c} style={styles.cell}>
              <Text variant="footnote" tone="inkSoft">
                {cell}
              </Text>
            </View>
          ))}
        </View>
        {rows.map((row, r) => (
          <View key={r} style={[styles.tableRow, styles.ruled]}>
            {row.map((cell, c) => (
              <View key={c} style={styles.cell}>
                <Text variant="body" tabular>
                  {cell}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  body: { gap: rhythm.block },
  claim: { backgroundColor: colors.navyWash },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: colors.dividerSubtle,
    paddingLeft: rhythm.tight,
  },
  list: { gap: rhythm.tight },
  item: { flexDirection: 'row', gap: rhythm.tight },
  marker: { minWidth: 14 },
  itemText: { flex: 1 },
  table: { minWidth: '100%' },
  tableRow: { flexDirection: 'row' },
  ruled: { borderTopWidth: hairline, borderTopColor: colors.dividerSubtle },
  cell: {
    minWidth: 96,
    maxWidth: 220,
    paddingVertical: rhythm.tight,
    paddingRight: rhythm.tight,
  },
  stackedTable: { gap: rhythm.block },
  stackedRow: {
    gap: rhythm.tight,
    paddingBottom: rhythm.block,
    borderBottomWidth: hairline,
    borderBottomColor: colors.dividerSubtle,
  },
  stackedCell: { gap: rhythm.line },
});
