import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Stack, router } from 'expo-router';
import {
  Button,
  Icon,
  Field,
  Group,
  Heading,
  OpaxWebLink,
  Screen,
  Section,
  Text,
} from '../../design/primitives';
import { colors, spacing } from '../../design/tokens';
import { isE2E } from '../../design/environment';
import { openOnWeb, webPageUrl } from '../../navigation/external';
import { ProfileScreen } from '../Person';
import { ElectorateScreen } from '../Electorate';
import BillDetail from '../bills/BillDetail';
import type { VoiceSource } from '../../voice';
import { clock, endCopy, failureCopy, refusal, timeLabel } from './model';
import { recordDestination } from './sources';
import { useTalk } from './useTalk';

export default function TalkScreen() {
  const call = useTalk();
  const { snapshot: s } = call;
  const [askingConsent, setAskingConsent] = useState(false);
  const [record, setRecord] = useState<VoiceSource | null>(null);
  const [queuedSource, setQueuedSource] = useState<VoiceSource | null>(null);
  const [screenReader, setScreenReader] = useState(false);
  const priorAnnouncement = useRef('');
  const statusNode = useRef<View>(null);
  const focusedEntry = useRef(false);
  const terminal = call.terminal;
  const live = s.state === 'live';
  // Checking status without a Start is not an active conversation.
  const active = call.active && (s.state !== 'checking' || call.busy);
  const blocked = refusal(s.status);
  const failure = call.error === 'signedOut' ? null : call.error;
  const message = failure
    ? failureCopy[failure]
    : terminal
      ? endCopy[terminal]
      : blocked
        ? failureCopy[blocked]
        : null;
  const stateText =
    s.state === 'ending'
      ? 'Ending the conversation…'
      : s.state === 'reserving' || s.state === 'connecting'
        ? 'Connecting…'
        : live
          ? s.mode === 'muted'
            ? 'Your microphone is muted'
            : s.mode === 'speaking'
              ? 'OPAX is speaking'
              : 'Listening to you'
          : (message ??
            (s.status
              ? 'Ready when you are. Your microphone is off.'
              : 'Checking voice availability…'));
  const seconds = live ? s.remaining : s.status?.remainingSeconds;
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setScreenReader,
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (stateText !== priorAnnouncement.current) {
      priorAnnouncement.current = stateText;
      AccessibilityInfo.announceForAccessibility(stateText);
    }
    // Captions, sources and countdown never trigger announcements.
  }, [stateText]);
  function focusStatus() {
    const node = statusNode.current ? findNodeHandle(statusNode.current) : null;
    if (screenReader && node) AccessibilityInfo.setAccessibilityFocus(node);
  }
  useEffect(() => {
    if (terminal && screenReader) {
      const node = statusNode.current
        ? findNodeHandle(statusNode.current)
        : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }
  }, [terminal, screenReader]);
  const close = () => {
    if (active)
      Alert.alert('End the conversation?', undefined, [
        { text: 'Keep talking', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: () => void call.end().then(() => router.back()),
        },
      ]);
    else router.back();
  };
  function openRecord(source: VoiceSource) {
    if (!webPageUrl(source.path)) return;
    if (recordDestination(source.path)) {
      setRecord(source);
      return;
    }
    if (!active) {
      void openOnWeb(source.path, source.title);
      return;
    }
    Alert.alert(
      'Open this record',
      'This record opens on opax.com.au after the conversation ends.',
      [
        { text: 'Keep talking', style: 'cancel' },
        { text: 'Open after the call', onPress: () => setQueuedSource(source) },
        {
          text: 'End the conversation and open',
          onPress: () =>
            void call.end().then(() => openOnWeb(source.path, source.title)),
        },
      ],
    );
  }
  const destination = record ? recordDestination(record.path) : null;
  return (
    <View
      style={styles.page}
      onMagicTap={() => {
        if (live) void call.mute();
      }}
    >
      <Stack.Screen
        options={{
          gestureEnabled: !active,
          unstable_headerRightItems: () => [
            {
              type: 'button',
              label: 'Done',
              accessibilityLabel: 'Done',
              onPress: close,
            },
          ],
        }}
      />
      {destination ? (
        <>
          <Group style={styles.recordControls}>
            <Text testID="talk-record-status" accessibilityLabel={stateText}>
              {stateText}
            </Text>
            <Button
              label="Back to conversation"
              testID="talk-record-back"
              onPress={() => setRecord(null)}
            />
            {active ? (
              <Button
                label="End call"
                testID="talk-record-end"
                onPress={() => void call.end()}
              />
            ) : null}
          </Group>
          {destination.pathname === '/bill/[key]' ? (
            <BillDetail recordKey={destination.params.key} embedded />
          ) : destination.pathname === '/person/[slug]' ? (
            <ProfileScreen slug={destination.params.slug} embedded />
          ) : (
            <ElectorateScreen id={destination.params.id} embedded />
          )}
        </>
      ) : (
        <Screen testID="talk-sheet">
          <Group>
            <Text variant="lede" testID="talk-sheet-message" wordSafe>
              Explore the record with your voice
            </Text>
            <Text>
              Ask about Australian politics, spending and the public record. You
              can interrupt or ask a follow-up.
            </Text>
            {isE2E ? (
              <Text variant="fine">
                This fixture uses synthetic input and silent playback.
              </Text>
            ) : null}
          </Group>
          <Section>
            <View
              ref={statusNode}
              accessible
              accessibilityLabel={stateText}
              testID="talk-status"
              onLayout={() => {
                if (!focusedEntry.current && screenReader) {
                  focusedEntry.current = true;
                  focusStatus();
                }
              }}
            >
              <Text wordSafe>{stateText}</Text>
            </View>
            {seconds === undefined ? (
              <Text testID="talk-allowance">
                Remaining allowance is unavailable until a fresh status check
                succeeds.
              </Text>
            ) : (
              <Text
                variant="figureInline"
                testID="talk-allowance"
                accessibilityLabel={
                  s.status?.unlimited
                    ? 'Unlimited voice access, up to 10 minutes per call'
                    : timeLabel(seconds)
                }
              >
                {s.status?.unlimited
                  ? 'Unlimited voice access · up to 10 minutes per call'
                  : `${clock(seconds)} remaining${s.status?.totalSeconds == null ? '' : ` · ${clock(s.status.totalSeconds)} free in total`}`}
              </Text>
            )}
            {active ? (
              <Group>
                <Button
                  label={
                    live
                      ? s.mode === 'muted'
                        ? 'Unmute mic'
                        : 'Mute mic'
                      : 'Cancel connection'
                  }
                  testID="talk-mute"
                  disabled={call.busy}
                  onPress={() => void (live ? call.mute() : call.end())}
                />
                <Button
                  label="End call"
                  testID="talk-end"
                  variant="danger"
                  onPress={() => void call.end()}
                />
                <Icon name="waveform" tone="navy" />
                <Text
                  testID="talk-playback"
                  accessibilityLabel={`Playback: ${s.playback}`}
                >
                  {s.playback === 'truncated'
                    ? 'Playback was cut short. The captions show the available words.'
                    : s.playback === 'buffering'
                      ? 'Playback is buffering.'
                      : 'Playback is flowing.'}
                </Text>
                {screenReader ? (
                  <Text>
                    Headphones can keep VoiceOver speech out of the microphone.
                  </Text>
                ) : null}
              </Group>
            ) : !s.status?.signedIn && s.status?.enabled ? (
              <Group>
                <Text>
                  Voice needs a free OPAX account. Everything else in the app
                  works without one.
                </Text>
                <Button
                  label="Sign in to talk for free"
                  testID="talk-sign-in"
                  onPress={() => router.replace('/account')}
                />
              </Group>
            ) : askingConsent && !call.consent ? (
              <Group testID="talk-consent">
                <Heading level={2}>Voice privacy and consent</Heading>
                <Text>
                  Your voice audio and the words of the conversation are sent to
                  ElevenLabs, OPAX’s voice provider, to understand and answer
                  you.
                </Text>
                <Text>
                  OPAX keeps voice usage and session times. The release policy
                  is no recordings and deletion of provider transcripts within
                  one day. These provider settings must be confirmed before
                  voice is released.
                </Text>
                <Text>
                  This choice is stored on this device. You can withdraw it here
                  at any time.
                </Text>
                <OpaxWebLink
                  label="Voice privacy"
                  path="/privacy"
                  testID="talk-consent-privacy"
                />
                <Button
                  label="Agree and start"
                  testID="talk-agree"
                  variant="primary"
                  disabled={call.busy || !call.consentLoaded}
                  onPress={() =>
                    void call
                      .agreeAndStart()
                      .then(() => setAskingConsent(false))
                  }
                />
                <Button
                  label="Not now"
                  testID="talk-not-now"
                  onPress={() => setAskingConsent(false)}
                />
              </Group>
            ) : (
              <Group>
                {s.status && !blocked ? (
                  <Button
                    label="Start talking"
                    testID="talk-start"
                    variant="primary"
                    disabled={call.busy || !call.consentLoaded}
                    onPress={() =>
                      call.consent ? void call.start() : setAskingConsent(true)
                    }
                  />
                ) : null}
                <Button
                  label="Check availability"
                  testID="talk-refresh"
                  disabled={call.busy}
                  onPress={() => void call.refresh()}
                />
                {blocked === 'allowanceExhausted' ||
                blocked === 'disabled' ||
                blocked === 'budgetClosed' ? (
                  <Button
                    label="Search public records"
                    testID="talk-search"
                    onPress={() => router.replace('/(tabs)/(search)')}
                  />
                ) : null}
                {failure === 'microphoneDenied' ? (
                  <Button
                    label="Open Settings"
                    testID="talk-settings"
                    onPress={() => void Linking.openSettings()}
                  />
                ) : null}
                {s.status?.activeSession ? (
                  <Text testID="talk-open-session">
                    The previous conversation is still closing.
                    {s.status.activeSession.expiresAt
                      ? ` Its current expiry is ${new Date(s.status.activeSession.expiresAt * 1000).toLocaleString('en-AU')}.`
                      : ''}{' '}
                    Check availability before starting again.
                  </Text>
                ) : null}
              </Group>
            )}
          </Section>
          <Section>
            <Text>
              AI voice powered by ElevenLabs. Answers may be mistaken; check the
              linked records.
            </Text>
            <Text>
              Your microphone starts only after you choose Start talking, agree
              to voice processing and allow microphone access.
            </Text>
            <OpaxWebLink label="Voice privacy" path="/privacy" />
            <Text testID="talk-consent-state">
              {call.consent
                ? 'Voice processing consent is given on this device.'
                : 'Voice processing consent has not been given on this device.'}
            </Text>
            {call.consent ? (
              <Button
                label="Withdraw voice consent"
                testID="talk-withdraw"
                onPress={() =>
                  void call
                    .changeConsent(false)
                    .then(() => setAskingConsent(false))
                }
              />
            ) : null}
          </Section>
          {s.transcript.length ? (
            <Section title="Captions">
              {s.transcript.map((turn) => (
                <Group
                  key={`${turn.role}-${turn.id}`}
                  accessible
                  accessibilityLabel={`${turn.role === 'user' ? 'You' : 'OPAX'} said ${turn.text}`}
                  testID={`talk-turn-${turn.role}`}
                >
                  <Text variant="metadata">
                    {turn.role === 'user' ? 'You' : 'OPAX'}
                  </Text>
                  <Text>{turn.text}</Text>
                </Group>
              ))}
            </Section>
          ) : null}
          {s.sources.length ? (
            <Section title="Sources">
              {s.sources
                .filter((source) => webPageUrl(source.path))
                .map((source, index) => (
                  <Pressable
                    key={source.path}
                    testID={`talk-source-${index}`}
                    accessibilityRole="link"
                    accessibilityLabel={source.title}
                    accessibilityHint={
                      recordDestination(source.path)
                        ? 'Opens the record within the conversation'
                        : 'Opens on opax.com.au after the conversation'
                    }
                    onPress={() => openRecord(source)}
                    style={styles.source}
                  >
                    <Text tone="bronzeInk" wordSafe>
                      {source.title}
                    </Text>
                  </Pressable>
                ))}
            </Section>
          ) : null}
          {live ? <TypedMessage send={call.send} busy={call.busy} /> : null}
          {!active && queuedSource ? (
            <Button
              label={`Open record: ${queuedSource.title}`}
              testID="talk-queued-source"
              onPress={() => {
                void openOnWeb(queuedSource.path, queuedSource.title);
                setQueuedSource(null);
              }}
            />
          ) : null}
        </Screen>
      )}
    </View>
  );
}
function TypedMessage({
  send,
  busy,
}: {
  send: ReturnType<typeof useTalk>['send'];
  busy: boolean;
}) {
  const [text, setText] = useState('');
  return (
    <Section title="Type instead">
      <Field
        label="Message to OPAX"
        testID="talk-text"
        value={text}
        onChangeText={setText}
        multiline
        maxLength={2000}
      />
      <Text variant="fine">Typed messages still use call time.</Text>
      <Button
        label="Send message"
        testID="talk-send"
        disabled={!text.trim() || busy}
        onPress={() =>
          void send(text).then((result) => {
            if (result?.ok) setText('');
          })
        }
      />
    </Section>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  recordControls: { padding: spacing.s4 },
  source: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.s3,
  },
});
