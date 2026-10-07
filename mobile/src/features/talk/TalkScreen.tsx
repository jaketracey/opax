import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  findNodeHandle,
  Linking,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Field, Text, useReduceMotion } from '../../design/primitives';
import { chrome, colors, layout, spacing } from '../../design/tokens';
import { openOnWeb, webPageUrl } from '../../navigation/external';
import { ProfileScreen } from '../Person';
import { ElectorateScreen } from '../Electorate';
import BillDetail from '../bills/BillDetail';
import DocumentReader from '../records/DocumentReader';
import BillTextReader from '../records/BillTextReader';
import type { VoiceSource } from '../../voice';
import { endCopy, failureCopy, refusal, timeLabel } from './model';
import { recordDestination } from './sources';
import { useTalk } from './useTalk';
import { AnswerCaption } from './AnswerCaption';
import { reportAnswer, reportChoices, type ReportAnswer } from './reportAnswer';
import { VoiceOrb, type OrbPhase } from './VoiceOrb';
import { useVoiceLevels } from './useVoiceLevels';
import { useCaptionsPreference } from './captions-preference';
import { canReport, minutesLeft, talkMenu, timeLeft } from './menu';
import { ControlRow, RoundButton } from './CallControls';
import { openableSources, SourcesSheet } from './SourcesSheet';
import { Consent, VoiceDisclosure } from './Consent';
import { accountCopy } from '../account/copy';

type Action = 'start' | 'signIn' | 'search' | 'settings' | 'retry';

/**
 * UIKit drops a sheet, browser or keyboard presented while a menu is still
 * closing, so a menu action that presents waits for the menu to go.
 */
const afterMenu = (action: () => void) => setTimeout(action, 600);

export default function TalkScreen({
  onReportAnswer = reportAnswer,
}: { onReportAnswer?: ReportAnswer } = {}) {
  const call = useTalk();
  const { snapshot: s } = call;
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [askingConsent, setAskingConsent] = useState(false);
  const [record, setRecord] = useState<VoiceSource | null>(null);
  const [queuedSource, setQueuedSource] = useState<VoiceSource | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [chosenSource, setChosenSource] = useState<VoiceSource | null>(null);
  const [typing, setTyping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [captions, setCaptions] = useCaptionsPreference();
  const [screenReader, setScreenReader] = useState(false);
  const [stage, setStage] = useState<{ width: number; height: number } | null>(
    null,
  );
  const priorAnnouncement = useRef('');
  const statusNode = useRef<View>(null);
  const page = useRef<ScrollView>(null);
  const captionsList = useRef<ScrollView>(null);
  const focusedEntry = useRef(false);
  const terminal = call.terminal;
  const live = s.state === 'live';
  // Checking status without a Start is not an active conversation.
  const active = call.active && (s.state !== 'checking' || call.busy);
  const blocked = refusal(s.status);
  const failure = call.error === 'signedOut' ? null : call.error;
  // Newest first: a failure, then this sheet's own notice (it follows any
  // ending it replaces), then how the last call ended, then a refusal.
  const message = failure
    ? failureCopy[failure]
    : (notice ??
      (terminal ? endCopy[terminal] : blocked ? failureCopy[blocked] : null));
  const lastTurn = s.transcript[s.transcript.length - 1];
  const phase: OrbPhase = !active
    ? 'rest'
    : s.state === 'ending'
      ? 'rest'
      : !live
        ? 'connecting'
        : s.mode === 'muted'
          ? 'muted'
          : s.mode === 'speaking'
            ? 'speaking'
            : lastTurn?.role === 'user'
              ? 'thinking'
              : 'listening';
  // Spoken by VoiceOver on every change; the screen itself shows no labels.
  const stateText =
    s.state === 'ending'
      ? 'Ending the call'
      : active && !live
        ? 'Connecting'
        : live
          ? s.mode === 'muted'
            ? 'Microphone muted'
            : s.mode === 'speaking'
              ? 'OPAX is speaking'
              : 'Listening'
          : (message ??
            (s.status ? 'Ready to talk. Microphone off.' : 'Checking voice'));
  const action: Action | null = !s.status
    ? failure
      ? 'retry'
      : null
    : s.status.enabled && !s.status.signedIn
      ? 'signIn'
      : blocked === 'callOpen'
        ? 'retry'
        : blocked
          ? 'search'
          : failure === 'microphoneDenied'
            ? 'settings'
            : 'start';
  const sources = openableSources(s.sources);
  const showCaptions = captions && s.transcript.length > 0;
  const levels = useVoiceLevels(live);

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
  useEffect(() => {
    if (terminal && screenReader) {
      const node = statusNode.current
        ? findNodeHandle(statusNode.current)
        : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }
  }, [terminal, screenReader]);
  useEffect(() => {
    // Start and the end of a call bring the orb and controls back into view.
    page.current?.scrollTo({ y: 0, animated: false });
  }, [active]);

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
  const withdraw = () =>
    void call.changeConsent(false).then((stored) => {
      setAskingConsent(false);
      if (stored) setNotice(endCopy.consentWithdrawn);
    });
  const start = () => {
    setNotice(null);
    setTyping(false);
    if (call.consent) void call.start();
    else setAskingConsent(true);
  };
  // Header items are native: rebuild them only when the menu changes, never
  // on each countdown tick, so an open menu is not replaced under a finger.
  const handlers = useRef({
    close,
    withdraw,
    report: onReportAnswer,
  });
  useLayoutEffect(() => {
    handlers.current = { close, withdraw, report: onReportAnswer };
  });
  const menuTitle = timeLeft(live, s.remaining, s.status);
  const reportable = canReport(s.transcript);
  const records = useMemo(() => reportChoices(s.sources), [s.sources]);
  const screenOptions = useMemo(
    () => ({
      title: active ? '' : 'Talk to OPAX',
      gestureEnabled: !active,
      unstable_headerRightItems: () => [
        talkMenu({
          title: menuTitle,
          live,
          active,
          typing,
          report: reportable,
          records,
          consent: call.consent,
          onType: () => afterMenu(() => setTyping(true)),
          onReport: (path) =>
            afterMenu(() => void handlers.current.report(path)),
          onPrivacy: () =>
            afterMenu(() => void openOnWeb('/privacy', 'Voice privacy')),
          onWithdraw: () => handlers.current.withdraw(),
        }),
        {
          type: 'button' as const,
          label: 'Done',
          tintColor: chrome.tint,
          accessibilityLabel: 'Done',
          onPress: () => handlers.current.close(),
        },
      ],
    }),
    [menuTitle, live, active, typing, reportable, records, call.consent],
  );

  const destination = record ? recordDestination(record.path) : null;
  const onStage = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStage((prior) =>
      prior && prior.width === width && prior.height === height
        ? prior
        : { width, height },
    );
  };
  // Consent needs the room: the orb steps back to whatever space is left,
  // and leaves altogether when that is too small to read as the orb.
  const consenting = askingConsent && !call.consent && !active;
  const fitted = stage ? Math.min(stage.width, stage.height, 380) : 0;
  const orbSize = consenting && fitted < 64 ? 0 : fitted;
  const captionsButton = (
    <RoundButton
      symbol={captions ? 'captions.bubble.fill' : 'captions.bubble'}
      label="Captions"
      size="small"
      look={captions ? 'on' : 'plain'}
      selected={captions}
      testID="talk-captions"
      onPress={() => setCaptions(!captions)}
    />
  );
  const sourcesButton = sources.length ? (
    <RoundButton
      symbol="books.vertical"
      label={`Sources, ${sources.length}`}
      size="small"
      badge={sources.length}
      testID="talk-sources"
      onPress={() => setSourcesOpen(true)}
    />
  ) : (
    <View style={styles.slot} />
  );

  return (
    <View
      style={styles.page}
      onMagicTap={() => {
        if (live) void call.mute();
      }}
    >
      <Stack.Screen options={screenOptions} />
      {destination ? (
        <>
          <View style={styles.recordBar}>
            <Button
              label="Back to call"
              icon="chevron.left"
              variant="quiet"
              size="compact"
              testID="talk-record-back"
              onPress={() => setRecord(null)}
            />
            <View
              ref={statusNode}
              accessible
              accessibilityLanguage="en-AU"
              testID="talk-record-status"
              accessibilityLabel={stateText}
              style={styles.recordStatus}
            >
              <VoiceOrb
                phase={phase}
                levels={levels}
                size={44}
                reduceMotion={reduceMotion}
              />
            </View>
            {active ? (
              <RoundButton
                symbol="phone.down.fill"
                label="End call"
                look="danger"
                size="bar"
                testID="talk-record-end"
                onPress={() => void call.end()}
              />
            ) : null}
          </View>
          {destination.pathname === '/bill/[key]' ? (
            <BillDetail recordKey={destination.params.key} embedded />
          ) : destination.pathname === '/person/[slug]' ? (
            <ProfileScreen slug={destination.params.slug} embedded />
          ) : destination.pathname === '/doc/[slug]' ? (
            <DocumentReader recordSlug={destination.params.slug} embedded />
          ) : destination.pathname === '/bill-text/[key]' ? (
            <BillTextReader recordKey={destination.params.key} embedded />
          ) : destination.pathname === '/electorate/[id]' ? (
            <ElectorateScreen id={destination.params.id} embedded />
          ) : null}
        </>
      ) : (
        <ScrollView
          ref={page}
          testID="talk-sheet"
          style={styles.page}
          // The sheet's bar is opaque and the dock pads the home indicator,
          // so the page fits the screen exactly at standard sizes.
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[
            styles.body,
            { paddingBottom: Math.max(insets.bottom, spacing.s4) + spacing.s4 },
          ]}
        >
          <View
            style={[styles.stage, consenting ? styles.emblem : null]}
            onLayout={onStage}
          >
            {/* Absolute, so the orb never props the stage open: the stage
                is exactly the room the dock and captions leave. */}
            <View style={styles.orbFrame}>
              <View
                ref={statusNode}
                accessible
                accessibilityLanguage="en-AU"
                accessibilityLabel={stateText}
                accessibilityHint={
                  screenReader && active
                    ? 'Headphones keep VoiceOver speech out of the microphone.'
                    : undefined
                }
                testID="talk-status"
                onLayout={() => {
                  if (!focusedEntry.current && screenReader) {
                    focusedEntry.current = true;
                    const node = statusNode.current
                      ? findNodeHandle(statusNode.current)
                      : null;
                    if (node) AccessibilityInfo.setAccessibilityFocus(node);
                  }
                }}
                style={{ width: orbSize, height: orbSize }}
              >
                {orbSize ? (
                  <VoiceOrb
                    phase={phase}
                    levels={levels}
                    size={orbSize}
                    reduceMotion={reduceMotion}
                  />
                ) : null}
              </View>
            </View>
          </View>
          {showCaptions ? (
            <ScrollView
              ref={captionsList}
              testID="talk-captions-list"
              style={styles.captions}
              contentContainerStyle={styles.captionsContent}
              onContentSizeChange={() =>
                captionsList.current?.scrollToEnd({ animated: !reduceMotion })
              }
            >
              {s.transcript.map((turn) => (
                <AnswerCaption key={`${turn.role}-${turn.id}`} turn={turn} />
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.dock} testID="talk-sheet-message">
            {active ? (
              <>
                {typing && live ? (
                  <TypedMessage
                    send={call.send}
                    busy={call.busy}
                    onClose={() => setTyping(false)}
                  />
                ) : null}
                {s.playback === 'truncated' && !captions ? (
                  <View style={styles.inline} testID="talk-playback">
                    <Text variant="fine" style={styles.centre}>
                      Playback was cut short.
                    </Text>
                    <Button
                      label="Show captions"
                      variant="quiet"
                      size="compact"
                      onPress={() => setCaptions(true)}
                    />
                  </View>
                ) : null}
                <ControlRow>
                  {captionsButton}
                  <RoundButton
                    symbol={s.mode === 'muted' ? 'mic.slash.fill' : 'mic.fill'}
                    label={s.mode === 'muted' ? 'Unmute' : 'Mute'}
                    look={s.mode === 'muted' ? 'on' : 'plain'}
                    selected={s.mode === 'muted'}
                    disabled={!live || call.busy}
                    testID="talk-mute"
                    onPress={() => void call.mute()}
                  />
                  <RoundButton
                    symbol="phone.down.fill"
                    label={live ? 'End call' : 'Cancel call'}
                    look="danger"
                    disabled={s.state === 'ending'}
                    testID="talk-end"
                    onPress={() => void call.end()}
                  />
                  {sourcesButton}
                </ControlRow>
              </>
            ) : askingConsent && !call.consent ? (
              <Consent
                busy={call.busy || !call.consentLoaded}
                onAgree={() =>
                  void call.agreeAndStart().then(() => setAskingConsent(false))
                }
                onDecline={() => setAskingConsent(false)}
              />
            ) : (
              <>
                {message ? (
                  <Text
                    style={styles.centre}
                    testID="talk-message"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    {message}
                  </Text>
                ) : null}
                {queuedSource ? (
                  <Button
                    label={`Open ${queuedSource.title}`}
                    variant="quiet"
                    testID="talk-queued-source"
                    onPress={() => {
                      void openOnWeb(queuedSource.path, queuedSource.title);
                      setQueuedSource(null);
                    }}
                  />
                ) : null}
                {action ? (
                  <ControlRow>
                    {s.transcript.length ? captionsButton : null}
                    <View style={styles.primary}>
                      <PrimaryAction
                        action={action}
                        busy={
                          call.busy ||
                          (action === 'start' && !call.consentLoaded)
                        }
                        onStart={start}
                        onRetry={() => void call.refresh()}
                      />
                    </View>
                    {s.transcript.length || sources.length
                      ? sourcesButton
                      : null}
                  </ControlRow>
                ) : null}
                {s.status?.signedIn ? (
                  <Text
                    variant="fine"
                    style={styles.centre}
                    testID="talk-allowance"
                    accessibilityLabel={
                      s.status.unlimited
                        ? 'Unlimited voice minutes, up to 10 minutes per call'
                        : timeLabel(s.status.remainingSeconds)
                    }
                  >
                    {s.status.unlimited
                      ? 'Unlimited minutes'
                      : `${minutesLeft(s.status.remainingSeconds)} left`}
                  </Text>
                ) : null}
                {action === 'signIn' ? (
                  <Text
                    variant="metadata"
                    style={styles.centre}
                    testID="talk-age-limit"
                  >
                    {accountCopy.ageLimit}
                  </Text>
                ) : null}
                {action === 'start' ? <VoiceDisclosure /> : null}
              </>
            )}
          </View>
        </ScrollView>
      )}
      <SourcesSheet
        visible={sourcesOpen}
        sources={s.sources}
        active={active}
        onOpen={(source) => {
          setChosenSource(source);
          setSourcesOpen(false);
        }}
        onClose={() => setSourcesOpen(false)}
        onDismiss={() => {
          // Open the record only once the sheet has gone, so an alert or the
          // embedded record never appears beneath it.
          if (chosenSource) openRecord(chosenSource);
          setChosenSource(null);
        }}
      />
    </View>
  );
}

function PrimaryAction({
  action,
  busy,
  onStart,
  onRetry,
}: {
  action: Action;
  busy: boolean;
  onStart: () => void;
  onRetry: () => void;
}) {
  switch (action) {
    case 'start':
      return (
        <Button
          label="Start"
          icon="mic.fill"
          variant="primary"
          size="large"
          fullWidth
          testID="talk-start"
          disabled={busy}
          onPress={onStart}
        />
      );
    case 'signIn':
      return (
        <Button
          label="Sign in"
          variant="primary"
          size="large"
          fullWidth
          testID="talk-sign-in"
          onPress={() => router.replace('/account')}
        />
      );
    case 'search':
      return (
        <Button
          label="Search the record"
          size="large"
          fullWidth
          testID="talk-search"
          onPress={() => router.replace('/(tabs)/(search)')}
        />
      );
    case 'settings':
      return (
        <Button
          label="Open Settings"
          size="large"
          fullWidth
          testID="talk-settings"
          onPress={() => void Linking.openSettings()}
        />
      );
    case 'retry':
      return (
        <Button
          label="Try again"
          size="large"
          fullWidth
          testID="talk-refresh"
          disabled={busy}
          onPress={onRetry}
        />
      );
  }
}

function TypedMessage({
  send,
  busy,
  onClose,
}: {
  send: ReturnType<typeof useTalk>['send'];
  busy: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  return (
    <View style={styles.typed}>
      <Field
        label="Message to OPAX"
        testID="talk-text"
        value={text}
        onChangeText={setText}
        multiline
        maxLength={2000}
        autoFocus
      />
      <View style={styles.typedActions}>
        <Button
          label="Close"
          variant="quiet"
          size="compact"
          testID="talk-text-close"
          onPress={onClose}
        />
        <Button
          label="Send"
          variant="primary"
          size="compact"
          testID="talk-send"
          disabled={!text.trim() || busy}
          onPress={() =>
            void send(text).then((result) => {
              if (result?.ok) setText('');
            })
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  body: {
    flexGrow: 1,
    paddingHorizontal: layout.screenMargin,
    gap: spacing.s5,
  },
  stage: {
    flex: 1,
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captions: { flexGrow: 0, maxHeight: 260 },
  captionsContent: { gap: spacing.s4, paddingVertical: spacing.s3 },
  dock: { gap: spacing.s4, alignItems: 'stretch' },
  centre: { textAlign: 'center' },
  inline: { alignItems: 'center' },
  slot: { width: 54, height: 54 },
  primary: { flexGrow: 1, flexShrink: 1, maxWidth: 280 },
  typed: { gap: spacing.s3 },
  typedActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.s3,
  },
  recordBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerSubtle,
  },
  recordStatus: { width: 44, height: 44 },
  emblem: { minHeight: 0 },
  orbFrame: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
