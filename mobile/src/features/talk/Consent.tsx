import { phoneCopy } from '../../design/phone-copy';
import { StyleSheet, View } from 'react-native';
import { Button, Heading, LinkRow, Text } from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { openOnWeb } from '../../navigation/external';

/** One line before every call (App Review 5.1.2(i) and honest AI output). */
export function VoiceDisclosure() {
  return (
    <Text
      wordSafe
      variant="fine"
      tone="inkFaint"
      style={styles.centre}
      testID="talk-disclosure"
    >
      AI voice by ElevenLabs. It can be wrong: check the sources.
    </Text>
  );
}

/**
 * The first-call consent: what goes where, what is kept, how to withdraw.
 * The details and the provider's own policy are on the Voice privacy page.
 */
export function Consent({
  busy,
  onAgree,
  onDecline,
}: {
  busy: boolean;
  onAgree: () => void;
  onDecline: () => void;
}) {
  return (
    <View style={styles.consent} testID="talk-consent">
      <Heading level={2}>Before you talk</Heading>
      <Text wordSafe>
        Your voice and the conversation go to ElevenLabs, OPAX’s voice provider,
        so it can answer you.
      </Text>
      <Text wordSafe>
        OPAX keeps each call’s times and ElevenLabs reference on your account:
        no audio, no transcript.
      </Text>
      <Text wordSafe>
        ElevenLabs was set to keep no audio and to delete transcripts after a
        day (checked 9 September 2026). Its own privacy policy also applies.
      </Text>
      <Text wordSafe variant="metadata">
        {phoneCopy(
          'Stored on this iPhone. Withdraw it any time from the More menu.',
        )}
      </Text>
      <LinkRow
        title="Voice privacy"
        external
        accessibilityHint="Opens on opax.com.au"
        testID="talk-consent-privacy"
        onPress={() => void openOnWeb('/privacy', 'Voice privacy')}
      />
      <View style={styles.actions}>
        <Button
          label="Agree and start"
          testID="talk-agree"
          variant="primary"
          size="large"
          fullWidth
          disabled={busy}
          onPress={onAgree}
        />
        <Button
          label="Not now"
          testID="talk-not-now"
          variant="quiet"
          fullWidth
          onPress={onDecline}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { textAlign: 'center' },
  consent: { gap: rhythm.tight },
  actions: { gap: rhythm.tight, marginTop: rhythm.tight },
});
