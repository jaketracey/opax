import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Heading, Icon, Text } from '../../design/primitives';
import { spacing } from '../../design/tokens';
import { openOnWeb } from '../../navigation/external';

/** One line before every call (App Review 5.1.2(i) and honest AI output). */
export function VoiceDisclosure() {
  return (
    <Text
      variant="fine"
      tone="inkFaint"
      style={styles.centre}
      testID="talk-disclosure"
    >
      AI voice by ElevenLabs. It can be wrong: check the sources.
    </Text>
  );
}

/** A compact link to the Voice privacy page. */
export function PrivacyLink({ testID }: { testID?: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Voice privacy"
      accessibilityHint="Opens on opax.com.au"
      testID={testID}
      hitSlop={8}
      onPress={() => void openOnWeb('/privacy', 'Voice privacy')}
      style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}
    >
      <Text tone="bronzeInk" wordSafe>
        Voice privacy
      </Text>
      <Icon name="arrow.up.right" size={13} tone="bronzeInk" />
    </Pressable>
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
    <View style={styles.card} testID="talk-consent">
      <Heading level={2}>Before you talk</Heading>
      <Text>
        Your voice and the conversation go to ElevenLabs, OPAX’s voice provider,
        so it can answer you.
      </Text>
      <Text>
        OPAX keeps each call’s times and ElevenLabs reference on your account:
        no audio, no transcript.
      </Text>
      <Text>
        ElevenLabs was set to keep no audio and to delete transcripts after a
        day (checked 9 September 2026). Its own privacy policy also applies.
      </Text>
      <Text variant="metadata">
        Stored on this iPhone. Withdraw it any time from the More menu.
      </Text>
      <PrivacyLink testID="talk-consent-privacy" />
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
  card: { gap: spacing.s3 },
  actions: { gap: spacing.s2, marginTop: spacing.s3 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.s2,
    minHeight: 44,
  },
  pressed: { opacity: 0.6 },
});
