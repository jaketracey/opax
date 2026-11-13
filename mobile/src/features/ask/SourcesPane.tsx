import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
// From adaptive, not primitives: screen tests mock primitives' components.
import type { SourcePlacement } from '../../analytics/events';
import { LayoutRegion } from '../../design/adaptive';
import { IconButton } from '../../design/controls';
import { InsetGroup } from '../../design/layout';
import { useListKeys } from '../../design/list-keys';
import { SurfaceContext } from '../../design/row-padding';
import { PaneBar, PaneHost, type SplitPane } from '../../design/split';
import { Text } from '../../design/text';
import { colors, hairline, rhythm } from '../../design/tokens';
import { entryForWebPath, entryLabel, type RecordEntry } from '../split/entry';
import { RecordDetail, RecordShare } from '../split/RecordDetail';
import { answerBlocks } from './answer-markdown';
import { trackSourceOpen } from '../../navigation/external';
import { openAnswerLink } from './AnswerBody';
import { AskIdle } from './AskIdle';
import { CitedRecordRow, sourcePath } from './AskRows';
import {
  citationSelection,
  firstClaim,
  selectCitation,
} from './citation-state';
import { CitationContent, citationCopy } from './CitationContent';
import { askGround } from './ground';
import { turnKey, type Turn } from './model';
import type { AskPerson } from './people';
import { citedSources, sourceTitle } from './source-present';

/**
 * Ask with two panes (journeys/ask.md 4.12, the split breakpoint): the
 * conversation in the main column and, on the right, a pane that is never
 * empty. Idle, it shows Try asking; the column beside it has the
 * Conversations, so neither repeats the other. After an answer it opens on
 * citation 1 in the `/citation` anatomy; a mark tapped in the column selects
 * its source here and highlights its sentence there; Previous and Next move
 * between sources; Open record opens in the pane with Back to "Sources".
 * The column's Records cited list is hidden.
 */
export interface AskPane {
  /**
   * Opens a record in the pane, or as on the phone when the pane cannot draw
   * it. A `placement` marks a source opened from the answer, for analytics.
   */
  open: (href: string, title: string, placement?: SourcePlacement) => void;
  /** Citation `n` of the answer at thread index `turn` was tapped. */
  cite: (turn: number, n: number) => void;
  /** An answer's view, so scrolling keeps the pane on the answer in view. */
  register: (turn: number, ref: RefObject<View | null>) => () => void;
}
const AskPaneContext = createContext<AskPane | null>(null);
/** The sources pane beside this answer, or null (iPhone, compact width). */
export function useAskPane() {
  return useContext(AskPaneContext);
}
export const AskPaneProvider = AskPaneContext.Provider;

/** The pane's state and the conversation's side of it. */
export function useAskSources(
  thread: readonly Turn[],
  {
    chat,
    profiles,
    onAsk,
    readFailed = false,
    offline = false,
  }: {
    chat?: string | null;
    profiles?: Map<string, AskPerson>;
    onAsk?: (question: string) => void;
    readFailed?: boolean;
    offline?: boolean;
  } = {},
) {
  const latest = thread.map((turn) => turn.role).lastIndexOf('answer');
  const [active, setActive] = useState<number | null>(null);
  const [mark, setMark] = useState<{ turn: number; n: number } | null>(null);
  const [stack, setStack] = useState<RecordEntry[]>([]);
  const shown =
    active !== null && thread[active]?.role === 'answer' ? active : latest;
  // A new answer brings the pane to it, on citation 1.
  const [seen, setSeen] = useState({ chat, latest });
  if (seen.chat !== chat || seen.latest !== latest) {
    setSeen({ chat, latest });
    setActive(null);
    setMark(null);
    setStack([]);
  }
  useEffect(() => {
    const selection = citationSelection();
    if (selection && (!chat || !selection.turn.startsWith(`${chat}:`)))
      selectCitation(null);
  }, [chat]);
  const answers = useRef(new Map<number, RefObject<View | null>>());
  const { height } = useWindowDimensions();
  const measuring = useRef(false);
  /** Called as the conversation scrolls: which answer is being read. */
  const onScroll = useCallback(() => {
    if (measuring.current || answers.current.size < 2) return;
    measuring.current = true;
    setTimeout(() => {
      const entries = [...answers.current.entries()];
      const tops = new Map<number, number>();
      let pending = entries.length;
      for (const [turn, ref] of entries) {
        const node = ref.current;
        const done = () => {
          if (--pending > 0) return;
          measuring.current = false;
          const line = height * 0.45;
          const reading = [...tops.entries()]
            .filter(([, top]) => top <= line)
            .sort((a, b) => b[1] - a[1])[0]?.[0];
          const next =
            reading ?? [...tops.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
          if (next !== undefined)
            setActive((now) => (now === next ? now : next));
        };
        if (!node) done();
        else
          node.measureInWindow((_x, y) => {
            tops.set(turn, y);
            done();
          });
      }
    }, 120);
  }, [height]);
  const context = useMemo<AskPane>(
    () => ({
      open(href, title, placement) {
        const entry = entryForWebPath(href, title);
        if (entry) {
          setStack([entry]);
          if (placement) trackSourceOpen('app', placement);
        } else openAnswerLink(href, placement);
      },
      cite(turn, n) {
        setActive(turn);
        setMark({ turn, n });
        setStack([]);
      },
      register(turn, ref) {
        answers.current.set(turn, ref);
        return () => {
          if (answers.current.get(turn) === ref) answers.current.delete(turn);
        };
      },
    }),
    [],
  );
  const answer = shown >= 0 ? thread[shown] : undefined;
  const marked = mark && mark.turn === shown ? mark.n : 1;
  const move = (n: number) => {
    if (!answer || shown < 0) return;
    const data = answer.result ?? {
      answer: answer.text,
      sources: answer.sources ?? [],
      citations: {},
    };
    setMark({ turn: shown, n });
    setStack([]);
    if (chat)
      selectCitation({
        turn: turnKey(chat, shown),
        n,
        claim: firstClaim(answerBlocks(data), n),
      });
  };
  return {
    context,
    onScroll,
    pane: (
      <SourcesPane
        answer={answer?.role === 'answer' ? answer : undefined}
        marked={marked}
        move={move}
        stack={stack}
        setStack={setStack}
        open={context.open}
        profiles={profiles}
        onAsk={onAsk}
        readFailed={readFailed}
        offline={offline}
      />
    ),
  };
}

function SourcesPane({
  answer,
  marked,
  move,
  stack,
  setStack,
  open,
  profiles,
  onAsk,
  readFailed,
  offline,
}: {
  answer?: Turn;
  marked: number;
  move: (n: number) => void;
  stack: RecordEntry[];
  setStack: (next: (current: RecordEntry[]) => RecordEntry[]) => void;
  open: AskPane['open'];
  profiles?: Map<string, AskPerson>;
  onAsk?: (question: string) => void;
  readFailed: boolean;
  offline: boolean;
}) {
  const top = stack.at(-1);
  const ground = askGround();
  const pane: SplitPane<RecordEntry> = {
    push: (entry) => setStack((current) => [...current, entry]),
    back: () => {
      if (!stack.length) return false;
      setStack((current) => current.slice(0, -1));
      return true;
    },
    select: (entry) => setStack(() => [entry]),
    entries: stack,
    depth: stack.length,
  };
  const below = stack.length > 1 ? stack.at(-2)! : null;
  return (
    <SurfaceContext.Provider value={ground}>
      <View
        style={[
          styles.pane,
          { width: '100%', backgroundColor: colors[ground] },
        ]}
        testID="ask-sources-pane"
      >
        <LayoutRegion style={styles.grow}>
          {top ? (
            <PaneHost
              pane={pane}
              bar={
                <PaneBar
                  back={below ? entryLabel(below) : 'Sources'}
                  onBack={() => pane.back()}
                  actions={<RecordShare entry={top} />}
                />
              }
            >
              <View
                key={`${top.kind}:${top.key}:${stack.length}`}
                style={styles.grow}
              >
                <RecordDetail entry={top} />
              </View>
            </PaneHost>
          ) : answer ? (
            <SourceList
              answer={answer}
              marked={marked}
              move={move}
              open={open}
              profiles={profiles}
            />
          ) : (
            <ScrollView
              style={styles.grow}
              contentContainerStyle={styles.content}
              contentInsetAdjustmentBehavior="automatic"
              testID="ask-pane-idle-list"
            >
              <AskIdle
                onAsk={(q) => onAsk?.(q)}
                offline={offline}
                readFailed={readFailed}
                showConversations={false}
                testPrefix="ask-pane"
              />
            </ScrollView>
          )}
        </LayoutRegion>
      </View>
    </SurfaceContext.Provider>
  );
}

function SourceList({
  answer,
  marked,
  move,
  open,
  profiles,
}: {
  answer: Turn;
  marked: number;
  move: (n: number) => void;
  open: AskPane['open'];
  profiles?: Map<string, AskPerson>;
}) {
  const sources = answer.result?.sources ?? answer.sources ?? [];
  const { cited, also, numbered } = citedSources(sources);
  const source = numbered ? cited[marked - 1] : undefined;
  // Up and Down move between the cited sources (journeys/ask.md 4.12);
  // Return on a source found but not cited opens it in the pane.
  const ordered = [...cited, ...also];
  const cursor = useListKeys(
    ordered.map((s) => s.resource),
    (key) => {
      const s = ordered.find((item) => item.resource === key);
      if (s) open(sourcePath(s), sourceTitle(s), 'sources_pane');
    },
    () => undefined,
  );
  const cursorAt = numbered
    ? cited.findIndex((s) => s.resource === cursor) + 1
    : 0;
  useEffect(() => {
    if (cursorAt && cursorAt !== marked) move(cursorAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorAt]);
  return (
    <ScrollView
      style={styles.grow}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      testID="ask-sources-list"
    >
      {source ? (
        <View style={styles.section}>
          {cited.length > 1 ? (
            <View style={styles.bar}>
              <IconButton
                symbol="chevron.up"
                accessibilityLabel={citationCopy.previous}
                disabled={marked <= 1}
                onPress={() => move(marked - 1)}
                testID="ask-pane-previous"
              />
              <IconButton
                symbol="chevron.down"
                accessibilityLabel={citationCopy.next}
                disabled={marked >= cited.length}
                onPress={() => move(marked + 1)}
                testID="ask-pane-next"
              />
            </View>
          ) : null}
          <CitationContent
            record={source}
            n={marked}
            profiles={profiles}
            focusKey={`${answer.at ?? ''}:${marked}`}
            placement="sources_pane"
            onOpenRecord={() =>
              open(sourcePath(source), sourceTitle(source), 'sources_pane')
            }
            onOpenPerson={(person) =>
              open(`/subject/person/${person.slug}`, person.name)
            }
          />
        </View>
      ) : null}
      {cited.length ? (
        <View style={styles.section}>
          <Text variant="groupHeader">
            {numbered
              ? `Records cited (${cited.length})`
              : `Records found (${cited.length})`}
          </Text>
          <InsetGroup>
            {cited.map((s, i) => (
              <CitedRecordRow
                key={s.resource}
                record={s}
                profiles={profiles}
                n={numbered ? i + 1 : undefined}
                selected={numbered ? marked === i + 1 : cursor === s.resource}
                placement="sources_pane"
                onPress={() =>
                  numbered
                    ? move(i + 1)
                    : open(sourcePath(s), sourceTitle(s), 'sources_pane')
                }
                testID={`ask-pane-source-${i + 1}`}
              />
            ))}
          </InsetGroup>
        </View>
      ) : null}
      {also.length ? (
        <View style={styles.section}>
          <Text variant="groupHeader">Also found, not cited</Text>
          <InsetGroup>
            {also.map((s) => (
              <CitedRecordRow
                key={s.resource}
                record={s}
                profiles={profiles}
                selected={cursor === s.resource}
                placement="sources_pane"
                onPress={() =>
                  open(sourcePath(s), sourceTitle(s), 'sources_pane')
                }
              />
            ))}
          </InsetGroup>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pane: {
    height: '100%',
    borderLeftWidth: hairline,
    borderLeftColor: colors.dividerDefault,
  },
  grow: { flex: 1 },
  content: {
    gap: rhythm.section,
    paddingHorizontal: rhythm.block + rhythm.line,
    paddingVertical: rhythm.block,
  },
  section: { gap: rhythm.groupHeader },
  bar: { flexDirection: 'row', justifyContent: 'flex-end' },
});
