import { RouteOptions } from '../../navigation/preview';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  AccessibilityInfo,
  Alert,
  BackHandler,
  findNodeHandle,
  LayoutAnimation,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  Button,
  Composer,
  InlineError,
  MachinePill,
  Text,
  useAccessibilitySize,
  useReduceMotion,
} from '../../design/primitives';
import { useAdaptiveDevice, useLayout } from '../../design/adaptive';
import { placeClear, type Rect } from '../../design/fold';
import { ReservedRegionArea, useReservedRegions } from '../../design/fold-area';
import { designFlags } from '../../design/flags';
import { colors, layout, rhythm } from '../../design/tokens';
import { closeSheetItem, androidHeaderBar } from '../../navigation/chrome';
import { openOnWeb } from '../../navigation/external';
import {
  talkRecordRouteFor,
  talkSignInRoute,
  talkSourcesRoute,
  talkConsentRoute,
} from '../../navigation/routes/account';
import type { VoiceSource } from '../../voice';
import {
  endCopy,
  failureCopy,
  microphoneCopy,
  refusal,
  talkCopy,
  voiceTime,
  voiceTimeSpoken,
} from './model';
import {
  askDraftDestination,
  canOpenSource,
  recordDestination,
} from './sources';
import { useTalk } from './useTalk';
import { AnswerCaption } from './AnswerCaption';
import { workingCaption } from './caption-text';
import { TranscriptEdge, TRANSCRIPT_EDGE_HEIGHT } from './TranscriptEdge';
import { reportAnswer, reportChoices, type ReportAnswer } from './reportAnswer';
import { VoiceOrb, type OrbPhase } from './VoiceOrb';
import { useVoiceLevels } from './useVoiceLevels';
import { useCaptionsPreference } from './captions-preference';
import { canReport, talkMenu, timeLeft } from './menu';
import { CallControls } from './CallControls';
import { openableSources } from './SourcesSheet';
import {
  MicrophoneRationale,
  talkMachineNote,
  VoiceDisclosure,
} from './Consent';
import { takeConsentAfterSignIn, takeStartAfterConsent } from './consent-store';
import { leaveTalk } from './leave';
import { publishTalk, resetTalk, takeChosenSource } from './live';
import { talkDockPlacement } from './geometry';

type Action =
  | 'start'
  | 'startAgain'
  | 'checking'
  | 'signIn'
  | 'ask'
  | 'settings'
  | 'retry';

/**
 * UIKit drops a sheet, browser or keyboard presented while a menu is still
 * closing, so a menu action that presents waits for the menu to go.
 */
const afterMenu = (action: () => void) => setTimeout(action, 600);
const android = Platform.OS === 'android';
/** Moves VoiceOver or TalkBack to a view (setAccessibilityFocus is iOS-only). */
const focusOn = (view: View | null) => {
  if (!view) return;
  if (android) AccessibilityInfo.sendAccessibilityEvent(view, 'focus');
  else {
    const node = findNodeHandle(view);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }
};
const ORB_MAX = 240;
const ORB_AX = 120;
const ORB_CALL = 72;
const STATUS_LINE = 40;

function AndroidCallGuard({
  active,
  permittedRef,
  close,
}: {
  active: boolean;
  permittedRef: RefObject<boolean>;
  close: (finish: () => void) => void;
}) {
  const navigation = useNavigation();
  useEffect(() => {
    if (active) permittedRef.current = false;
  }, [active, permittedRef]);
  usePreventRemove(active, ({ data }) => {
    const finish = () => navigation.dispatch(data.action);
    if (permittedRef.current) finish();
    else close(finish);
  });
  return null;
}
/** One question a day from the reviewed Ask starter list (7.3 item 3). */
function exampleQuestion(): string | null {
  // The list is not shipped yet (DIR 9.D item D5): no hand-written fallback.
  return null;
}

/**
 * Talk to OPAX (specs/account.md 7). Idle: the orb, what Talk is, one action
 * for the state, the allowance and the disclosure. In a call: a small orb with
 * the status, the captions from the first turn, and four controls. Talk never
 * starts by itself: only Start, or Agree on the consent sheet, starts a call.
 */
export default function TalkScreen({
  onReportAnswer = reportAnswer,
}: { onReportAnswer?: ReportAnswer } = {}) {
  return (
    <SafeAreaView edges={['left', 'right']} style={styles.page}>
      <ReservedRegionArea style={styles.page}>
        <TalkContent onReportAnswer={onReportAnswer} />
      </ReservedRegionArea>
    </SafeAreaView>
  );
}

function TalkContent({ onReportAnswer }: { onReportAnswer: ReportAnswer }) {
  const call = useTalk();
  const exitConfirmed = useRef(false);
  const { snapshot: s } = call;
  const insets = useSafeAreaInsets();
  const adaptive = useAdaptiveDevice();
  const layoutRule = useLayout();
  const regions = useReservedRegions();
  const [body, setBody] = useState<Rect | null>(null);
  const [dock, setDock] = useState<{ width: number; height: number } | null>(
    null,
  );
  const reduceMotion = useReduceMotion();
  const large = useAccessibilitySize();
  const [queuedSource, setQueuedSource] = useState<VoiceSource | null>(null);
  const [typing, setTyping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [captions, setCaptions] = useCaptionsPreference();
  const [screenReader, setScreenReader] = useState(false);
  const [stage, setStage] = useState<Rect | null>(null);
  const priorAnnouncement = useRef('');
  const statusNode = useRef<View>(null);
  const captionsList = useRef<ScrollView>(null);
  const pinned = useRef(true);
  const focusedEntry = useRef(false);
  const terminal = call.terminal;
  const live = s.state === 'live';
  // Checking status without a Start is not an active conversation.
  const active = call.active && (s.state !== 'checking' || call.busy);
  const blocked = refusal(s.status);
  const signedOut = call.error === 'signedOut' || blocked === 'signedOut';
  const failure = call.error === 'signedOut' ? null : call.error;
  const offline = failure === 'network' || failure === 'timeout';
  const statusFailed = !s.status && failure !== null;
  // Android's answer to the last microphone request (src/voice/microphone.ts).
  const microphoneRefused =
    call.microphone === 'denied' || call.microphone === 'blocked'
      ? microphoneCopy[call.microphone]
      : null;
  const microphoneDenied =
    failure === 'microphoneDenied' || call.microphone === 'blocked';
  // Newest first: a failure, then the microphone answer, then this sheet's
  // own notice, then how the last call ended, then a refusal. Signed out is
  // not a message: its footnote names the free minutes instead.
  const message = statusFailed
    ? null
    : failure
      ? failureCopy[failure]
      : (microphoneRefused ??
        notice ??
        (terminal
          ? endCopy[terminal]
          : blocked && blocked !== 'signedOut'
            ? failureCopy[blocked]
            : null));
  const lastTurn = s.transcript[s.transcript.length - 1];
  const working =
    active && s.state !== 'ending' ? workingCaption(lastTurn) : null;
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
  const statusText =
    s.state === 'ending'
      ? talkCopy.status.ending
      : active && !live
        ? talkCopy.status.connecting
        : live
          ? (talkCopy.status[phase === 'rest' ? 'listening' : phase] ??
            talkCopy.status.listening)
          : null;
  // Spoken on every change (VoiceOver's announcement, TalkBack's live
  // region): what the call is doing, else what went wrong, else readiness.
  const stateText =
    statusText ??
    (statusFailed
      ? offline
        ? talkCopy.offline
        : talkCopy.checkFailed
      : (message ??
        (signedOut
          ? failureCopy.signedOut
          : s.status
            ? talkCopy.status.ready
            : talkCopy.status.checking)));
  const action: Action = signedOut
    ? 'signIn'
    : !s.status
      ? statusFailed
        ? 'retry'
        : 'checking'
      : blocked === 'callOpen'
        ? 'retry'
        : blocked
          ? 'ask'
          : microphoneDenied
            ? 'settings'
            : terminal || s.transcript.length
              ? 'startAgain'
              : 'start';
  const sources = openableSources(s.sources);
  const showTranscript = captions && s.transcript.length > 0;
  // The call row and transcript only while captions show (7.4); hidden, the
  // large orb stays on the stage with the status under it.
  const compact = captions && (active || s.transcript.length > 0);
  const levels = useVoiceLevels(live);
  const startable = action === 'start' || action === 'startAgain';
  const rationale = !active && call.microphone === 'rationale';
  const showIntro =
    !active &&
    !rationale &&
    !terminal &&
    !microphoneDenied &&
    blocked !== 'allowanceExhausted' &&
    blocked !== 'budgetClosed' &&
    blocked !== 'callOpen';
  const example = exampleQuestion();

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
      // TalkBack hears the status element's live region instead.
      if (!android) AccessibilityInfo.announceForAccessibility(stateText);
    }
    // Captions, sources and countdown never trigger announcements.
  }, [stateText]);
  useEffect(() => {
    if (terminal && screenReader) focusOn(statusNode.current);
  }, [terminal, screenReader]);
  // The orb moves between the stage and the call row (7.4).
  const priorCompact = useRef(compact);
  useLayoutEffect(() => {
    if (priorCompact.current === compact) return;
    priorCompact.current = compact;
    if (!reduceMotion)
      LayoutAnimation.configureNext(
        LayoutAnimation.create(300, 'easeInEaseOut', 'opacity'),
      );
  }, [compact, reduceMotion]);

  const close = (finish: () => void = leaveTalk) => {
    if (active)
      Alert.alert(talkCopy.endConfirm.title, undefined, [
        { text: talkCopy.endConfirm.keep, style: 'cancel' },
        {
          text: talkCopy.endConfirm.end,
          style: 'destructive',
          onPress: () =>
            void call.end().then(() => {
              exitConfirmed.current = true;
              finish();
            }),
        },
      ]);
    else finish();
  };
  /** A web record, or an Ask pay row as a draft in Ask (Talk closes first, as with Ask instead). */
  function openOutside(source: VoiceSource) {
    const draft = askDraftDestination(source.path);
    if (!draft) return void openOnWeb(source.path, source.title);
    leaveTalk();
    setTimeout(
      () =>
        router.navigate({
          pathname: '/(tabs)/(ask)/ask',
          params: draft.params,
        } as Href),
      500,
    );
  }
  function openRecord(source: VoiceSource) {
    if (!canOpenSource(source.path)) return;
    if (recordDestination(source.path)) {
      router.push(talkRecordRouteFor(source.path));
      return;
    }
    if (!active) {
      openOutside(source);
      return;
    }
    Alert.alert(
      talkCopy.webRecord.title,
      askDraftDestination(source.path)
        ? talkCopy.webRecord.askMessage(source.title)
        : talkCopy.webRecord.message(source.title),
      [
        { text: talkCopy.webRecord.keep, style: 'cancel' },
        {
          text: talkCopy.webRecord.later,
          onPress: () => setQueuedSource(source),
        },
        {
          text: talkCopy.webRecord.now,
          onPress: () =>
            void call.end().then(() => {
              // The call has ended, so the back guard must not ask again (as in close()).
              exitConfirmed.current = true;
              openOutside(source);
            }),
        },
      ],
    );
  }
  const withdraw = () =>
    void call.changeConsent(false).then((stored) => {
      if (stored) setNotice(endCopy.consentWithdrawn);
    });
  const start = () => {
    setNotice(null);
    setTyping(false);
    // Consent is asked in its own sheet; the call starts once it has gone.
    if (call.consent) void call.start();
    else router.push(talkConsentRoute);
  };
  const askInstead = () => {
    // Under D5 the reader came from Ask: closing returns there.
    leaveTalk();
    if (!designFlags.talkInAsk)
      setTimeout(() => router.navigate('/(tabs)/(ask)/ask' as Href), 500);
  };
  // Handlers the native header items and other screens call, kept current
  // without rebuilding the items on each countdown tick.
  const handlers = useRef({
    close,
    withdraw,
    openRecord,
    end: () => void call.end(),
    report: onReportAnswer,
    startConsented: call.startConsented,
  });
  useLayoutEffect(() => {
    handlers.current = {
      close,
      withdraw,
      openRecord,
      end: () => void call.end(),
      report: onReportAnswer,
      startConsented: call.startConsented,
    };
  });
  // Back from a Talk sign-in (5.8 item 6): once the focus read has settled,
  // signed in without consent opens the consent sheet, once.
  const consentAfterSignIn = useRef(false);
  useEffect(() => {
    if (!consentAfterSignIn.current || !call.settled) return;
    consentAfterSignIn.current = false;
    if (s.status?.signedIn && call.consentLoaded && !call.consent && startable)
      router.push(talkConsentRoute);
    // Only a settled focus read decides; the values are from that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.settled]);
  // Back from the consent sheet (Agree) or the Sources sheet (a choice).
  useFocusEffect(
    useCallback(() => {
      if (takeConsentAfterSignIn()) consentAfterSignIn.current = true;
      if (takeStartAfterConsent())
        void handlers.current.startConsented().then(() => setNotice(null));
      const chosen = takeChosenSource();
      if (chosen) setTimeout(() => handlers.current.openRecord(chosen), 0);
    }, []),
  );
  // The other Talk screens see the call through this mirror (live.ts).
  useEffect(() => {
    publishTalk({
      sources: s.sources,
      active,
      live,
      status: stateText,
      phase,
      end: () => handlers.current.end(),
    });
  }, [s.sources, active, live, stateText, phase]);
  useEffect(() => resetTalk, []);
  // Android's Back is the sheet's Done: during a call it asks first.
  useFocusEffect(
    useCallback(() => {
      if (!android || !active) return;
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          handlers.current.close();
          return true;
        },
      );
      return () => subscription.remove();
    }, [active]),
  );
  // After a session expires the cached status still says signed in.
  const menuTitle = timeLeft(live, s.remaining, signedOut ? null : s.status);
  const reportable = canReport(s.transcript);
  const records = useMemo(() => reportChoices(s.sources), [s.sources]);
  const canCaption = active || s.transcript.length > 0;
  const screenOptions = useMemo(() => {
    const items = () => [
      talkMenu({
        title: menuTitle,
        active,
        captions,
        canCaption,
        report: reportable,
        records,
        consent: call.consent,
        onCaptions: setCaptions,
        onReport: (path) => afterMenu(() => void handlers.current.report(path)),
        onPrivacy: () =>
          afterMenu(
            () => void openOnWeb('/privacy', talkCopy.menu.voicePrivacy),
          ),
        onWithdraw: () => handlers.current.withdraw(),
      }),
      { ...closeSheetItem(), onPress: () => handlers.current.close() },
    ];
    return {
      title: active ? '' : talkCopy.title,
      headerTitleAlign: 'center' as const,
      gestureEnabled: !active,
      unstable_headerRightItems: items,
      // Android draws the same items in its own bar.
      ...(android ? { headerRight: () => androidHeaderBar(items()) } : {}),
    };
  }, [
    menuTitle,
    active,
    captions,
    canCaption,
    setCaptions,
    reportable,
    records,
    call.consent,
  ]);

  const onStage = (event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    setStage((prior) =>
      prior &&
      prior.x === x &&
      prior.y === y &&
      prior.width === width &&
      prior.height === height
        ? prior
        : { x, y, width, height },
    );
  };
  const cap = large ? ORB_AX : ORB_MAX;
  // Room for the status line under the stage orb when captions are hidden.
  const below = !compact && statusText ? STATUS_LINE : 0;
  const orbSize = stage
    ? Math.max(0, Math.min(stage.width, stage.height - below, cap))
    : 0;
  const bottom = Math.max(insets.bottom, rhythm.block);
  const dockPlacement =
    body && dock
      ? talkDockPlacement(body, dock, bottom, layout.screenMargin, regions)
      : { paddingBottom: bottom, translateX: 0 };
  const stageBounds =
    body && stage
      ? {
          x: body.x + stage.x,
          y: body.y + stage.y,
          width: stage.width,
          height: stage.height,
        }
      : null;
  const orbWanted = stageBounds
    ? {
        x: stageBounds.x + (stageBounds.width - orbSize) / 2,
        y: stageBounds.y + (stageBounds.height - orbSize - below) / 2,
        width: orbSize,
        height: orbSize + below,
      }
    : null;
  const orbClear =
    orbWanted && stageBounds
      ? placeClear(orbWanted, regions, stageBounds)
      : null;
  const statusProps = {
    ref: statusNode,
    accessible: true,
    accessibilityLanguage: 'en-AU',
    accessibilityLabel: stateText,
    accessibilityLiveRegion: 'polite' as const,
    accessibilityHint:
      screenReader && active
        ? talkCopy.headphones(android ? 'TalkBack' : 'VoiceOver')
        : undefined,
    testID: 'talk-status',
    onLayout: () => {
      if (!focusedEntry.current && screenReader) {
        focusedEntry.current = true;
        focusOn(statusNode.current);
      }
    },
  };
  const allowance =
    s.status?.signedIn && (startable || action === 'checking') ? (
      <Text
        wordSafe
        variant="footnote"
        tone="inkSoft"
        style={styles.centre}
        testID="talk-allowance"
        accessibilityLabel={voiceTimeSpoken(s.status)}
      >
        {voiceTime(s.status)}
      </Text>
    ) : null;

  return (
    <View
      style={styles.page}
      onMagicTap={() => {
        if (live) void call.mute();
      }}
    >
      {android ? (
        <AndroidCallGuard
          active={active}
          permittedRef={exitConfirmed}
          close={close}
        />
      ) : null}
      <RouteOptions options={screenOptions} />
      <View
        testID="talk-sheet"
        onLayout={({ nativeEvent: { layout: next } }) =>
          setBody((prior) =>
            prior &&
            prior.x === next.x &&
            prior.y === next.y &&
            prior.width === next.width &&
            prior.height === next.height
              ? prior
              : next,
          )
        }
        style={[
          styles.body,
          layoutRule.regular ? styles.pad : null,
          { paddingBottom: dockPlacement.paddingBottom },
        ]}
      >
        {compact ? (
          <View style={[styles.callRow, large ? styles.callRowStacked : null]}>
            <View {...statusProps} style={styles.callOrb}>
              <VoiceOrb
                phase={phase}
                levels={levels}
                size={ORB_CALL}
                reduceMotion={reduceMotion}
              />
            </View>
            {statusText ? (
              <Text
                wordSafe
                variant="secondary"
                testID="talk-state"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {statusText}
              </Text>
            ) : null}
          </View>
        ) : null}
        {showTranscript ? (
          <View style={styles.transcript}>
            <ScrollView
              ref={captionsList}
              testID="talk-captions-list"
              style={styles.transcript}
              contentContainerStyle={styles.transcriptContent}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => {
                // Pinned to the newest turn unless the reader scrolled up.
                if (pinned.current)
                  captionsList.current?.scrollToEnd({
                    animated: !reduceMotion,
                  });
              }}
              onScroll={(event) => {
                const { contentOffset, contentSize, layoutMeasurement } =
                  event.nativeEvent;
                pinned.current =
                  contentOffset.y + layoutMeasurement.height >=
                  contentSize.height - 24;
              }}
              scrollEventThrottle={32}
            >
              <MachinePill note={talkMachineNote} testID="talk-machine" />
              {s.transcript.map((turn) => (
                <AnswerCaption
                  key={`${turn.role}-${turn.id}`}
                  turn={turn}
                  sources={
                    turn.role === 'agent'
                      ? sources.filter(
                          (source) => s.sourceTurns?.[source.path] === turn.id,
                        )
                      : undefined
                  }
                  onOpenSource={openRecord}
                  onMoreSources={() => router.push(talkSourcesRoute)}
                />
              ))}
              {working ? (
                <Text
                  wordSafe
                  variant="body"
                  tone="inkSoft"
                  testID="talk-working"
                  accessibilityLabel={talkCopy.opaxSaid(working)}
                >
                  {working}
                </Text>
              ) : null}
            </ScrollView>
            <TranscriptEdge />
          </View>
        ) : (
          <View
            style={[styles.stage, adaptive ? { minHeight: 0 } : null]}
            onLayout={onStage}
          >
            {/* Absolute, so the orb never props the stage open. */}
            <View
              style={[
                styles.orbFrame,
                orbClear && orbWanted
                  ? {
                      transform: [
                        { translateX: orbClear.x - orbWanted.x },
                        { translateY: orbClear.y - orbWanted.y },
                      ],
                    }
                  : null,
              ]}
            >
              {compact ? null : (
                <View
                  {...statusProps}
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
              )}
              {!compact && statusText ? (
                // Captions hidden in a call: the status sits under the orb.
                <Text
                  wordSafe
                  variant="secondary"
                  style={styles.centre}
                  testID="talk-state"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  {statusText}
                </Text>
              ) : null}
            </View>
          </View>
        )}
        <ScrollView
          style={[
            styles.dockScroll,
            { transform: [{ translateX: dockPlacement.translateX }] },
          ]}
          onLayout={({ nativeEvent: { layout: next } }) =>
            setDock((prior) =>
              prior &&
              prior.width === next.width &&
              prior.height === next.height
                ? prior
                : { width: next.width, height: next.height },
            )
          }
          contentContainerStyle={styles.dock}
          keyboardShouldPersistTaps="handled"
          // Sized to its content; it scrolls only when AX text needs it.
          testID="talk-sheet-message"
        >
          {active ? (
            <>
              {typing && live ? (
                <TypedMessage send={call.send} busy={call.busy} />
              ) : null}
              {s.playback === 'truncated' && !captions ? (
                <View style={styles.inline} testID="talk-playback">
                  <Text variant="footnote" style={styles.centre}>
                    {talkCopy.playbackCut}
                  </Text>
                  <Button
                    label={talkCopy.menu.showCaptions}
                    variant="plain"
                    size="compact"
                    onPress={() => setCaptions(true)}
                  />
                </View>
              ) : null}
              <CallControls
                muted={s.mode === 'muted'}
                canMute={live && !call.busy}
                typing={typing && live}
                canType={live}
                sources={sources.length}
                ending={s.state === 'ending'}
                live={live}
                onMute={() => void call.mute()}
                onType={() => setTyping((open) => !open)}
                onSources={() => router.push(talkSourcesRoute)}
                onEnd={() => void call.end()}
              />
            </>
          ) : rationale ? (
            <MicrophoneRationale
              busy={call.busy}
              onContinue={() => void call.allowMicrophone()}
              onDecline={call.declineMicrophone}
            />
          ) : (
            <>
              {showIntro ? (
                <Text
                  wordSafe
                  variant="body"
                  style={styles.centre}
                  testID="talk-intro"
                >
                  {talkCopy.intro}
                </Text>
              ) : null}
              {showIntro &&
              example &&
              (action === 'start' || action === 'signIn') ? (
                <Text
                  wordSafe
                  variant="secondary"
                  style={styles.centre}
                  testID="talk-example"
                >
                  {talkCopy.example(example)}
                </Text>
              ) : null}
              {statusFailed ? (
                <InlineError
                  subject="voice"
                  message={offline ? talkCopy.offline : talkCopy.checkFailed}
                  testID="talk-message"
                />
              ) : message ? (
                <Text
                  wordSafe
                  variant="body"
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
                  label={talkCopy.open(queuedSource.title)}
                  variant="plain"
                  symbol="arrow.up.right.square"
                  testID="talk-queued-source"
                  onPress={() => {
                    setQueuedSource(null);
                    openOutside(queuedSource);
                  }}
                />
              ) : null}
              {sources.length && !active ? (
                <Button
                  label={talkCopy.controls.sources}
                  variant="plain"
                  symbol="doc.text.magnifyingglass"
                  accessibilityLabel={talkCopy.sourcesSpoken(sources.length)}
                  testID="talk-sources"
                  onPress={() => router.push(talkSourcesRoute)}
                />
              ) : null}
              <PrimaryAction
                action={action}
                busy={
                  action === 'checking' ||
                  call.busy ||
                  (startable && !call.consentLoaded)
                }
                onStart={start}
                onRetry={() => void call.refresh()}
                onAsk={askInstead}
              />
              {allowance}
              {action === 'signIn' ? (
                <Text
                  wordSafe
                  variant="footnote"
                  tone="inkSoft"
                  style={styles.centre}
                  testID="talk-free-minutes"
                >
                  {s.status?.totalSeconds
                    ? talkCopy.freeMinutes(
                        Math.floor(s.status.totalSeconds / 60),
                      )
                    : failureCopy.signedOut}
                </Text>
              ) : null}
              {startable || action === 'checking' ? <VoiceDisclosure /> : null}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function PrimaryAction({
  action,
  busy,
  onStart,
  onRetry,
  onAsk,
}: {
  action: Action;
  busy: boolean;
  onStart: () => void;
  onRetry: () => void;
  onAsk: () => void;
}) {
  switch (action) {
    case 'start':
    case 'startAgain':
    case 'checking':
      return (
        <Button
          label={action === 'startAgain' ? talkCopy.startAgain : talkCopy.start}
          icon="mic.fill"
          variant="primary"
          size="large"
          fullWidth
          testID="talk-start"
          loading={action === 'checking'}
          disabled={busy}
          onPress={onStart}
        />
      );
    case 'signIn':
      return (
        <Button
          label={talkCopy.signIn}
          variant="primary"
          size="large"
          fullWidth
          testID="talk-sign-in"
          onPress={() => router.push(talkSignInRoute)}
        />
      );
    case 'ask':
      return (
        <Button
          label={talkCopy.askInstead}
          variant="secondary"
          size="large"
          fullWidth
          testID="talk-ask"
          onPress={onAsk}
        />
      );
    case 'settings':
      return (
        <Button
          label={talkCopy.openSettings}
          variant="secondary"
          size="large"
          fullWidth
          testID="talk-settings"
          onPress={() => void Linking.openSettings()}
        />
      );
    case 'retry':
      return (
        <Button
          label={talkCopy.tryAgain}
          variant="secondary"
          size="large"
          fullWidth
          testID="talk-refresh"
          disabled={busy}
          onPress={onRetry}
        />
      );
  }
}

/** Type: the composer docked above the controls (7.4). */
function TypedMessage({
  send,
  busy,
}: {
  send: ReturnType<typeof useTalk>['send'];
  busy: boolean;
}) {
  const [text, setText] = useState('');
  const input = useRef<import('react-native').TextInput>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const submit = () =>
    void send(text).then((result) => {
      if (result?.ok) setText('');
    });
  return (
    <Composer
      inputRef={input}
      label={talkCopy.composer}
      placeholder={talkCopy.composer}
      submitLabel={talkCopy.send}
      value={text}
      onChangeText={setText}
      onSubmit={() => {
        if (text.trim() && !busy) submit();
      }}
      maxLength={2000}
      testID="talk-text"
      submitTestID="talk-send"
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  body: {
    flex: 1,
    paddingHorizontal: layout.screenMargin,
    gap: rhythm.group,
  },
  pad: { width: '100%', maxWidth: 700, alignSelf: 'center' },
  stage: {
    flex: 1,
    minHeight: ORB_AX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbFrame: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: rhythm.tight,
  },
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rhythm.block,
    paddingTop: rhythm.tight,
  },
  callRowStacked: { flexDirection: 'column', gap: rhythm.tight },
  callOrb: { width: ORB_CALL, height: ORB_CALL },
  transcript: { flex: 1 },
  transcriptContent: {
    gap: rhythm.block,
    paddingTop: TRANSCRIPT_EDGE_HEIGHT + rhythm.tight,
    paddingBottom: rhythm.tight,
  },
  dockScroll: { flexGrow: 0, flexShrink: 1 },
  dock: { gap: rhythm.tight, alignItems: 'stretch' },
  centre: { textAlign: 'center' },
  inline: { alignItems: 'center' },
});
