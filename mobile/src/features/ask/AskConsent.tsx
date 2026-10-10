import { StyleSheet, View } from 'react-native';
import { Button, LinkRow, MachineLabel, Text } from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { openOnWeb } from '../../navigation/external';
import { machineNote } from './AnswerView';
import { AskSheet } from './AskSheet';

/**
 * Before the first question is sent: what goes where, that answers are
 * machine-written, and the privacy page, in Talk's consent shape. Asked once
 * on this device (consent.ts). Not now leaves the question unsent.
 */
export function AskConsent({
  onAgree,
  onDecline,
}: {
  onAgree: () => void;
  onDecline: () => void;
}) {
  return (
    <AskSheet
      title="Before you ask"
      onDone={onDecline}
      doneLabel="Close"
      testID="ask-consent"
      doneID="ask-consent-close"
    >
      <Text wordSafe testID="ask-consent-what">
        Your question, with the earlier questions and answers in this
        conversation, goes to OPAX’s server. Progress Agentic RAG finds the
        records, and an AI model reached through OpenRouter writes the answer.
      </Text>
      <MachineLabel explanation={machineNote} testID="ask-consent-machine" />
      <Text wordSafe>
        Answers are machine-written and can be wrong. Please don’t include
        personal information.
      </Text>
      <LinkRow
        title="Privacy"
        external
        accessibilityHint="Opens on opax.com.au"
        testID="ask-consent-privacy"
        onPress={() => void openOnWeb('/privacy', 'Privacy')}
      />
      <View style={styles.actions}>
        <Button
          label="Continue"
          testID="ask-consent-continue"
          variant="primary"
          size="large"
          fullWidth
          onPress={onAgree}
        />
        <Button
          label="Not now"
          testID="ask-consent-not-now"
          variant="quiet"
          fullWidth
          onPress={onDecline}
        />
      </View>
    </AskSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: rhythm.tight, marginTop: rhythm.tight },
});
