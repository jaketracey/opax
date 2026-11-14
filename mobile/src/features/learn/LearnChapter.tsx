import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  ScrollView,
  StyleSheet,
  Text as Run,
  View,
} from 'react-native';
import { Button } from '../../design/controls';
import { InsetGroup, Screen } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { scrollToTop } from '../../design/scroll-to-top';
import { Term } from '../../design/term';
import { Heading, Text } from '../../design/text';
import { colors, radii, rhythm } from '../../design/tokens';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { ContentUnavailable } from '../../design/states';
import { RouteOptions } from '../../navigation/preview';
import type { LearnBlock, LearnInline } from './content-types';
import { chapterKicker, learnCopy } from './copy';
import { learnChapters, type TermId } from './glossary';
import { openGuideLink } from './links';

const one = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** Inline runs: plain words, a glossary term, a link to a record. */
export function Runs({ runs }: { runs: readonly LearnInline<TermId>[] }) {
  return (
    <>
      {runs.map((run, index) =>
        typeof run === 'string' ? (
          run
        ) : 'term' in run ? (
          <Term key={index} id={run.term}>
            {run.t}
          </Term>
        ) : (
          <Run
            key={index}
            accessibilityRole="link"
            onPress={() => openGuideLink(run.url, run.t)}
            style={styles.link}
          >
            {run.t}
          </Run>
        ),
      )}
    </>
  );
}

/** A run list as plain words, for a row's second line. */
const plain = (runs: readonly LearnInline[]) =>
  runs.map((run) => (typeof run === 'string' ? run : run.t)).join('');

function Block({ block, at }: { block: LearnBlock<TermId>; at: number }) {
  if (block.kind === 'p')
    return (
      <Text wordSafe variant="body">
        <Runs runs={block.inline} />
      </Text>
    );
  // "See it in OPAX": each record its own row, with the guide's note under
  // it. A second record named inside a note gets a row of its own.
  return (
    <InsetGroup testID={`learn-see-${at}`}>
      {block.items.flatMap((item, index) => [
        <LinkRow
          key={`${index}`}
          title={item.label}
          titleLines={0}
          detail={plain(item.note) || undefined}
          detailLines={0}
          onPress={() => openGuideLink(item.url, item.label)}
          testID={`learn-see-${at}-${index}`}
        />,
        ...item.note.flatMap((run, inner) =>
          typeof run !== 'string' && 'url' in run
            ? [
                <LinkRow
                  key={`${index}-${inner}`}
                  title={run.t}
                  titleLines={0}
                  onPress={() => openGuideLink(run.url, run.t)}
                  testID={`learn-see-${at}-${index}-${inner}`}
                />,
              ]
            : [],
        ),
      ])}
    </InsetGroup>
  );
}

/**
 * `/learn/[chapter]`: one chapter, one idea per screen (README 8.1). A thin
 * progress bar and a kicker ("How a bill becomes an Act · 2 of 23"), the
 * idea as the heading, the guide's sentences, and one button, Next, which
 * swaps the idea in place: no pager to swipe, so VoiceOver reads one idea
 * and one button, and focus moves to the new heading. The last idea is the
 * guide's "See it in OPAX", real records on the reader's own stack; then
 * "Back to the guide".
 */
export default function LearnChapter() {
  const params = useLocalSearchParams<{ chapter?: string; screen?: string }>();
  const chapter = learnChapters.find((c) => c.slug === one(params.chapter));
  const total = chapter?.screens.length ?? 0;
  const start = Math.min(
    Math.max(Number(one(params.screen)) || 1, 1),
    Math.max(total, 1),
  );
  const [at, setAt] = useState(start - 1);
  const scroll = useRef<ScrollView>(null);
  const heading = useRef<View>(null);
  const headerBottom = useHeaderBottom();
  // The screen the page was last reset for: Next resets it to the top, a
  // header settling later never does.
  const shown = useRef(at);
  useEffect(() => {
    if (shown.current === at) return;
    shown.current = at;
    scrollToTop(scroll.current, headerBottom);
    const node = heading.current && findNodeHandle(heading.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [at, headerBottom]);
  if (!chapter)
    return (
      <Screen testID="learn-chapter">
        <ContentUnavailable
          symbol="text.book.closed"
          title={learnCopy.name}
          testID="learn-chapter-missing"
        />
      </Screen>
    );
  const screen = chapter.screens[at]!;
  const last = at === total - 1;
  const kicker = chapterKicker(chapter.title, at + 1, total);
  return (
    <>
      <RouteOptions options={{ title: chapter.title }} />
      <Screen
        grouped
        barTitle={chapter.title}
        scrollRef={scroll}
        scrollToOverflowEnabled
        testID="learn-chapter"
      >
        <View
          style={styles.track}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View
            style={[styles.fill, { width: `${((at + 1) / total) * 100}%` }]}
          />
        </View>
        <View style={styles.idea} key={at} testID={`learn-screen-${at + 1}`}>
          <Text variant="footnote" tone="inkSoft" testID="learn-kicker">
            {kicker}
          </Text>
          <View ref={heading} accessible={false} collapsable={false}>
            <Heading level={1} kind="page" testID="learn-heading">
              {screen.heading}
            </Heading>
          </View>
          {screen.blocks.map((block, index) => (
            <Block key={index} block={block} at={at + 1} />
          ))}
        </View>
        <Button
          label={last ? learnCopy.back : learnCopy.next}
          accessibilityLabel={
            last
              ? learnCopy.back
              : `${learnCopy.next}, ${chapterKicker(chapter.title, at + 2, total)}`
          }
          variant={last ? 'default' : 'primary'}
          size="large"
          fullWidth
          onPress={() => {
            if (last) {
              if (router.canGoBack()) router.back();
              return;
            }
            setAt(at + 1);
          }}
          testID="learn-next"
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: radii.bar,
    borderCurve: 'continuous',
    backgroundColor: colors.dividerSubtle,
    overflow: 'hidden',
  },
  fill: { height: 4, backgroundColor: colors.navy },
  idea: { gap: rhythm.block },
  link: { color: colors.navy, textDecorationLine: 'underline' },
});
