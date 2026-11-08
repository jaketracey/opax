import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  Button as SwiftButton,
  Host,
  Menu,
  Section as SwiftSection,
} from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  labelStyle,
} from '@expo/ui/swift-ui/modifiers';
import { useAccessibilitySize } from '../../design/accessibility';
import { IconButton } from '../../design/controls';
import { Disclosure } from '../../design/disclosure';
import { haptic } from '../../design/haptics';
import { MachinePill, type MachineNote } from '../../design/labels';
import { InsetGroup } from '../../design/layout';
import { confirmAction } from '../../design/menu';
import { PersonRow } from '../../design/people';
import { FigureBlock } from '../../design/record';
import { LinkRow } from '../../design/rows';
import { SourceAffordance, type SourceDetails } from '../../design/source';
import { Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { personRoute } from '../../navigation/routes';
import { openSource } from '../../navigation/external';
import { resultsRoute } from '../../navigation/routes/search';
import { askReportRoute } from '../../navigation/routes/ask';
import { presentSource } from '../../navigation/sheets';
import { shareRecord } from '../../navigation/share';
import { CachedPortrait } from '../CachedPortrait';
import { useIsMyMember } from '../your-mp/useIsMyMember';
import { copyText } from '../records/actions';
import { answerBlocks, parseAnswer } from './answer-markdown';
import { AnswerBody, openAnswerLink, type Claim } from './AnswerBody';
import { CitedRecordRow, sourceRoute } from './AskRows';
import {
  caveat,
  figureBlocks,
  isCalculated,
  kindLine,
  pills,
} from './calculated';
import { copyCitation } from './cite';
import {
  selectCitation,
  showCitation,
  useCitationSelection,
} from './citation-state';
import { defaultOptions, turnKey, type Source, type Turn } from './model';
import { peopleInAnswer, type AskPerson } from './people';
import { answerCopyText, answeredLong, answeredText } from './share-answer';
import { useAskPane } from './SourcesPane';
import { citedSources, sourceDate, sourceTitle } from './source-present';
import { askErrors } from './turn-copy';

export { openAnswerLink } from './AnswerBody';
/** The machine note's words (journeys/ask.md 9). */
export const machineNote: MachineNote = {
  title: 'Machine-written',
  body: [
    'Written by a model from the records cited below. Check them before you rely on it.',
  ],
};
export const answerNotes = {
  cached:
    'This answer may have been written earlier for the same question. Cite the records, not this answer.',
  pay: 'OPAX worked these salaries out from the Remuneration Tribunal’s determinations and the Parliamentary Handbook’s record of who held each post. They are entitlements, not payslips, and leave out allowances, expenses and superannuation.',
  money:
    'OPAX added up these totals from selected disclosure records. Receipts include more than gifts, and this selection does not cover every donor.',
  people: 'People are listed in the order the answer cites them.',
  carried: (source: string) =>
    source
      ? `This suggested question used a passage from “${source}”, found for the previous answer.`
      : 'This suggested question used a passage found for the previous answer.',
};
/** The thread scrolls a claim above the half-height citation sheet. */
export const AskRevealContext = createContext<((target: View) => void) | null>(
  null,
);
/** A legacy answer's date: the conversation's created (first) or updated (later) time. */
export type LegacyDate = { at: number; bound: boolean } | null;

export function AnswerView({
  turn,
  question,
  index,
  chat,
  legacy = null,
  profiles,
  paneShowsSources = false,
}: {
  turn: Turn;
  question: Turn;
  /** The answer's place in the thread. */
  index: number;
  /** The conversation's id, for `/citation`, `/source` and the report. */
  chat: string;
  legacy?: LegacyDate;
  profiles: Map<string, AskPerson>;
  /** iPad regular width: the pane lists the sources, so the column does not. */
  paneShowsSources?: boolean;
}) {
  const pane = useAskPane();
  const self = useRef<View>(null);
  const blockRefs = useRef(new Map<string, View | null>());
  const reveal = useContext(AskRevealContext);
  const stacked = useAccessibilitySize();
  const key = turnKey(chat, index);
  const selection = useCitationSelection();
  const mine = selection?.turn === key ? selection : null;
  useEffect(() => {
    if (!pane) return;
    return pane.register(index, self);
  }, [pane, index]);
  // The claim moves just above the sheet's top edge as the sheet opens or
  // is re-targeted.
  useEffect(() => {
    const target = mine?.claim && blockRefs.current.get(mine.claim.block);
    if (target) reveal?.(target);
  }, [mine?.claim, reveal]);
  const data = useMemo(
    () =>
      turn.result || {
        answer: turn.text,
        sources: turn.sources || [],
        citations: {},
      },
    [turn],
  );
  const blocks = useMemo(() => answerBlocks(data), [data]);
  const overview = useMemo(
    () => (data.money_overview ? parseAnswer(data.money_overview) : null),
    [data.money_overview],
  );
  const groups = citedSources(data.sources);
  const numbered = groups.numbered;
  const scoped = ['needs_scope', 'needs_period'].includes(
    data.answer_status ?? '',
  );
  const pill = pills(data);
  const kind = kindLine(data);
  const note = caveat(data);
  const figures = figureBlocks(data);
  const people = useMemo(
    () => (scoped ? [] : peopleInAnswer(data, profiles)),
    [data, profiles, scoped],
  );
  const go = (href: string, title: string) =>
    pane ? pane.open(href, title) : openAnswerLink(href);
  const cite = (numbers: number[], claim: Claim) => {
    const n = numbers[0]!;
    if (pane) {
      pane.cite(index, n);
      selectCitation({ turn: key, n, claim });
    } else showCitation({ turn: key, n, claim });
  };
  const titleFor = (n: number) => {
    const s = groups.cited[n - 1];
    return s
      ? [sourceTitle(s), sourceDate(s)].filter(Boolean).join(', ')
      : undefined;
  };
  const answered = answeredText(turn, legacy);
  const openSources = () =>
    presentSource(askSourceDetails({ turn, question, chat, index, legacy }), {
      testID: 'ask-answer-sources',
    });
  const copyAnswer = async () => {
    if (await copyText(answerCopyText(question, turn, legacy)))
      haptic('success');
  };
  const shareQuestion = () =>
    void shareRecord({
      path: '/ask',
      title: question.text,
      question: {
        text: question.fundingQuestion || question.askedAs || question.text,
        options: question.options || turn.options || { ...defaultOptions },
      },
    });
  const report = () => router.push(askReportRoute(key));
  const cited = numbered ? groups.cited : [];
  const empty = !data.answer.trim();
  const body = (
    <View style={styles.answer} testID="ask-answer">
      {kind ? (
        <Text wordSafe variant="secondary" testID="ask-answer-kind">
          {kind}
        </Text>
      ) : null}
      {overview ? (
        <View style={styles.block}>
          <MachinePill note={machineNote} testID="ask-machine-label" />
          <AnswerBody blocks={overview} onLink={go} />
        </View>
      ) : null}
      {empty ? null : (
        <View style={styles.block}>
          {pill.body && !overview ? (
            <MachinePill note={machineNote} testID="ask-machine-label" />
          ) : null}
          <AnswerBody
            blocks={blocks}
            onCite={cite}
            onLink={go}
            titleFor={titleFor}
            claim={mine?.claim ?? null}
            selected={mine?.n ?? null}
            blockRefs={blockRefs}
            markFallback={stacked ? 'superscript' : undefined}
            testID={`ask-answer-${index}`}
          />
        </View>
      )}
      {figures.map((figure, i) => (
        <FigureBlock
          key={i}
          // FigureBlock's `source` is its citation, not an image (follow-up:
          // design/record.tsx renames it to `citation`).
          {...{ source: { citation: figure.source, asOf: figure.asAt } }}
          value={figure.value}
          label={figure.label ?? `As at ${figure.asAt}`}
          caveat={note && isCalculated(data) ? note : undefined}
          testID={i ? `ask-figure-${i}` : 'ask-figure'}
        />
      ))}
      {data.evidence_excerpts?.map((excerpt, i) => {
        const n =
          groups.cited.findIndex((s) => s.resource === excerpt.resource) + 1;
        const source = groups.cited[n - 1];
        return (
          <View key={i} style={styles.block}>
            <AnswerBody
              blocks={[
                {
                  kind: 'quote',
                  spans: [{ kind: 'text', text: excerpt.text, sentence: 0 }],
                },
              ]}
            />
            {source ? (
              <CitedRecordRow
                record={source}
                n={numbered ? n : undefined}
                onPress={() =>
                  cite([n], { block: `excerpt.${i}`, sentence: 0 })
                }
              />
            ) : null}
          </View>
        );
      })}
      {note && !figures.length ? (
        <Text wordSafe variant="footnote" tone="inkSoft">
          {note}
        </Text>
      ) : null}
      {data.pay_next?.length ? (
        <InsetGroup>
          {data.pay_next.map((s) => (
            <LinkRow
              key={s.href}
              title={s.label}
              onPress={() => go(s.href, s.label)}
            />
          ))}
        </InsetGroup>
      ) : null}
      {empty ? (
        <View style={styles.block}>
          <Text wordSafe testID="ask-error-empty">
            {groups.cited.length ? askErrors.empty : askErrors.emptyNone}
          </Text>
          <SearchOpaxRow question={question.text} />
        </View>
      ) : null}
      {scoped ? <SearchOpaxRow question={question.text} /> : null}
      {!scoped && groups.cited.length && !paneShowsSources ? (
        <View
          style={styles.labelled}
          accessibilityRole="list"
          accessibilityLabel={`${numbered ? 'Records cited' : 'Records found'}, ${groups.cited.length} ${groups.cited.length === 1 ? 'item' : 'items'}`}
          testID={`ask-records-${index}`}
        >
          <Text variant="groupHeader" testID="ask-records-cited">
            {numbered ? 'Records cited' : 'Records found'} (
            {groups.cited.length})
          </Text>
          <InsetGroup>
            {groups.cited.map((source, i) => (
              <CitedRecordRow
                key={source.resource}
                record={source}
                n={numbered ? i + 1 : undefined}
                selected={mine?.n === i + 1}
                // An open citation sheet moves to this source instead.
                onPress={
                  mine
                    ? () => showCitation({ turn: key, n: i + 1 })
                    : pane
                      ? () => go(source.href, source.title)
                      : sourceRoute(source)
                        ? undefined
                        : () => go(source.href, source.title)
                }
                onShowPassage={
                  numbered
                    ? () => showCitation({ turn: key, n: i + 1 })
                    : undefined
                }
                testID={`ask-citation-${i + 1}`}
              />
            ))}
          </InsetGroup>
        </View>
      ) : null}
      {people.length ? (
        <AnswerPeople
          people={people}
          onOpen={(person) =>
            pane
              ? pane.open(`/subject/person/${person.slug}`, person.name)
              : router.push(personRoute(person.slug))
          }
        />
      ) : null}
      <View style={[styles.foot, stacked ? styles.footStacked : null]}>
        <SourceAffordance
          glyph="doc.text"
          date={null}
          name={answered}
          accessibilityLabel={`${answeredLong(turn, legacy)}. Source: OPAX`}
          accessibilityHint="Opens the sources"
          onPress={openSources}
          testID="ask-answer-sources"
        />
        <AnswerMenu
          onCopy={() => void copyAnswer()}
          onShare={shareQuestion}
          onReport={report}
          cited={cited}
        />
      </View>
    </View>
  );
  // The pane follows the answer being read: it measures this view.
  return (
    <View ref={self} collapsable={false}>
      {body}
    </View>
  );
}
/** The answer's sources as the shared `/source` sheet's Ask variant (A4). */
export function askSourceDetails({
  turn,
  question,
  chat,
  index,
  legacy,
}: {
  turn: Turn;
  question: Turn;
  chat: string;
  index: number;
  legacy: LegacyDate;
}): SourceDetails {
  const data = turn.result || {
    answer: turn.text,
    sources: turn.sources || [],
    citations: {},
  };
  const groups = citedSources(data.sources);
  const key = turnKey(chat, index);
  const leave = (source: Source) => {
    router.back();
    const href = sourceRoute(source);
    if (href) router.push(href);
    else openAnswerLink(source.href);
  };
  const originals = groups.cited.filter((s) => s.url?.startsWith('https://'));
  const calculated = isCalculated(data);
  const people = data.sources.some((s) => s.cited && s.speaker);
  return {
    asOf:
      turn.at != null
        ? new Date(turn.at)
        : legacy
          ? new Date(legacy.at * 1000)
          : null,
    report: {
      label: 'Report this answer',
      onPress: () => {
        router.back();
        router.push(askReportRoute(key));
      },
    },
    extra: (
      <View style={styles.sheet} testID="ask-sources">
        <Text
          wordSafe
          variant="secondary"
          numberOfLines={2}
          testID="ask-sources-question"
        >
          {question.askedAs || question.text}
        </Text>
        <Text variant="groupHeader">{answeredLong(turn, legacy)}</Text>
        {groups.cited.length ? (
          <InsetGroup
            header={groups.numbered ? 'Cited in the answer' : 'Found'}
          >
            {groups.cited.map((source, i) => (
              <CitedRecordRow
                key={source.resource}
                record={source}
                n={groups.numbered ? i + 1 : undefined}
                onPress={() => leave(source)}
                testID={`ask-sources-cited-${i + 1}`}
              />
            ))}
          </InsetGroup>
        ) : (
          <Text wordSafe variant="body" testID="ask-sources-empty">
            No records were found for this question.
          </Text>
        )}
        {originals.length ? (
          <InsetGroup header="Originals" testID="ask-sources-originals">
            {originals.map((source) => (
              <LinkRow
                key={source.resource}
                title={[source.source, sourceTitle(source)]
                  .filter(Boolean)
                  .join(' · ')}
                detail={sourceDate(source) ?? 'Date not published'}
                external
                onPress={() => void openSourceUrl(source)}
              />
            ))}
          </InsetGroup>
        ) : null}
        {groups.also.length ? (
          <InsetGroup header="Also found, not cited">
            {groups.also.map((source) => (
              <CitedRecordRow
                key={source.resource}
                record={source}
                onPress={() => leave(source)}
              />
            ))}
          </InsetGroup>
        ) : null}
        <InsetGroup header="Notes">
          <View style={styles.notes}>
            {[
              calculated
                ? data.pay_answer
                  ? answerNotes.pay
                  : answerNotes.money
                : answerNotes.cached,
              data.money_context,
              turn.carried ? answerNotes.carried(turn.carried.source) : null,
              people ? answerNotes.people : null,
            ]
              .filter((text): text is string => !!text)
              .map((text, i) => (
                <Text key={i} wordSafe variant="body">
                  {text}
                </Text>
              ))}
          </View>
        </InsetGroup>
      </View>
    ),
  };
}
async function openSourceUrl(source: Source) {
  await openSource(source.url!, sourceTitle(source));
}
/** "Search OPAX for "{question}"": Ask's way back to Search (journeys/ask.md 14). */
export function SearchOpaxRow({
  question,
  grouped = false,
}: {
  question: string;
  /** Already inside an `InsetGroup` (the clarify turn's two rows). */
  grouped?: boolean;
}) {
  const row = (
    <LinkRow
      title={`Search OPAX for “${question}”`}
      symbol="magnifyingglass"
      onPress={() =>
        router.push(resultsRoute('all', { scope: 'all', q: question }))
      }
      testID="ask-search-opax"
    />
  );
  return grouped ? row : <InsetGroup>{row}</InsetGroup>;
}
function AnswerPeople({
  people,
  onOpen,
}: {
  people: AskPerson[];
  onOpen: (person: AskPerson) => void;
}) {
  const [more, setMore] = useState(false);
  const shown = people.slice(0, 3);
  const rest = people.slice(3);
  return (
    <View
      style={styles.labelled}
      accessibilityRole="list"
      accessibilityLabel={`People in this answer, ${people.length} ${people.length === 1 ? 'item' : 'items'}`}
      testID="ask-people"
    >
      <Text variant="groupHeader">People in this answer</Text>
      <InsetGroup>
        {shown.map((person) => (
          <AnswerPerson key={person.slug} person={person} onOpen={onOpen} />
        ))}
      </InsetGroup>
      {rest.length ? (
        <Disclosure
          label={`${rest.length} more`}
          open={more}
          onToggle={setMore}
          testID="ask-people-more"
        >
          <InsetGroup>
            {rest.map((person) => (
              <AnswerPerson key={person.slug} person={person} onOpen={onOpen} />
            ))}
          </InsetGroup>
        </Disclosure>
      ) : null}
    </View>
  );
}
/** One person row everywhere, with "Your MP" on the reader's own member. */
function AnswerPerson({
  person,
  onOpen,
}: {
  person: AskPerson;
  onOpen: (person: AskPerson) => void;
}) {
  // Computed on the device; the saved seat is never sent with a question.
  const yourMP = useIsMyMember(person.slug);
  return (
    <PersonRow
      name={person.name}
      party={person.party}
      place={person.place}
      yourMP={yourMP}
      portrait={
        <CachedPortrait
          name={person.name}
          slug={person.slug}
          testID={`ask-person-portrait-${person.slug}`}
        />
      }
      onPress={() => onOpen(person)}
      testID={`ask-person-${person.slug}`}
    />
  );
}
/**
 * One pull-down per answer, at its foot (journeys/ask.md 13 item 2): a
 * UIMenu, not an action sheet, so the answer text stays selectable.
 */
function AnswerMenu({
  onCopy,
  onShare,
  onReport,
  cited,
}: {
  onCopy: () => void;
  onShare: () => void;
  onReport: () => void;
  cited: Source[];
}) {
  const citeAll = (style: 'apa' | 'aglc') => () =>
    void copyCitation(cited, style);
  if (Platform.OS !== 'ios')
    return (
      <IconButton
        symbol="ellipsis.circle"
        accessibilityLabel="Answer options"
        testID="ask-answer-menu"
        onPress={() =>
          confirmAction('', [
            { title: 'Copy answer', onPress: onCopy },
            { title: 'Share question', onPress: onShare },
            ...(cited.length
              ? [
                  { title: 'Copy APA 7', onPress: citeAll('apa') },
                  { title: 'Copy AGLC', onPress: citeAll('aglc') },
                ]
              : []),
            { title: 'Report a problem', onPress: onReport },
          ])
        }
      />
    );
  return (
    <Host matchContents style={styles.menu}>
      <Menu
        label="Answer options"
        systemImage="ellipsis.circle"
        modifiers={[
          labelStyle('iconOnly'),
          accessibilityIdentifier('ask-answer-menu'),
        ]}
      >
        <SwiftButton
          label="Copy answer"
          systemImage="doc.on.doc"
          onPress={onCopy}
        />
        <SwiftButton
          label="Share question"
          systemImage="square.and.arrow.up"
          onPress={onShare}
        />
        {cited.length ? (
          <SwiftSection title="Cite">
            <SwiftButton label="Copy APA 7" onPress={citeAll('apa')} />
            <SwiftButton label="Copy AGLC" onPress={citeAll('aglc')} />
          </SwiftSection>
        ) : null}
        <SwiftButton
          label="Report a problem"
          systemImage="exclamationmark.bubble"
          onPress={onReport}
        />
      </Menu>
    </Host>
  );
}
/** Announced once when an answer lands (journeys/ask.md 4.15). */
export function answerReadyAnnouncement(turn: Turn) {
  const count = (turn.result?.sources ?? turn.sources ?? []).filter(
    (s) => s.cited,
  ).length;
  return `Answer ready, ${count ? `${count} ${count === 1 ? 'record' : 'records'} cited` : 'no records cited'}`;
}
export function announceAnswer(turn: Turn) {
  AccessibilityInfo.announceForAccessibilityWithOptions(
    answerReadyAnnouncement(turn),
    { queue: true },
  );
}
const styles = StyleSheet.create({
  answer: { gap: rhythm.group },
  block: { gap: rhythm.tight },
  labelled: { gap: rhythm.groupHeader },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rhythm.tight,
  },
  footStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  menu: { minWidth: 44, minHeight: 44 },
  sheet: { gap: rhythm.group },
  notes: { gap: rhythm.block, paddingVertical: rhythm.row },
});
