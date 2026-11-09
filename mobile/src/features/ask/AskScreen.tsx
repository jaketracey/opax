import { RouteOptions } from '../../navigation/preview';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  LayoutAnimation,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type KeyboardEvent,
  type TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { catalogs } from '../../api/runtime';
import { useOffline } from '../../api/useOffline';
import { useReduceMotion } from '../../design/accessibility';
import {
  RegionProvider,
  SidebarSafe,
  columns,
  isPad,
  sizeClassFor,
  useLayout,
  useMeasuredRegion,
} from '../../design/adaptive';
import { designFlags } from '../../design/flags';
import { useFocusRequest, useKeyCommand } from '../../design/keyboard';
import { useScreenColumn } from '../../design/layout';
import { SurfaceContext } from '../../design/row-padding';
import {
  colors,
  hairline,
  layout,
  rhythm,
  type Role,
} from '../../design/tokens';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { askHeaderItems } from '../../navigation/chrome';
import { conversationsRoute } from '../../navigation/routes/ask';
import { voiceLinked } from '../../voice/linked';
import { useAccount } from '../account/store';
import { AskRevealContext, announceAnswer } from './AnswerView';
import { AskDock } from './AskDock';
import { AskIdle } from './AskIdle';
import { AskThread } from './AskThread';
import { askGround } from './ground';
import type { Followup } from './model';
import { openAskOptions, topics } from './Options';
import { rosterProfiles, type AskPerson } from './people';
import {
  arriveInAsk,
  askQuestion,
  askSession,
  markArrival,
  scopeOptions,
  type AskScope,
} from './session';
import { AskPaneProvider, useAskSources } from './SourcesPane';
import { chatsSnapshot, loadChats, subscribeChats } from './store';
import { stopCopy } from './turn-copy';

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
  const saved = useSyncExternalStore(
    subscribeChats,
    chatsSnapshot,
    chatsSnapshot,
  );
  const account = useAccount();
  const signedIn = !!account.status?.signedIn;
  const params =
    useLocalSearchParams<Partial<Record<keyof AskScope | 'entry', string>>>();
  const headerBottom = useHeaderBottom();
  const reduceMotion = useReduceMotion();
  const { height: windowHeight } = useWindowDimensions();
  const [readFailed, setReadFailed] = useState(false);
  const [inputError, setInputError] = useState('');
  const [profiles, setProfiles] = useState<Map<string, AskPerson>>(new Map());
  const [names, setNames] = useState<string[]>([]);
  const [dockHeight, setDockHeight] = useState(0);
  // Bar items are built during render, so New question touches no refs:
  // it asks for the top, and an effect scrolls there.
  const [topRequest, setTopRequest] = useState(0);
  const input = useRef<TextInput>(null);
  const scroll = useRef<ScrollView>(null);
  const root = useRef<View>(null);
  const turnY = useRef(0);
  const pin = useRef(false);
  const lastStage = useRef<string | null>(null);
  const lastAnswer = useRef<object | null>(null);
  const loadingNames = useRef(false);
  useFocusRequest('ask', input);
  // iPad: two columns when the room inside the sidebar's inset is regular.
  const [onRoom, room] = useMeasuredRegion();
  const outer = useLayout();
  const docked =
    isPad && sizeClassFor(room?.width ?? outer.width) === 'regular';
  const column = useScreenColumn('readable');
  const keyboard = useKeyboardOverlap(root);

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
  // Each stage is announced once, politely; the line is not a live region.
  useEffect(() => {
    if (s.stage && s.stage !== lastStage.current) announce(s.stage);
    lastStage.current = s.stage;
  }, [s.stage]);
  async function loadNames() {
    if (loadingNames.current || names.length) return;
    loadingNames.current = true;
    try {
      const [roster, slugs] = await Promise.all([
        catalogs.roster(),
        catalogs.slugs(),
      ]);
      setProfiles(rosterProfiles(roster.data, slugs.data));
      setNames(roster.data.people.map((p) => p.name));
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
  const scrollToTop = () =>
    scroll.current?.scrollTo({ y: -headerBottom, animated: false });
  // The new question goes just under the bar once its turn is laid out.
  const reveal = () => {
    if (!pin.current) return;
    pin.current = false;
    scroll.current?.scrollTo({
      y: Math.max(turnY.current - headerBottom - rhythm.heading, -headerBottom),
      animated: !reduceMotion,
    });
  };
  useEffect(() => {
    if (topRequest) scrollToTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topRequest]);
  const pinTurn = () => {
    pin.current = true;
    requestAnimationFrame(() => requestAnimationFrame(reveal));
  };
  // A claim moves just above the half-height citation sheet's top edge.
  const revealClaim = useCallback(
    (target: View) => {
      const inner = scroll.current?.getInnerViewNode();
      if (!inner) return;
      target.measureLayout(inner, (_x, y, _w, h) => {
        const sheetTop = windowHeight / 2;
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
    [windowHeight, headerBottom, reduceMotion],
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
      setInputError('');
      setTopRequest((n) => n + 1);
    }
  }
  const idle = !s.thread.length && !s.busy && !s.error && !s.clarify;
  useKeyCommand(
    'ask-reselect',
    () => {
      if (atTop.current) input.current?.focus();
    },
    idle,
  );
  const talk =
    designFlags.talkInAsk && voiceLinked && signedIn
      ? () => router.push('/talk')
      : undefined;
  const chat = saved.chats.find((c) => c.id === s.id);
  const sources = useAskSources(s.thread, {
    chat: s.id,
    profiles,
    onAsk: (q) => void ask(q),
    readFailed,
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
      offline={offline}
      inputError={inputError}
      onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}
      keyboard={keyboard}
    />
  );
  const content = (
    <ScrollView
      ref={scroll}
      testID="ask-screen"
      style={[styles.fill, groundStyle]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={false}
      keyboardDismissMode="interactive"
      scrollToOverflowEnabled
      onLayout={column.onLayout}
      onScroll={(event) => {
        atTop.current = event.nativeEvent.contentOffset.y <= 4;
        if (docked) sources.onScroll();
      }}
      scrollEventThrottle={16}
      contentContainerStyle={[
        styles.content,
        column.content,
        // Room for the docked composer (and the keyboard under it).
        {
          paddingBottom: dockHeight + rhythm.section + (docked ? 0 : keyboard),
        },
      ]}
    >
      <RegionProvider value={column.inner}>
        {idle ? (
          <AskIdle
            onAsk={(q) => void ask(q)}
            offline={offline}
            readFailed={readFailed}
            starterCount={docked ? 3 : 4}
          />
        ) : (
          <AskThread
            s={s}
            chat={chat}
            profiles={profiles}
            names={names}
            topics={topicNames}
            paneShowsSources={docked}
            onAsk={(q, carry) => void ask(q, carry)}
            onRetry={retry}
            onTurnLayout={(y) => {
              turnY.current = y;
              reveal();
            }}
            minHeight={Math.max(
              0,
              windowHeight - headerBottom - dockHeight - rhythm.section * 2,
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
            }),
            // Two panes: an inline title (a large title over two scroll views
            // collapses with whichever scrolls first).
            ...(isPad ? { headerLargeTitleEnabled: !docked } : null),
          }}
        />
        <AskRevealContext.Provider value={revealClaim}>
          {isPad ? (
            <SidebarSafe style={[styles.fill, groundStyle]}>
              <View
                style={[styles.fill, groundStyle, docked ? styles.split : null]}
                onLayout={onRoom}
              >
                <RegionProvider value={room}>
                  {docked ? (
                    <>
                      <PadColumn dock={dock}>
                        <AskPaneProvider value={sources.context}>
                          {content}
                        </AskPaneProvider>
                      </PadColumn>
                      {sources.pane}
                    </>
                  ) : (
                    <>
                      {content}
                      <PhoneDock keyboard={keyboard} ground={ground}>
                        {dock}
                      </PhoneDock>
                    </>
                  )}
                </RegionProvider>
              </View>
            </SidebarSafe>
          ) : (
            <>
              {content}
              <PhoneDock keyboard={keyboard} ground={ground}>
                {dock}
              </PhoneDock>
            </>
          )}
        </AskRevealContext.Provider>
      </View>
    </SurfaceContext.Provider>
  );
}

/**
 * iPhone (and compact iPad): the composer floats over the content on the
 * tab bar's top edge. A native safe-area view reads the bar's inset as the
 * bar minimises and expands (journeys/ask.md 4.4a); with the keyboard up the
 * composer sits on the keyboard instead, on a band of the page's ground:
 * the glass composer would otherwise show the starters scrolling through
 * it, over its placeholder (w4-ask-01-idle). The content ends at the band's
 * top edge; its bottom padding lets every line scroll clear of it.
 */
export function PhoneDock({
  keyboard,
  ground,
  children,
}: {
  keyboard: number;
  ground: Role;
  children: ReactNode;
}) {
  return (
    <SafeAreaView
      edges={keyboard ? [] : ['bottom']}
      mode="padding"
      pointerEvents="box-none"
      style={[
        styles.phoneDock,
        keyboard
          ? {
              paddingBottom: keyboard,
              paddingTop: rhythm.tight,
              backgroundColor: colors[ground],
            }
          : null,
      ]}
      testID="ask-phone-dock"
    >
      <View style={styles.phoneDockInner}>{children}</View>
    </SafeAreaView>
  );
}
/** iPad regular: the composer docked under the conversation column. */
function PadColumn({
  dock,
  children,
}: {
  dock: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<View>(null);
  const lift = useKeyboardOverlap(ref);
  const ground = { backgroundColor: colors[askGround()] };
  return (
    <View ref={ref} style={[styles.fill, ground, { paddingBottom: lift }]}>
      {children}
      <View style={[styles.padDock, ground]}>
        <View
          style={[
            styles.padDockColumn,
            { maxWidth: columns.readable - layout.screenMargin * 2 },
          ]}
        >
          {dock}
        </View>
      </View>
    </View>
  );
}
/** How far the software keyboard overlaps the bottom of `ref`, animated with it. */
function useKeyboardOverlap(ref: RefObject<View | null>) {
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    const animate = (event: KeyboardEvent) => {
      if (event.duration)
        LayoutAnimation.configureNext({
          duration: event.duration,
          update: { type: LayoutAnimation.Types.keyboard },
        });
    };
    const change = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      const top = event.endCoordinates.screenY;
      ref.current?.measureInWindow((_x, y, _w, height) => {
        animate(event);
        setOverlap(Math.max(0, Math.round(y + height - top)));
      });
    });
    const hide = Keyboard.addListener('keyboardWillHide', (event) => {
      animate(event);
      setOverlap(0);
    });
    return () => {
      change.remove();
      hide.remove();
    };
  }, [ref]);
  return overlap;
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingTop: rhythm.block, gap: rhythm.section },
  split: { flexDirection: 'row' },
  phoneDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  phoneDockInner: {
    paddingHorizontal: layout.screenMargin,
    paddingBottom: rhythm.tight,
  },
  padDock: {
    borderTopWidth: hairline,
    borderTopColor: colors.dividerDefault,
    paddingHorizontal: layout.screenMargin,
    paddingTop: rhythm.tight,
    paddingBottom: rhythm.heading,
  },
  padDockColumn: { width: '100%', alignSelf: 'center' },
});
