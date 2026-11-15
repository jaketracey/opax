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
import { chapterSymbols } from './LearnHub';
import { openGuideLink } from './links';
import { chapterProgress, keepLearnPlace, useLearnPlaces } from './place';
import { learnChapterRoute, learnRoute } from './routes';

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
 * the chapter that follows in the guide's order, as a row that takes this
 * chapter's place on the stack (Back still returns to the guide), and
 * "Back to the guide".
 *
 * Each idea the reader moves to with Next is kept as their place
 * (place.ts), so the hub can open the chapter where they stopped. Opening a
 * chapter keeps nothing.
 */
export default function LearnChapter() {
  const params = useLocalSearchParams<{ chapter?: string; screen?: string }>();
  // Keyed by chapter: the next chapter's row replaces this route, and a
  // route that is reused must start the new chapter at its own first idea.
  return (
    <ChapterPage
      key={one(params.chapter) ?? ''}
      slug={one(params.chapter)}
      screen={one(params.screen)}
    />
  );
}

function ChapterPage({
  slug,
  screen: from,
}: {
  slug?: string;
  screen?: string;
}) {
  const chapter = learnChapters.find((c) => c.slug === slug);
  const total = chapter?.screens.length ?? 0;
  const start = Math.min(Math.max(Number(from) || 1, 1), Math.max(total, 1));
  const [at, setAt] = useState(start - 1);
  const scroll = useRef<ScrollView>(null);
  const heading = useRef<View>(null);
  const headerBottom = useHeaderBottom();
  const places = useLearnPlaces();
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
          title={learnCopy.missingChapter}
          body={learnCopy.missingChapterBody}
          action={{
            label: learnCopy.openGuide,
            // The guide takes this page's place, so Back never returns to
            // a chapter that is not there.
            onPress: () => router.replace(learnRoute),
            testID: 'learn-chapter-missing-open',
          }}
          testID="learn-chapter-missing"
        />
      </Screen>
    );
  const screen = chapter.screens[at]!;
  const last = at === total - 1;
  const kicker = chapterKicker(chapter.title, at + 1, total);
  const following = last
    ? learnChapters[learnChapters.indexOf(chapter) + 1]
    : undefined;
  const kept = following
    ? chapterProgress(places[following.slug], following.screens.length)
    : null;
  const resume = kept?.kind === 'part' ? kept.at : undefined;
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
        {following ? (
          <InsetGroup header={learnCopy.nextChapter} testID="learn-following">
            <LinkRow
              title={following.title}
              titleLines={0}
              detail={following.summary}
              detailLines={0}
              symbol={chapterSymbols[following.slug] ?? 'doc.text'}
              // The next chapter opens where the reader left it, if they
              // did: opened at its start, their first Next would replace
              // the place kept further in.
              onPress={() =>
                router.replace(learnChapterRoute(following.slug, resume))
              }
              testID="learn-following-row"
            />
          </InsetGroup>
        ) : null}
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
            // The place is kept when the reader moves, never on opening:
            // a link that opens the chapter at its start must not replace a
            // place kept further in, and one that opens its last idea has
            // not been read through. Reaching the last idea this way is
            // what marks the chapter read.
            setAt(at + 1);
            void keepLearnPlace(chapter.slug, at + 2, total).catch(
              () => undefined,
            );
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
