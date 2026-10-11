import { phoneCopy } from '../../design/phone-copy';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { Button, Heading, LinkRow, Text } from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { openOnWeb } from '../../navigation/external';
import { microphoneCopy } from './model';

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
      <PanelHeading>Before you talk</PanelHeading>
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

/**
 * Android's microphone rationale, after consent and before the system
 * dialog: the iOS purpose string, which Android's dialog has no room for.
 */
export function MicrophoneRationale({
  busy,
  onContinue,
  onDecline,
}: {
  busy: boolean;
  onContinue: () => void;
  onDecline: () => void;
}) {
  return (
    <View style={styles.consent} testID="talk-microphone">
      <PanelHeading>{microphoneCopy.heading}</PanelHeading>
      <Text wordSafe testID="talk-microphone-purpose">
        {microphoneCopy.purpose}
      </Text>
      <Text wordSafe variant="metadata">
        {microphoneCopy.next}
      </Text>
      <View style={styles.actions}>
        <Button
          label={microphoneCopy.continue}
          testID="talk-microphone-continue"
          variant="primary"
          size="large"
          fullWidth
          disabled={busy}
          onPress={onContinue}
        />
        <Button
          label={microphoneCopy.notNow}
          testID="talk-microphone-not-now"
          variant="quiet"
          fullWidth
          onPress={onDecline}
        />
      </View>
    </View>
  );
}

/**
 * A panel's heading. The panel replaces Start, so on Android TalkBack is
 * moved to it rather than left on a control that has gone; VoiceOver keeps
 * the released iOS behaviour.
 */
function PanelHeading({ children }: { children: string }) {
  const heading = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS === 'android' && heading.current)
      AccessibilityInfo.sendAccessibilityEvent(heading.current, 'focus');
  }, []);
  if (Platform.OS !== 'android') return <Heading level={2}>{children}</Heading>;
  return (
    <View
      ref={heading}
      accessible
      accessibilityRole="header"
      accessibilityLabel={children}
    >
      <Heading level={2}>{children}</Heading>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { textAlign: 'center' },
  consent: { gap: rhythm.tight },
  actions: { gap: rhythm.tight, marginTop: rhythm.tight },
});
