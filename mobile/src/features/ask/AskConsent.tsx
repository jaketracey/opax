import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useScreenMargin } from '../../design/adaptive';
import { Button } from '../../design/controls';
import { MachinePill } from '../../design/labels';
import { InsetGroup } from '../../design/layout';
import { SurfaceContext } from '../../design/row-padding';
import { LinkRow } from '../../design/rows';
import { Text } from '../../design/text';
import { colors, rhythm } from '../../design/tokens';
import { openOnWeb } from '../../navigation/external';
import { machineNote } from './AnswerView';
import { askSession, continueHeld } from './session';

/** DIRECTION 6.5 step 2, verbatim. The vendor names stay (App Review 5.1.2(i)). */
export const consentCopy = {
  title: 'Before you ask',
  body: "Your question and this conversation go to OPAX's server. Progress Agentic RAG finds the records, and an AI model reached through OpenRouter writes the answer. Answers can be wrong, so check the cited records. Don't include personal details.",
  privacy: 'Privacy',
  continue: 'Continue',
  notNow: 'Not now',
} as const;

/**
 * Before the first question leaves this device (A1, specs/ask.md 3): a
 * route sheet at `fitToContents` with no Done and no ✕. Continue records
 * consent and sends the held question; Not now, or a swipe down, sends
 * nothing and leaves the question in the composer.
 */
export default function AskConsent() {
  const margin = useScreenMargin();
  const insets = useSafeAreaInsets();
  const decided = useRef(false);
  // A swipe down is Not now.
  useEffect(
    () => () => {
      if (!decided.current) askSession.release();
    },
    [],
  );
  const leave = (agree: boolean) => {
    decided.current = true;
    if (agree) void continueHeld();
    else askSession.release();
    if (router.canGoBack()) router.back();
  };
  return (
    <SurfaceContext.Provider value="sunken">
      <ScrollView
        testID="ask-consent"
        style={styles.screen}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: margin,
            paddingBottom: rhythm.block + insets.bottom,
          },
        ]}
      >
        <View style={styles.lead}>
          <MachinePill note={machineNote} testID="ask-consent-machine" />
          <Text wordSafe testID="ask-consent-what">
            {consentCopy.body}
          </Text>
        </View>
        <InsetGroup>
          <LinkRow
            title={consentCopy.privacy}
            external
            accessibilityHint="Opens on opax.com.au"
            testID="ask-consent-privacy"
            onPress={() => void openOnWeb('/privacy', consentCopy.privacy)}
          />
        </InsetGroup>
        <View style={styles.actions}>
          <Button
            label={consentCopy.continue}
            variant="primary"
            size="large"
            fullWidth
            onPress={() => leave(true)}
            testID="ask-consent-continue"
          />
          <Button
            label={consentCopy.notNow}
            variant="plain"
            fullWidth
            onPress={() => leave(false)}
            testID="ask-consent-not-now"
          />
        </View>
      </ScrollView>
    </SurfaceContext.Provider>
  );
}
const styles = StyleSheet.create({
  screen: { backgroundColor: colors.sunken },
  content: { gap: rhythm.group, paddingTop: rhythm.block },
  lead: { gap: rhythm.tight },
  actions: { gap: rhythm.tight },
});
