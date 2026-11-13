import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  ErrorState,
  Heading,
  InsetGroup,
  LinkRow,
  MachinePill,
  Text,
} from '../../design/primitives';
import { colors, layout, rhythm } from '../../design/tokens';
import { openOnWeb } from '../../navigation/external';
import { useFittedSheetHeight } from '../sheets/fitted';
import { setConsent } from './bridge';
import { requestStartAfterConsent } from './consent-store';
import { failureCopy, microphoneCopy, talkCopy } from './model';

/** One line before every call (App Review 5.1.2(i) and honest AI output). */
export function VoiceDisclosure() {
  return (
    <Text
      wordSafe
      variant="footnote"
      tone="inkSoft"
      style={styles.centre}
      testID="talk-disclosure"
    >
      {talkCopy.disclosure}
    </Text>
  );
}

/**
 * What voice sends and keeps, in two paragraphs. Talk's consent sheet and
 * Account's Voice consent page both draw this one component, so the words
 * and the dated ElevenLabs check never drift apart (specs/account.md 2.2).
 */
export function VoiceConsentText() {
  return (
    <View style={styles.paragraphs}>
      <Text wordSafe variant="body">
        {talkCopy.consent.sends}
      </Text>
      <Text wordSafe variant="body">
        {talkCopy.consent.keeps}
      </Text>
    </View>
  );
}

export const talkMachineNote = {
  title: 'Machine-written',
  body: [
    'OPAX’s voice answers are written and spoken by an AI model from the public record. It can be wrong, so check the sources.',
  ],
};

export { SHEET_HEADER } from '../sheets/fitted';

/**
 * `/talk/consent`, a form sheet sized to its content (7.7). The text scrolls
 * under the two buttons, which stay pinned at the foot, so at the largest
 * text sizes both are always on screen. Agree stores consent and asks the
 * Talk screen to start once the sheet has gone; Not now and a swipe down
 * leave everything as it was.
 */
export function ConsentSheet() {
  const insets = useSafeAreaInsets();
  // Capped at the space the sheet can use, so at AX5 the text scrolls and
  // the two buttons stay above the home indicator (7.7).
  const maxHeight = useFittedSheetHeight();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [under, setUnder] = useState(false);
  const mounted = useRef(false);
  const saving = useRef(false);
  const closed = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const dismiss = () => {
    if (closed.current) return;
    closed.current = true;
    router.back();
  };
  const size = useRef({ view: 0, content: 0, y: 0 });
  const measure = () => {
    const { view, content, y } = size.current;
    setUnder(content - y > view + 1);
  };
  const agree = async () => {
    if (saving.current || closed.current) return;
    saving.current = true;
    setBusy(true);
    setFailed(false);
    const stored = await setConsent(true);
    if (!mounted.current || closed.current) return;
    saving.current = false;
    setBusy(false);
    if (!stored) {
      setFailed(true);
      return;
    }
    requestStartAfterConsent();
    dismiss();
  };
  return (
    <View
      style={[
        styles.sheet,
        {
          maxHeight,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
      testID="talk-consent-sheet"
    >
      <ScrollView
        style={styles.scroll}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.body}
        onLayout={(event) => {
          size.current.view = event.nativeEvent.layout.height;
          measure();
        }}
        onContentSizeChange={(_, height) => {
          size.current.content = height;
          measure();
        }}
        onScroll={(event) => {
          size.current.y = event.nativeEvent.contentOffset.y;
          measure();
        }}
        scrollEventThrottle={32}
      >
        <View testID="talk-consent">
          <MachinePill note={talkMachineNote} testID="talk-consent-machine" />
        </View>
        <VoiceConsentText />
        <Text wordSafe variant="footnote" tone="inkSoft">
          {talkCopy.consent.withdraw}
        </Text>
        <InsetGroup>
          <LinkRow
            title={talkCopy.consent.voicePrivacy}
            external
            accessibilityHint="Opens on opax.com.au"
            testID="talk-consent-privacy"
            onPress={() =>
              void openOnWeb('/privacy', talkCopy.consent.voicePrivacy)
            }
          />
        </InsetGroup>
        {failed ? (
          <ErrorState
            message={failureCopy.unavailable}
            testID="talk-consent-error"
          />
        ) : null}
      </ScrollView>
      <View
        testID="talk-consent-footer"
        style={[
          styles.footer,
          under ? styles.separated : null,
          { paddingBottom: Math.max(insets.bottom, rhythm.block) },
        ]}
      >
        <Button
          label={talkCopy.consent.agree}
          testID="talk-agree"
          variant="primary"
          size="large"
          fullWidth
          loading={busy}
          onPress={() => void agree()}
        />
        <Button
          label={talkCopy.consent.notNow}
          testID="talk-not-now"
          variant="plain"
          fullWidth
          onPress={dismiss}
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
    <View style={styles.panel} testID="talk-microphone">
      <PanelHeading>{microphoneCopy.heading}</PanelHeading>
      <Text wordSafe testID="talk-microphone-purpose">
        {microphoneCopy.purpose}
      </Text>
      <Text wordSafe variant="footnote" tone="inkSoft">
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
          variant="plain"
          fullWidth
          onPress={onDecline}
        />
      </View>
    </View>
  );
}

/**
 * A panel's heading. The panel replaces Start, so on Android TalkBack is
 * moved to it rather than left on a control that has gone.
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
  paragraphs: { gap: rhythm.block },
  sheet: { backgroundColor: colors.paper },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: {
    gap: rhythm.block,
    paddingHorizontal: layout.screenMargin,
    paddingTop: rhythm.block,
    paddingBottom: rhythm.block,
  },
  footer: {
    gap: rhythm.tight,
    paddingHorizontal: rhythm.block,
    paddingTop: rhythm.block,
    backgroundColor: colors.paper,
  },
  separated: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.dividerDefault,
  },
  panel: { gap: rhythm.tight },
  actions: { gap: rhythm.tight, marginTop: rhythm.tight },
});
