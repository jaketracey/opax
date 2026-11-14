import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAccessibilitySize } from '../../design/accessibility';
import { Button } from '../../design/controls';
import { Screen } from '../../design/layout';
import { symbols } from '../../design/symbols';
import { Heading, Text } from '../../design/text';
import { colors, hairline, rhythm } from '../../design/tokens';
import { headerItems } from '../../navigation/chrome';
import { RouteOptions } from '../../navigation/preview';
import { welcomeSeatRoute } from '../../navigation/routes';
import { useSeat } from '../your-mp/useSeat';
import { ChambersArt, DivisionArt, ElectorateArt, RecordArt } from './art';
import { minuteCopy, minuteIdeas, type MinuteIdea } from './copy';
import { openTerm } from '../learn/open-term';

/** The widest the drawings grow: the welcome's column. */
const ART_COLUMN = 540;

function Drawing({
  id,
  width,
  large,
}: {
  id: MinuteIdea['id'];
  width: number;
  large: boolean;
}) {
  switch (id) {
    case 'mp':
      // At accessibility sizes the map shrinks so the words get the room.
      return <ElectorateArt height={large ? 110 : 150} />;
    case 'houses':
      return (
        <ChambersArt
          stacked={large}
          size={large ? Math.min(200, width) : Math.min(150, (width - 16) / 2)}
        />
      );
    case 'votes':
      return <DivisionArt width={Math.min(280, width)} />;
    case 'opax':
      return <RecordArt />;
  }
}

/**
 * "Parliament in a minute" (option C): the four ideas on one page, read at
 * the reader's own pace. Opened from the welcome by "Show me the basics"
 * (`welcome`: Skip in the bar, Find my electorate at the end), and later as
 * an ordinary page at `/learn/minute` (`guide`: neither). Each idea is a
 * heading and its sentences; the number and the drawing are decoration,
 * hidden from VoiceOver. Nothing on the page moves.
 */
export function MinutePage({ mode }: { mode: 'welcome' | 'guide' }) {
  const window = useWindowDimensions();
  const large = useAccessibilitySize();
  const seat = useSeat();
  const [width, setWidth] = useState(() =>
    Math.max(0, Math.min(ART_COLUMN, window.width - 32)),
  );
  const welcome = mode === 'welcome';
  const advancing = useRef(false);
  useFocusEffect(
    useCallback(() => {
      advancing.current = false;
    }, []),
  );
  const toSeat = () => {
    if (advancing.current) return;
    advancing.current = true;
    router.push(welcomeSeatRoute());
  };
  return (
    <>
      <RouteOptions
        options={
          welcome
            ? headerItems(() => [
                {
                  type: 'button',
                  label: minuteCopy.skip,
                  variant: 'plain',
                  tintColor: colors.navy,
                  accessibilityLabel: minuteCopy.skipLabel,
                  onPress: toSeat,
                },
              ])
            : undefined
        }
      />
      <Screen grouped barTitle={minuteCopy.title} testID="minute-screen">
        <View style={styles.head}>
          <Heading level={1} kind="page" testID="minute-title">
            {minuteCopy.title}
          </Heading>
          <Text wordSafe variant="body" tone="inkSoft" testID="minute-lead">
            {minuteCopy.lead}
          </Text>
        </View>
        <View
          style={styles.ideas}
          onLayout={(event) =>
            setWidth(Math.min(ART_COLUMN, event.nativeEvent.layout.width))
          }
        >
          {minuteIdeas.map((idea, i) => (
            <View
              key={idea.id}
              style={styles.idea}
              testID={`minute-idea-${idea.id}`}
            >
              <View
                style={styles.number}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Text variant="strong" tone="navy" tabular>
                  {i + 1}
                </Text>
              </View>
              <Drawing id={idea.id} width={width} large={large} />
              <View style={styles.words}>
                <Heading level={2} testID={`minute-idea-${idea.id}-title`}>
                  {idea.title}
                </Heading>
                {idea.body.map((sentence) => (
                  <Text key={sentence} wordSafe variant="body">
                    {sentence}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>
        <View style={styles.further}>
          {minuteCopy.further.map((item) => (
            <Button
              key={item.term}
              label={item.label}
              variant="plain"
              icon={symbols.help}
              accessibilityHint="Opens the full answer"
              onPress={() => openTerm(item.term)}
              testID={`minute-more-${item.term}`}
            />
          ))}
        </View>
        <Text wordSafe variant="secondary" tone="inkSoft" testID="minute-more">
          {minuteCopy.more}
        </Text>
        {welcome ? (
          <Button
            label={seat.status === 'chosen' ? minuteCopy.next : minuteCopy.find}
            variant="primary"
            size="large"
            fullWidth
            onPress={toSeat}
            testID="minute-find"
          />
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  head: { gap: rhythm.tight },
  ideas: { gap: rhythm.section },
  idea: {
    gap: rhythm.block,
    paddingTop: rhythm.group,
    borderTopWidth: hairline,
    borderTopColor: colors.dividerDefault,
  },
  // Grows with its digit at accessibility sizes (a fixed circle clipped it).
  number: {
    alignSelf: 'flex-start',
    minWidth: 28,
    minHeight: 28,
    paddingHorizontal: rhythm.line,
    borderRadius: 999,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navyWash,
  },
  words: { gap: rhythm.tight },
  further: { alignItems: 'flex-start', gap: rhythm.line },
});
