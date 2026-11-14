import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from '../../../design/card';
import { Button } from '../../../design/controls';
import { Icon } from '../../../design/icon';
import { Tag } from '../../../design/labels';
import { Screen } from '../../../design/layout';
import { Text } from '../../../design/text';
import { colors, radii, rhythm } from '../../../design/tokens';
import { billRoute, moneyRoute, personRoute } from '../../../navigation/routes';
import { StageTracker } from '../StageTracker';
import { trackerFixtures } from '../tracker-model';
import { chapters, learnCopy } from './copy';

/** The fixture records "See it in OPAX" opens in the prototype. */
const seeRoutes = {
  bill: () => billRoute('au-federal-r7520'),
  division: () =>
    billRoute('au-federal-r7520', undefined, {
      division: 'federal-representatives-10607',
    }),
  person: () => personRoute('anthony-albanese', 'Anthony Albanese'),
  money: () => moneyRoute(),
} as const;

/**
 * One chapter (`/learn/[chapter]`): one idea per screen. A kicker says
 * where you are, the idea is the heading, the text is two or three short
 * sentences, and the chapter ends on "See it in OPAX", a real record. Next
 * swaps the idea in place: there is no pager to swipe, so VoiceOver reads
 * one idea and one button.
 */
export default function LearnChapterScreen() {
  const { chapter: id } = useLocalSearchParams<{ chapter?: string }>();
  const chapter = chapters.find((c) => c.id === id) ?? chapters[0]!;
  const [at, setAt] = useState(0);
  const total = chapter.pages.length + 1;
  const page = chapter.pages[at];
  return (
    <Screen grouped barTitle={chapter.title} testID="learn-chapter-screen">
      <View style={styles.progress} accessibilityElementsHidden>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.bar, i <= at ? styles.barOn : null]} />
        ))}
      </View>
      <Text variant="footnote" tone="inkSoft" testID="learn-chapter-kicker">
        {`${chapter.title} · ${learnCopy.step(at + 1, total)}`}
      </Text>
      {page ? (
        <View style={styles.idea} testID={`learn-page-${at + 1}`}>
          {page.placeholder ? (
            <Tag label={learnCopy.placeholder} kind="Note" />
          ) : null}
          <Text
            wordSafe
            variant="largeTitle"
            accessibilityRole="header"
            testID="learn-idea"
          >
            {page.idea}
          </Text>
          <Text wordSafe variant="body">
            {page.body}
          </Text>
          {page.art === 'tracker' ? (
            <StageTracker
              stages={trackerFixtures[1]!.stages}
              status={trackerFixtures[1]!.status}
              testID="learn-tracker"
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.idea} testID="learn-page-see">
          <Text
            wordSafe
            variant="largeTitle"
            accessibilityRole="header"
            testID="learn-idea"
          >
            {learnCopy.seeIt}
          </Text>
          <Card href={seeRoutes[chapter.see.to]()} testID="learn-see">
            <View style={styles.see}>
              <Icon name={chapter.symbol} size={28} maxScale={1.3} />
              <View style={styles.seeWords}>
                <Text wordSafe variant="subsectionTitle">
                  {chapter.see.label}
                </Text>
                <Text wordSafe variant="secondary">
                  {chapter.see.line}
                </Text>
              </View>
            </View>
          </Card>
        </View>
      )}
      <Button
        label={page ? learnCopy.next : learnCopy.done}
        accessibilityLabel={
          page
            ? `${learnCopy.next}, ${learnCopy.step(at + 2, total)}`
            : learnCopy.done
        }
        variant={page ? 'primary' : 'default'}
        size="large"
        fullWidth
        onPress={() => (page ? setAt(at + 1) : router.back())}
        testID="learn-next"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: rhythm.line },
  bar: {
    flex: 1,
    height: 4,
    borderRadius: radii.bar,
    borderCurve: 'continuous',
    backgroundColor: colors.dividerSubtle,
  },
  barOn: { backgroundColor: colors.navy },
  idea: { gap: rhythm.block },
  see: { flexDirection: 'row', gap: rhythm.block, alignItems: 'flex-start' },
  seeWords: { flex: 1, gap: rhythm.line },
});
