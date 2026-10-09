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
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ScrollView,
} from 'react-native';
import {
  Group,
  Heading,
  Hoverable,
  LayoutRegion,
  PaneBar,
  PaneHost,
  RowList,
  Screen,
  SplitEmpty,
  SubSection,
  Text,
  ViewOriginal,
  useAccessibilitySize,
  useHover,
  type SplitPane,
} from '../../design/primitives';
import { formatDate } from '../../design/format';
import {
  SelectedMark,
  selectedWash,
  splitRowStyles,
} from '../../design/selection';
import { colors, hairline, rhythm } from '../../design/tokens';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { useListKeys } from '../../design/list-keys';
import { useCursorReveal } from '../split/cursor';
import { entryForWebPath, entryLabel, type RecordEntry } from '../split/entry';
import { RecordDetail, RecordShare } from '../split/RecordDetail';
import { openAnswerLink } from './AnswerView';
import {
  parliaments,
  sourceGroups,
  sourcePassage,
  type Source,
  type Turn,
} from './model';

/**
 * Ask on iPad regular width: the conversation in the main column and, on
 * the right, the sources of the answer being read: its citations first,
 * numbered as in the answer, then what was retrieved but not cited. The pane
 * follows the conversation as it scrolls; a citation tapped in an answer
 * shows that answer's sources with the citation marked; a source opens in
 * the pane (a profile, a bill, a record), with Back to the sources. Sources
 * the app has no page for open as they do on the phone.
 */
export interface AskPane {
  /** Opens a source in the pane, or as before when the pane cannot draw it. */
  open: (href: string, title: string) => void;
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
export function useAskSources(thread: readonly Turn[]) {
  const latest = thread.map((turn) => turn.role).lastIndexOf('answer');
  const [active, setActive] = useState<number | null>(null);
  const [mark, setMark] = useState<{ turn: number; n: number } | null>(null);
  const [stack, setStack] = useState<RecordEntry[]>([]);
  // The answer the pane shows: the one in view, else the newest.
  const shown =
    active !== null && thread[active]?.role === 'answer' ? active : latest;
  // A new answer brings the pane to it.
  const [seen, setSeen] = useState(latest);
  if (seen !== latest) {
    setSeen(latest);
    setActive(null);
    setMark(null);
    setStack([]);
  }
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
          // The last answer whose top has passed the reading line.
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
  // Stable: it reads only setters and refs.
  const context = useMemo<AskPane>(
    () => ({
      open(href, title) {
        const entry = entryForWebPath(href, title);
        if (entry) setStack([entry]);
        else openAnswerLink(href);
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
  const question = shown > 0 ? thread[shown - 1] : undefined;
  return {
    context,
    onScroll,
    pane: (
      <SourcesPane
        answer={answer?.role === 'answer' ? answer : undefined}
        question={question?.role === 'user' ? question.text : undefined}
        marked={mark && mark.turn === shown ? mark.n : null}
        stack={stack}
        setStack={setStack}
        open={context.open}
      />
    ),
  };
}

const PANE_WIDTH = { min: 320, max: 420 };
function SourcesPane({
  answer,
  question,
  marked,
  stack,
  setStack,
  open,
}: {
  answer?: Turn;
  question?: string;
  marked: number | null;
  stack: RecordEntry[];
  setStack: (next: (current: RecordEntry[]) => RecordEntry[]) => void;
  open: (href: string, title: string) => void;
}) {
  const { width } = useWindowDimensions();
  const large = useAccessibilitySize();
  // At accessibility sizes the pane takes 45% so its rows keep whole words.
  const paneWidth = large
    ? Math.round(width * 0.45)
    : Math.round(
        Math.min(Math.max(width * 0.34, PANE_WIDTH.min), PANE_WIDTH.max),
      );
  const top = stack.at(-1);
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
    <View style={[styles.pane, { width: paneWidth }]} testID="ask-sources-pane">
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
            question={question}
            marked={marked}
            open={open}
          />
        ) : (
          <SplitEmpty
            icon="quote.bubble"
            title="Sources appear here"
            testID="ask-sources-empty"
          />
        )}
      </LayoutRegion>
    </View>
  );
}

function SourceList({
  answer,
  question,
  marked,
  open,
}: {
  answer: Turn;
  question?: string;
  marked: number | null;
  open: (href: string, title: string) => void;
}) {
  const sources = answer.result?.sources ?? answer.sources ?? [];
  const groups = sourceGroups(sources);
  const scroll = useRef<ScrollView>(null);
  const reveal = useCursorReveal(scroll);
  const ordered = [...groups.cited, ...groups.also];
  const cursor = useListKeys(
    ordered.map((source) => source.resource),
    (key) => {
      const source = ordered.find((item) => item.resource === key);
      if (source) open(source.href, source.title);
    },
    reveal.reveal,
  );
  const markedRef = useRef<View>(null);
  const headerBottom = useHeaderBottom();
  // A tapped citation scrolls its source into view in the pane.
  useEffect(() => {
    if (marked === null) return;
    const frame = requestAnimationFrame(() => {
      const inner = scroll.current?.getInnerViewNode();
      if (!inner || !markedRef.current) return;
      markedRef.current.measureLayout(inner, (_x, y) =>
        scroll.current?.scrollTo({
          y: Math.max(y - headerBottom - rhythm.block, -headerBottom),
          animated: true,
        }),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [marked, headerBottom]);
  const cited = groups.cited.some((source) => source.cited);
  return (
    <Screen
      testID="ask-sources-list"
      scrollRef={scroll}
      onScroll={reveal.onScroll}
    >
      <Group gap={rhythm.line}>
        <Heading level={2}>Sources</Heading>
        {question ? (
          <Text wordSafe variant="metadata" testID="ask-sources-question">
            {question}
          </Text>
        ) : null}
      </Group>
      {groups.cited.length ? (
        <RowList>
          {groups.cited.map((source, i) => (
            <SourceItem
              key={source.resource}
              record={source}
              n={cited ? i + 1 : undefined}
              marked={marked === i + 1}
              itemRef={marked === i + 1 ? markedRef : undefined}
              highlighted={cursor === source.resource}
              rows={reveal.rows}
              open={open}
            />
          ))}
        </RowList>
      ) : (
        <Text wordSafe variant="metadata">
          No records were retrieved for this answer.
        </Text>
      )}
      {groups.also.length ? (
        <SubSection title="Also retrieved, not cited">
          <RowList>
            {groups.also.map((source) => (
              <SourceItem
                key={source.resource}
                record={source}
                marked={false}
                highlighted={cursor === source.resource}
                rows={reveal.rows}
                open={open}
              />
            ))}
          </RowList>
        </SubSection>
      ) : null}
    </Screen>
  );
}

function SourceItem({
  record: source,
  n,
  marked,
  itemRef,
  highlighted,
  rows,
  open,
}: {
  record: Source;
  n?: number;
  marked: boolean;
  itemRef?: RefObject<View | null>;
  highlighted: boolean;
  rows: ReturnType<typeof useCursorReveal>['rows'];
  open: (href: string, title: string) => void;
}) {
  const [hovered, onHover] = useHover();
  const row = useRef<View>(null);
  useEffect(() => {
    rows.set(source.resource, row);
    return () => {
      rows.delete(source.resource);
    };
  }, [rows, source.resource]);
  const meta = [
    source.speaker,
    source.party,
    source.state ? parliaments[source.state] || '' : '',
    source.date ? formatDate(source.date, 'short') : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const title = `${n ? `[${n}] ` : ''}${source.title}`;
  return (
    <View ref={row} collapsable={false} style={styles.item}>
      <View ref={itemRef} collapsable={false}>
        <Hoverable effect="none" onHover={onHover}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={[title, meta].filter(Boolean).join(', ')}
            accessibilityState={{ selected: marked }}
            testID={n ? `ask-pane-source-${n}` : undefined}
            onPress={() => open(source.href, source.title)}
            style={({ pressed }) => [
              styles.source,
              splitRowStyles.bleed,
              marked
                ? selectedWash('people')
                : pressed || hovered || highlighted
                  ? { backgroundColor: colors.sunken }
                  : null,
            ]}
          >
            {marked ? <SelectedMark accent="people" /> : null}
            <Text wordSafe variant="strong">
              {title}
            </Text>
            {meta ? (
              <Text wordSafe variant="metadata">
                {meta}
              </Text>
            ) : null}
            {source.snippet ? (
              <Text wordSafe variant="record">
                {sourcePassage(source.snippet)}
              </Text>
            ) : null}
          </Pressable>
        </Hoverable>
      </View>
      <ViewOriginal
        sources={source.url ? [{ label: source.title, url: source.url }] : []}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pane: {
    height: '100%',
    borderLeftWidth: hairline,
    borderLeftColor: colors.dividerDefault,
    backgroundColor: colors.paper,
  },
  grow: { flex: 1 },
  item: { gap: rhythm.line },
  source: { gap: rhythm.line, paddingVertical: rhythm.heading },
});
