import { AndroidFocusBack } from '../../navigation/AndroidFocusBack';
import { RouteOptions } from '../../navigation/preview';
import {
  useRootBarOwnFade,
  useRootBarUnderBar,
  useTabRootRoute,
} from '../../navigation/useRootBarAppearance';
import { useAndroidRootScroll } from '../../navigation/useAndroidRootScroll';
import { useScreenReady } from '../../analytics/timing';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type TextInput,
} from 'react-native';
import { catalogs } from '../../api/runtime';
import { useOffline } from '../../api/useOffline';
import {
  useAccessibilitySize,
  useReduceMotion,
  useSolidBar,
} from '../../design/accessibility';
import {
  RegionProvider,
  SidebarSafe,
  splitAllowed,
  useAdaptiveDevice,
  useLayout,
  useMeasuredRegion,
} from '../../design/adaptive';
import { designFlags } from '../../design/flags';
import { useFocusRequest, useKeyCommand } from '../../design/keyboard';
import { useScreenColumn } from '../../design/layout';
import { SurfaceContext } from '../../design/row-padding';
import { colors, rhythm } from '../../design/tokens';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { useVerticalBarEdge } from '../../../modules/opax-root-bar';
import { scrollToTop } from '../../design/scroll-to-top';
import { askHeaderItems, clearBars, glassBar } from '../../navigation/chrome';
import { ClearBarFade, useBarFadeScroll } from '../../design/bar-fade';
import { talkSignInRoute } from '../../navigation/routes/account';
import { conversationsRoute } from '../../navigation/routes/ask';
import { voiceLinked } from '../../voice/linked';
import { accountCopy } from '../account/copy';
import { useAccount } from '../account/store';
import { AskRevealContext, announceAnswer } from './AnswerView';
import { AskDock } from './AskDock';
import { AskColumns } from './AskLayout';
import { ReservedRegionArea } from '../../design/fold-area';
import { AskEmptyState, AskIdle } from './AskIdle';
import { AskThread } from './AskThread';
import { streamStarted } from './AskProgress';
import { useStreamFollow } from './stream-follow';
import { useAskStageAnnouncer } from './AskStatus';
import { askGround } from './ground';
import type { Followup } from './model';
import { useReturnFromAsk } from './open';
import { openAskOptions, topics } from './Options';
import { loadAskProfiles, type AskPerson } from './people';
import {
  arriveInAsk,
  askQuestion,
  askSession,
  markArrival,
  scopeOptions,
  useAskScreenFocus,
  type AskScope,
} from './session';
import { useAskReturn } from './return';
import { AskPaneProvider, useAskSources } from './SourcesPane';
import { chatsSnapshot, loadChats, subscribeChats } from './store';
import { useConversationAnchor } from './scroll-anchor';
import { useKeyboardOverlap } from './keyboard';
import { stopCopy } from './turn-copy';

export { PhoneDock } from './AskLayout';

const topicNames = Object.values(topics);
// Remember blank arrivals across remounts; real drafts use the session guard.
const handledBlankEntries = new Set<string>();
const announce = (text: string) =>
  AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });

/**
 * The Ask tab (journeys/ask.md 4): idle (Try asking, Conversations) or the
 * open conversation, with one composer docked above the tab bar (on iPad,
 * under the conversation, beside its sources). After a cold launch Ask opens
 * idle; within a session it keeps what was on screen.
 */
/** The bar's glass buttons end about this far below its reported foot. */
const OWN_FADE_COVER = 16;

export default function AskScreen() {
  const offline = useOffline();
  const atTop = useRef(true);
  const ground = askGround();
  const groundStyle = { backgroundColor: colors[ground] };
  const s = useSyncExternalStore(
    askSession.subscribe,
    askSession.snapshot,
    askSession.snapshot,
  );
  const idle = !s.thread.length && !s.busy && !s.error && !s.clarify;
  const saved = useSyncExternalStore(
    subscribeChats,
    chatsSnapshot,
    chatsSnapshot,
  );
  const account = useAccount();
  const signedIn = !!account.status?.signedIn;
  // An arrival from another tab's page leaves a way back to it (4.2).
  const askReturn = useAskReturn();
  const returnFromAsk = useReturnFromAsk();
  const goBack = useCallback(() => void returnFromAsk(), [returnFromAsk]);
  const params =
    useLocalSearchParams<Partial<Record<keyof AskScope | 'entry', string>>>();
  const reduceMotion = useReduceMotion();
  const { height: windowHeight } = useWindowDimensions();
  const [readFailed, setReadFailed] = useState(false);
  const [inputError, setInputError] = useState('');
  const [profiles, setProfiles] = useState<Map<string, AskPerson>>(new Map());
  const [names, setNames] = useState<string[]>([]);
  const [dockHeight, setDockHeight] = useState(0);
  const [composerClearance, setComposerClearance] = useState(0);
  const accessibilitySize = useAccessibilitySize();
  const [contentReady, setContentReady] = useState(false);
  useScreenReady('/ask', dockHeight > 0 && contentReady);
  const onContentSizeChange = useCallback((width: number, height: number) => {
    if (width > 0 && height > 0) setContentReady(true);
  }, []);
  // Bar items are built during render, so New question touches no refs:
  // it asks for the top, and an effect scrolls there.
  const [topRequest, setTopRequest] = useState(0);
  const input = useRef<TextInput>(null);
  const scroll = useRef<ScrollView>(null);
  const androidRoot = useAndroidRootScroll(scroll, colors[ground]);
  const root = useRef<View>(null);
  const turnY = useRef(0);
  const pin = useRef(false);
  const lastAnswer = useRef<object | null>(null);
  const loadingNames = useRef(false);
  useFocusRequest('ask', input);
  useAskScreenFocus();
  // The conversation and composer keep their positions on both displays.
  const [onRoom, room] = useMeasuredRegion();
  const outer = useLayout();
  const adaptive = useAdaptiveDevice();
  // The sources pane joins at the split breakpoint, as every split does.
  const docked =
    adaptive && splitAllowed(room?.width ?? outer.width, outer.rule);
  const measuredBottom = useHeaderBottom(!idle && !docked);
  // With Reduce Transparency or Increase Contrast on, a root's bar without
  // a large title is opaque (`scrollBar`), and the stack lays the page out
  // below it: the scroll view starts at the bar's bottom edge, not under
  // the bar. Offsets that allowed for the bar then put content short by its
  // height. An opened thread's inset took the "hidden band" off a page
  // with no band, so the question's top was cut by the bar (iOS 27.0), and
  // a new question was pinned a bar's height down the page (26.3). There
  // the bar takes no room in the scroll view: 0, not its height.
  const tabRoot = useTabRootRoute();
  const solidBar = useSolidBar();
  const onRail = useVerticalBarEdge() !== 'unspecified';
  const largeTitle = idle && (!docked || outer.rule !== 'pad');
  const belowBar =
    Platform.OS === 'ios' &&
    glassBar() &&
    tabRoot &&
    solidBar &&
    (onRail || !largeTitle);
  const headerBottom = belowBar ? 0 : measuredBottom;
  // iPhone, once a thread is open: the bar shows its inline title, but UIKit
  // keeps the bar's large-title frame, so the automatic top inset kept the
  // hidden large-title band and the question sat about 70 pt under the bar
  // at rest (sweep 1, 7.1; scroll indicator from 172 pt under a 106 pt bar).
  // The reported header still includes that band; take it off the inset.
  // Idle, docked, iPad and Android: no band, no change.
  const fullHeader = useHeaderBottom();
  const hiddenBand =
    Platform.OS === 'ios' && !belowBar
      ? Math.max(0, fullHeader - headerBottom)
      : 0;
  // Match Screen's first-point-of-scroll report, including the expanded
  // title while UIKit debounces its height. The thread's inset has already
  // removed the hidden large-title band, so use its compact header there.
  const scrollY = useRef<number | null>(null);
  const [underBar, setUnderBar] = useState(false);
  const checkUnderBar = useCallback(() => {
    if (Platform.OS !== 'ios' || scrollY.current === null) return;
    setUnderBar(scrollY.current + headerBottom > 1);
  }, [headerBottom]);
  useLayoutEffect(checkUnderBar, [checkUnderBar]);
  // The hidden band is only there while UIKit keeps the large-title frame.
  // When the tab is left and shown again UIKit reports the bar it draws (116
  // pt for 168 on iOS 27.2), the band shrinks, and so does the inset above.
  // UIKit carries a thread at rest up by the difference and leaves it there,
  // its question behind the bar's title and buttons (build 88). Such a
  // thread is put back at rest. Only for a band that shrinks: a band that
  // appears is the thread opening, which `reveal` places with its own
  // animation. And only a thread found at rest or carried exactly that far:
  // one the reader has scrolled is left where it is.
  const band = useRef(hiddenBand);
  useLayoutEffect(() => {
    const before = band.current;
    band.current = hiddenBand;
    if (hiddenBand >= before || idle || scrollY.current === null) return;
    const above = scrollY.current + headerBottom;
    const carried = before - hiddenBand;
    if (above > 1 && Math.abs(above - carried) > 1) return;
    const rest = { y: -headerBottom, animated: false };
    scroll.current?.scrollTo(rest);
    // Once more when the native inset has landed: it can follow this commit.
    const frame = requestAnimationFrame(() => scroll.current?.scrollTo(rest));
    return () => cancelAnimationFrame(frame);
  }, [hiddenBand, headerBottom, idle]);
  useRootBarUnderBar(underBar);
  // Under the clear bar the page fades into its ground behind the title and
  // the bar buttons, from the first point of scroll (at accessibility sizes
  // the starters showed through, blurred). A solid bar covers its own.
  // Only the Ask tab's root: pushed elsewhere (a link, a keyboard shortcut)
  // Ask sits below an opaque bar with its content at 0, and the fade would
  // cover the top of the page.
  const barFade = clearBars && tabRoot && Platform.OS === 'ios' && glassBar();
  const fadeScroll = useBarFadeScroll(barFade);
  // An open thread rests its question just under the compact bar, inside
  // the band UIKit's soft edge blurs (deeper on iOS 27.2). The thread's own
  // fade is clear at rest, so it is the only one there.
  const ownFade = barFade && !idle && !solidBar;
  useRootBarOwnFade(ownFade);
  const column = useScreenColumn('readable');
  const { overlap: keyboard, visible: keyboardVisible } =
    useKeyboardOverlap(root);
  const anchor = useConversationAnchor(
    scroll,
    `${outer.rule}:${outer.width}:${outer.height}:${room?.width}:${docked}`,
    s.id,
  );

  useEffect(() => {
    void loadChats().catch(() => setReadFailed(true));
  }, []);
  // A deep link's draft (useOpenAsk handles taps inside the app itself).
  useEffect(() => {
    if (!params.entry) return;
    const scope: AskScope = { question: params.question ?? '' };
    for (const k of [
      'speaker',
      'party',
      'state',
      'topic',
      'from',
      'to',
      'kind',
    ] as const)
      if (params[k]) scope[k] = params[k];
    if (scope.question.trim()) arriveInAsk(scope, params.entry);
    else if (!handledBlankEntries.has(params.entry)) {
      handledBlankEntries.add(params.entry);
      if (handledBlankEntries.size > 32)
        handledBlankEntries.delete(handledBlankEntries.values().next().value!);
      markArrival(params.entry);
      askSession.arrive('', scopeOptions(scope));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.entry]);
  const { announcement: statusAnnouncement, drop: dropStageAnnouncement } =
    useAskStageAnnouncer(
      s.stage,
      s.stage !== null && !streamStarted(s.streaming),
    );
  async function loadNames() {
    if (loadingNames.current || names.length) return;
    loadingNames.current = true;
    try {
      // The rows at once from the roster, then their place lines sharpened
      // in place when the people catalogue answers (loadAskProfiles).
      await loadAskProfiles(catalogs, (next, people) => {
        setProfiles(next);
        setNames(people);
      });
    } catch {
      /* People rows wait for the roster; the answer reads without them. */
    } finally {
      loadingNames.current = false;
    }
  }

  const latest = s.thread.at(-1);
  const wasBusy = useRef(false);
  useEffect(() => {
    if (latest?.role !== 'answer' || latest === lastAnswer.current) return;
    lastAnswer.current = latest;
    // Announced when written, not when a saved conversation is opened.
    if (wasBusy.current) announceAnswer(latest);
    void loadNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest]);
  // After the effect above, so it still sees the answer's run as busy.
  useEffect(() => {
    wasBusy.current = s.busy;
  }, [s.busy]);
  const pinClear = ownFade ? OWN_FADE_COVER : 0;
  // The new question goes just under the bar once its turn is laid out.
  const reveal = useCallback(
    (laidOut = true) => {
      if (!pin.current) return;
      if (laidOut) pin.current = false;
      scroll.current?.scrollTo({
        y: Math.max(
          // Under the thread's own fade the ground is whole to the foot
          // of the bar's buttons: the new question rests below that.
          turnY.current - headerBottom - rhythm.heading - pinClear,
          -headerBottom,
        ),
        animated: !reduceMotion,
      });
    },
    [headerBottom, reduceMotion, pinClear],
  );
  const latestReveal = useRef(reveal);
  useLayoutEffect(() => {
    latestReveal.current = reveal;
  }, [reveal]);
  useEffect(() => {
    if (!topRequest) return;
    pin.current = false;
    scrollToTop(scroll.current, headerBottom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topRequest]);
  const pinTurn = () => {
    pin.current = true;
    // These frames may beat layout and still have the previous turn's y.
    // Keep the measured reveal pending so it wins in either order.
    // Send starts in the idle render. Read the committed conversation's
    // geometry here rather than capturing that render's expanded header.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => latestReveal.current(false)),
    );
  };
  // A claim moves just above the half-height citation sheet's top edge.
  const revealClaim = useCallback(
    (target: View) => {
      const inner = scroll.current?.getInnerViewNode();
      if (!inner) return;
      target.measureLayout(inner, (_x, y, _w, h) => {
        // In the scroll view's own points: below an opaque bar it starts
        // at the bar's bottom edge.
        const sheetTop = windowHeight / 2 - (belowBar ? fullHeader : 0);
        const room = sheetTop - headerBottom - rhythm.block;
        const offset =
          h > room
            ? y - headerBottom - rhythm.tight
            : y + h - sheetTop + rhythm.block;
        scroll.current?.scrollTo({
          y: Math.max(offset, -headerBottom),
          animated: !reduceMotion,
        });
      });
    },
    [windowHeight, headerBottom, belowBar, fullHeader, reduceMotion],
  );

  async function ask(question: string, carry?: Followup) {
    if (offline) return;
    Keyboard.dismiss();
    pinTurn();
    setInputError((await askQuestion(question, { carry })) ?? '');
  }
  async function send() {
    if (offline || !s.draft.trim()) return;
    Keyboard.dismiss();
    pinTurn();
    setInputError((await askQuestion(s.draft, { fromDraft: true })) ?? '');
  }
  function stop() {
    const result = askSession.stop();
    if (result) announce(stopCopy[result]);
  }
  function retry() {
    pinTurn();
    void askSession.retry();
  }
  function newConversation() {
    if (askSession.newConversation()) {
      scrollY.current = null;
      setUnderBar(false);
      setInputError('');
      setTopRequest((n) => n + 1);
    }
  }
  useKeyCommand(
    'ask-reselect',
    () => {
      if (atTop.current) input.current?.focus();
    },
    idle,
  );
  const talkSignedOut = !account.checking && account.status?.signedIn === false;
  const talk =
    designFlags.talkInAsk && voiceLinked
      ? () => router.push(talkSignedOut ? talkSignInRoute : '/talk')
      : undefined;
  const chat = saved.chats.find((c) => c.id === s.id);
  const sources = useAskSources(s.thread, {
    chat: s.id,
    profiles,
    onAsk: (q) => void ask(q),
    readFailed,
    offline,
  });
  const dock = (
    <AskDock
      inputRef={input}
      onSend={() => void send()}
      onStop={stop}
      onOptions={() => {
        input.current?.blur();
        Keyboard.dismiss();
        void openAskOptions();
      }}
      onTalk={talk}
      talkLabel={talkSignedOut ? accountCopy.signUpToTalk : undefined}
      offline={offline}
      inputError={inputError}
      onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}
      keyboard={keyboard}
    />
  );
  // An undocked iOS thread, including iPad in a narrow window, ends above
  // the floating composer: its answer stamp must never
  // peek through the gap below it when the tab bar minimises. At
  // accessibility sizes the resting composer and the tab bar take about a
  // third of a short display (the folded Duo's 678 pt at AX5), and covered
  // Try asking: a starter seen through the band's clear edge focused the
  // composer instead. There the idle page ends at the composer's resting top,
  // so nothing sits under it. Typing, the band turns opaque and the page runs
  // under it again, with room for the composer and keyboard as before.
  const restInset =
    !docked &&
    !keyboardVisible &&
    (idle ? accessibilitySize : Platform.OS === 'ios')
      ? composerClearance
      : 0;
  // While an answer streams the thread follows its growing end, kept clear
  // of whatever covers the scroll view's bottom, until the reader drags.
  const follow = useStreamFollow(scroll, {
    streaming: s.busy,
    started: streamStarted(s.streaming),
    obscured: restInset ? 0 : dockHeight + (docked ? 0 : keyboard),
    gap: rhythm.block,
    near: rhythm.group,
    animated: !reduceMotion,
    rest: -headerBottom,
  });
  const content = (
    <ScrollView
      ref={scroll}
      testID="ask-screen"
      style={[
        styles.fill,
        groundStyle,
        restInset ? { marginBottom: restInset } : null,
      ]}
      contentInsetAdjustmentBehavior="automatic"
      contentInset={hiddenBand ? { top: -hiddenBand } : undefined}
      scrollIndicatorInsets={hiddenBand ? { top: -hiddenBand } : undefined}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={false}
      keyboardDismissMode={
        Platform.OS === 'android' ? 'on-drag' : 'interactive'
      }
      scrollToOverflowEnabled
      maintainVisibleContentPosition={
        adaptive ? { minIndexForVisible: 0 } : undefined
      }
      onLayout={(event) => {
        column.onLayout(event);
        follow.onViewport(event.nativeEvent.layout.height);
      }}
      onContentSizeChange={onContentSizeChange}
      onScrollBeginDrag={follow.onDrag}
      onScrollEndDrag={(event) =>
        follow.onDragEnd(event.nativeEvent.velocity?.y ?? 0)
      }
      onMomentumScrollBegin={follow.onMomentumBegin}
      onMomentumScrollEnd={follow.onMomentumEnd}
      onScroll={(event) => {
        fadeScroll.onScroll(event);
        atTop.current = event.nativeEvent.contentOffset.y <= 4;
        scrollY.current = event.nativeEvent.contentOffset.y;
        follow.onScroll(event.nativeEvent.contentOffset.y);
        checkUnderBar();
        if (Platform.OS === 'android') androidRoot.onScroll(event);
        if (adaptive) anchor.onScroll(event.nativeEvent.contentOffset.y);
        if (docked) sources.onScroll();
      }}
      scrollEventThrottle={16}
      contentContainerStyle={[
        styles.content,
        // An open thread's question starts 8 pt under the bar at rest.
        Platform.OS === 'ios' && !idle ? styles.threadContent : null,
        column.content,
        // Room for the docked composer (and the keyboard under it).
        {
          paddingBottom: restInset
            ? rhythm.section
            : dockHeight + rhythm.section + (docked ? 0 : keyboard),
        },
      ]}
    >
      {androidRoot.title}
      <RegionProvider value={column.inner}>
        {idle ? (
          // Docked, the list is split across the panes (specs/ask.md 2.8):
          // the conversations here, the day's starters in the pane, so
          // neither pane repeats the other.
          <AskIdle
            onAsk={(q) => void ask(q)}
            offline={offline}
            readFailed={readFailed}
            showStarters={!docked}
            conversationCount={docked ? 8 : 3}
          />
        ) : (
          <AskThread
            s={s}
            statusAnnouncement={statusAnnouncement}
            onTailFocus={dropStageAnnouncement}
            chat={chat}
            profiles={profiles}
            names={names}
            topics={topicNames}
            paneShowsSources={docked}
            onAsk={(q, carry) => void ask(q, carry)}
            onRetry={retry}
            onAnchorLayout={adaptive ? anchor.onRowLayout : undefined}
            onProgressBottom={follow.onProgress}
            onThreadLayout={follow.onThread}
            onTurnLayout={(y) => {
              turnY.current = y;
              follow.onTurn(y);
              if (adaptive) anchor.onLatestLayout(y);
              reveal();
            }}
            minHeight={Math.max(
              0,
              windowHeight -
                (belowBar ? fullHeader : headerBottom) -
                dockHeight -
                rhythm.section * 2,
            )}
          />
        )}
      </RegionProvider>
    </ScrollView>
  );
  return (
    <SurfaceContext.Provider value={ground}>
      <View ref={root} style={[styles.fill, groundStyle]} collapsable={false}>
        <RouteOptions
          options={{
            ...askHeaderItems({
              canStartNew: !s.busy && !idle,
              historyEnabled: saved.chats.length > 0,
              signedIn,
              onNew: newConversation,
              onHistory: () => router.push(conversationsRoute),
              back: askReturn
                ? { name: askReturn.name, onPress: goBack }
                : null,
            }),
            // Only the idle list keeps a large title. On iPad two panes stay
            // inline, as Bills' split does; a regular iPhone (Duo) keeps the
            // large title beside its panes, as Bills and Today do there.
            ...(Platform.OS === 'ios'
              ? {
                  headerLargeTitleEnabled: largeTitle,
                }
              : null),
          }}
        />
        {/* Android: system Back on Ask goes back to that page as well. */}
        {Platform.OS === 'android' && askReturn ? (
          <AndroidFocusBack active onBack={goBack} />
        ) : null}
        <AskRevealContext.Provider value={revealClaim}>
          <SidebarSafe style={[styles.fill, groundStyle]}>
            {/* Keep the first-child chain intact for UIKit's large-title tracking.
                Fabric otherwise hoists the scroll beside an empty background view. */}
            <View
              collapsable={false}
              style={[styles.fill, groundStyle]}
              onLayout={onRoom}
            >
              <RegionProvider value={room}>
                <ReservedRegionArea style={styles.fill}>
                  <AskPaneProvider value={docked ? sources.context : null}>
                    <AskColumns
                      docked={docked}
                      content={content}
                      dock={dock}
                      sources={docked ? sources.pane : null}
                      empty={<AskEmptyState readFailed={readFailed} />}
                      keyboard={keyboard}
                      keyboardVisible={keyboardVisible}
                      ground={ground}
                      onComposerClearance={setComposerClearance}
                    />
                  </AskPaneProvider>
                </ReservedRegionArea>
              </RegionProvider>
            </View>
            {/* After the scroll's chain, so UIKit still finds it first. */}
            {barFade ? (
              <ClearBarFade
                // Its own layer for a thread, not the idle page's reused: the
                // natively driven values of a reused one stayed as the idle
                // page left them, and the ground covered the question.
                key={idle ? 'idle' : 'thread'}
                y={fadeScroll.y}
                bottom={headerBottom}
                hidden={hiddenBand}
                cover={ownFade ? OWN_FADE_COVER : 0}
                // No tail below that: a follow-up is pinned just under the
                // bar, and must sit whole below the fade too.
                tail={ownFade ? 0 : undefined}
                ground={ground}
              />
            ) : null}
          </SidebarSafe>
        </AskRevealContext.Provider>
      </View>
    </SurfaceContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingTop: rhythm.block, gap: rhythm.section },
  threadContent: { paddingTop: rhythm.heading },
});
