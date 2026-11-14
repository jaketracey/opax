import { useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccessibilitySize, useReduceMotion } from '../../design/accessibility';
import { useScreenMargin } from '../../design/adaptive';
import { Button } from '../../design/controls';
import { Text } from '../../design/text';
import { colors, rhythm } from '../../design/tokens';
import { headerItems } from '../../navigation/chrome';
import { RouteOptions } from '../../navigation/preview';
import { welcomeSeatRoute } from '../../navigation/routes';
import { WELCOME_COLUMN } from '../welcome/Welcome';
import { lessonCopy, lessons, type Lesson } from './lessons';

/** One lesson: the drawing, the idea, the sentences. */
export function LessonBlock({
  lesson,
  width,
  kicker,
  centred = false,
}: {
  lesson: Lesson;
  width: number;
  kicker?: string;
  centred?: boolean;
}) {
  const large = useAccessibilitySize();
  return (
    <View style={styles.lesson} testID={`lesson-${lesson.id}`}>
      <View style={styles.art}>{lesson.art(large, width)}</View>
      <View style={styles.words}>
        {kicker ? (
          <Text
            variant="footnote"
            tone="inkSoft"
            style={centred ? styles.centred : null}
          >
            {kicker}
          </Text>
        ) : null}
        <Text
          wordSafe
          variant={centred ? 'pageTitle' : 'sectionTitle'}
          accessibilityRole="header"
          style={centred ? styles.centred : null}
          testID={`lesson-${lesson.id}-title`}
        >
          {lesson.title}
        </Text>
        {lesson.body.map((p, i) => (
          <Text
            key={i}
            wordSafe
            variant="body"
            style={centred ? styles.centred : null}
          >
            {p}
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * Option A: `/welcome/tour`, four cards between the welcome and the
 * electorate step. Swipe or "Next"; "Skip" in the bar goes straight to the
 * electorate step, and the bar's back button returns to the welcome. Each
 * card scrolls on its own, so at AX5 nothing is cut and the button stays
 * pinned. VoiceOver reads a card top to bottom, then "Next, 2 of 4".
 */
export default function Tour() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const margin = useScreenMargin();
  const reduceMotion = useReduceMotion();
  const pager = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = page === lessons.length - 1;
  const column = Math.min(WELCOME_COLUMN, width - margin * 2);
  const toSeat = () => router.push(welcomeSeatRoute());
  const next = () => {
    if (last) return toSeat();
    pager.current?.scrollTo({ x: (page + 1) * width, animated: !reduceMotion });
    setPage(page + 1);
  };
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  return (
    <>
      <RouteOptions
        options={{
          title: lessonCopy.barTitle,
          headerTitle: '',
          ...headerItems(() => [
            {
              type: 'button',
              label: lessonCopy.skip,
              variant: 'plain',
              tintColor: colors.navy,
              accessibilityLabel: 'Skip the basics',
              onPress: toSeat,
            },
          ]),
        }}
      />
      <View style={styles.screen} testID="welcome-tour">
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={settle}
          style={styles.screen}
          testID="welcome-tour-pager"
        >
          {lessons.map((lesson, i) => (
            <ScrollView
              key={lesson.id}
              style={{ width }}
              contentInsetAdjustmentBehavior="automatic"
              contentContainerStyle={[
                styles.page,
                { paddingHorizontal: margin },
              ]}
              // Only the card in view is read or reached.
              accessibilityElementsHidden={i !== page}
              importantForAccessibility={
                i === page ? 'auto' : 'no-hide-descendants'
              }
            >
              <View style={{ width: column }}>
                <LessonBlock
                  lesson={lesson}
                  width={column}
                  kicker={lessonCopy.step(i + 1)}
                  centred
                />
              </View>
            </ScrollView>
          ))}
        </ScrollView>
        <View
          style={[
            styles.foot,
            {
              paddingHorizontal: margin,
              paddingBottom: Math.max(insets.bottom, rhythm.block),
            },
          ]}
        >
          <View
            style={styles.dots}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {lessons.map((lesson, i) => (
              <View
                key={lesson.id}
                style={[styles.dot, i === page ? styles.dotOn : null]}
              />
            ))}
          </View>
          <View style={{ width: column, alignSelf: 'center' }}>
            <Button
              label={last ? lessonCopy.find : lessonCopy.next}
              accessibilityLabel={
                last
                  ? lessonCopy.find
                  : `${lessonCopy.next}, ${lessonCopy.step(page + 2)}`
              }
              variant="primary"
              size="large"
              fullWidth
              onPress={next}
              testID="welcome-tour-next"
            />
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sunken },
  page: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rhythm.group,
  },
  lesson: { gap: rhythm.group },
  art: { alignItems: 'center', justifyContent: 'center' },
  words: { gap: rhythm.tight },
  centred: { textAlign: 'center' },
  foot: { paddingTop: rhythm.block, gap: rhythm.block },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.dividerDefault,
  },
  dotOn: { width: 20, backgroundColor: colors.navy },
});
