import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScreenMargin } from '../../design/adaptive';
import { Button } from '../../design/controls';
import { Text } from '../../design/text';
import { colors, hairline, rhythm } from '../../design/tokens';
import { headerItems } from '../../navigation/chrome';
import { RouteOptions } from '../../navigation/preview';
import { welcomeSeatRoute } from '../../navigation/routes';
import { WELCOME_COLUMN } from '../welcome/Welcome';
import { TermTip } from './TermTip';
import { lessonCopy, lessons } from './lessons';
import { LessonBlock } from './Tour';

/**
 * Option C: `/welcome/basics`, the same four ideas as one page a reader
 * scrolls at their own pace, opened only by someone who asked for it. It
 * stays in the app afterwards (Today's "More to explore", Account), where
 * `standalone` drops the electorate button.
 */
export default function Basics({
  standalone = false,
}: {
  standalone?: boolean;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const margin = useScreenMargin();
  const column = Math.min(WELCOME_COLUMN, width - margin * 2);
  const toSeat = () => router.push(welcomeSeatRoute());
  return (
    <>
      <RouteOptions
        options={{
          title: lessonCopy.barTitle,
          headerTitle: '',
          ...(standalone
            ? {}
            : headerItems(() => [
                {
                  type: 'button',
                  label: lessonCopy.skip,
                  variant: 'plain',
                  tintColor: colors.navy,
                  accessibilityLabel: 'Skip the basics',
                  onPress: toSeat,
                },
              ])),
        }}
      />
      <ScrollView
        style={styles.screen}
        testID="welcome-basics"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.page,
          {
            paddingHorizontal: margin,
            paddingBottom: insets.bottom + rhythm.section,
          },
        ]}
      >
        <View style={{ width: column, gap: rhythm.section }}>
          <View style={styles.head}>
            <Text
              wordSafe
              variant="largeTitle"
              accessibilityRole="header"
              testID="welcome-basics-title"
            >
              {lessonCopy.pageTitle}
            </Text>
            <Text wordSafe variant="body" tone="inkSoft">
              {lessonCopy.pageLead}
            </Text>
          </View>
          {lessons.map((lesson, i) => (
            <View key={lesson.id} style={styles.step}>
              <View style={styles.number}>
                <Text variant="strong" tone="navy">
                  {i + 1}
                </Text>
              </View>
              <LessonBlock lesson={lesson} width={column} />
            </View>
          ))}
          <View style={styles.more}>
            <TermTip term="government" variant="link" />
            <TermTip term="party" variant="link" />
          </View>
          {standalone ? null : (
            <Button
              label={lessonCopy.find}
              variant="primary"
              size="large"
              fullWidth
              onPress={toSeat}
              testID="welcome-basics-find"
            />
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sunken },
  page: { alignItems: 'center', paddingTop: rhythm.block },
  head: { gap: rhythm.tight },
  step: {
    gap: rhythm.block,
    paddingTop: rhythm.group,
    borderTopWidth: hairline,
    borderTopColor: colors.dividerDefault,
  },
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navyWash,
  },
  more: { gap: rhythm.line },
});
