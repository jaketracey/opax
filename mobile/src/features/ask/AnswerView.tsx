import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  findNodeHandle,
} from 'react-native';
import { router } from 'expo-router';
import { webOrigin } from '../../design/environment';
import {
  LinkRow,
  RowList,
  Group,
  Heading,
  IconButton,
  MachineLabel,
  PersonRow,
  Section,
  Text,
  useAccessibilitySize,
} from '../../design/primitives';
import { SourceAffordance } from '../../design/source';
import { showMenu, type MenuAction } from '../../design/menu';
import { colors, rhythm } from '../../design/tokens';
import { formatDate } from '../../design/format';
import { fromWebPath, personRoute } from '../../navigation/routes';
import { openSource, sourceUrl } from '../../navigation/external';
import { shareRecord } from '../../navigation/share';
import { reportAnswer } from '../../voice/report-answer';
import { CachedPortrait } from '../CachedPortrait';
import { useAskPane } from './SourcesPane';
import { AnswerSources } from './AnswerSources';
import {
  defaultOptions,
  sourceGroups,
  type Answer,
  type Source,
  type Turn,
} from './model';
import { serverPassage } from '../../api/passage-text';
export const machineNote =
  'Written by a model from the retrieved passages; not the record.';
export const moneyNote =
  'Opax calculated these totals from selected public disclosure records. Open a source to explore the supporting funding records. Receipts include more than gifts, and this selection does not cover every donor.';
/** Shown once a report has been handed to the support page. */
export const reportThanks = 'Thanks. We’ll look at this answer.';
export const payNote =
  'Opax worked these salaries out from the Remuneration Tribunal’s determinations and the Parliamentary Handbook’s record of who held each post. They are entitlements, not payslips, and leave out allowances, expenses and superannuation.';
export function openAnswerLink(path: string) {
  try {
    const url = new URL(path, webOrigin);
    if (url.protocol !== 'https:' || url.username || url.password) return;
    const route =
      url.hostname === new URL(webOrigin).hostname
        ? fromWebPath(url.pathname + url.search + url.hash) ||
          fromWebPath(url.pathname)
        : null;
    if (route) router.push(route);
    else void openSource(sourceUrl(url.toString()));
  } catch {
    /* Malformed model/source links never navigate. */
  }
}
// Citation offsets are Unicode code points, as normaliseFootnotes specifies.
export function citedText(data: Answer) {
  const points = Array.from(data.answer),
    ends = new Map<number, number[]>();
  data.sources
    .filter((s) => s.cited)
    .forEach((s, i) => {
      if (!s.cited) return;
      for (const [, end] of s.answerRanges)
        if (end <= points.length) {
          const ids = ends.get(end) || [];
          if (!ids.includes(i + 1)) ids.push(i + 1);
          ends.set(end, ids);
        }
    });
  return points
    .map(
      (p, i) =>
        p +
        (ends
          .get(i + 1)
          ?.map((n) => ` [${n}]`)
          .join('') || ''),
    )
    .join('');
}
/** Markdown tables stack as labelled rows at AX5. Values come from the answer. */
export function AnswerBody({
  text,
  sources = [],
  onCite,
  onLink = openAnswerLink,
}: {
  text: string;
  sources?: Source[];
  /** iPad sources pane: a citation marks its source there instead. */
  onCite?: (n: number) => void;
  /** Opens a link in the answer (in the sources pane on iPad). */
  onLink?: (href: string, title: string) => void;
}) {
  const inline = (line: string) =>
    line.split(/(\[\d+\])/).map((part, i) => {
      const match = /^\[(\d+)\]$/.exec(part),
        source = match ? sources[Number(match[1]) - 1] : undefined;
      return source ? (
        <Text
          key={i}
          accessibilityRole="link"
          accessibilityLabel={`Citation ${match![1]}: ${source.title}`}
          onPress={() =>
            onCite
              ? onCite(Number(match![1]))
              : onLink(source.href, source.title)
          }
          tone="bronzeInk"
        >
          {part}
        </Text>
      ) : (
        part
      );
    });
  const links = [...text.matchAll(/\[([^\]]+)\]\(([^\s()]+)\)/g)].map((m) => ({
    label: m[1]!,
    href: m[2]!,
  }));
  const clean = text
    .replace(/\[([^\]]+)\]\(([^\s()]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1');
  const lines = clean.split('\n'),
    blocks: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    if (line.startsWith('|') && lines[i + 1]?.match(/^\s*\|[\s:|-]+\|\s*$/)) {
      const heads = line
        .split('|')
        .slice(1, -1)
        .map((s) => s.trim());
      i++;
      while (lines[i + 1]?.trim().startsWith('|')) {
        const cells = lines[++i]!.split('|')
          .slice(1, -1)
          .map((s) => s.trim());
        blocks.push(
          <Group
            key={i}
            style={{
              paddingVertical: rhythm.heading,
              borderBottomWidth: 1,
              borderBottomColor: colors.dividerSubtle,
            }}
          >
            {cells.map((v, j) => (
              <Text wordSafe key={j}>
                {heads[j]}: {v}
              </Text>
            ))}
          </Group>,
        );
      }
    } else
      blocks.push(
        /^#{1,6}\s/.test(line) ? (
          <Heading key={i} level={3}>
            {line.replace(/^#+\s/, '')}
          </Heading>
        ) : (
          <Text wordSafe key={i} selectable>
            {inline(line.replace(/^[-*]\s/, '• '))}
          </Text>
        ),
      );
  }
  return (
    <Group>
      {blocks}
      {links.map((link, i) => (
        <LinkRow
          key={`${i}-${link.href}`}
          title={link.label}
          onPress={() => onLink(link.href, link.label)}
        />
      ))}
    </Group>
  );
}
export function AnswerView({
  turn,
  question,
  people,
  index,
  actions = [],
  onReport = reportAnswer,
}: {
  turn: Turn;
  question: Turn;
  people: Map<string, string>;
  /** The answer's place in the thread, for the iPad sources pane. */
  index?: number;
  /** The conversation's own actions, offered under the answer's ⋯. */
  actions?: readonly MenuAction[];
  /** Talk's report: OPAX's support page, never the answer's words. */
  onReport?: (recordPath: null) => void | Promise<void>;
}) {
  // iPad regular width: sources open in the pane beside the conversation.
  const pane = useAskPane();
  const self = useRef<View>(null);
  const more = useRef<View>(null);
  const stacked = useAccessibilitySize();
  useEffect(() => {
    if (!pane || index === undefined) return;
    return pane.register(index, self);
  }, [pane, index]);
  const go = (href: string, title: string) =>
    pane ? pane.open(href, title) : openAnswerLink(href);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const data = turn.result || {
      answer: turn.text,
      sources: turn.sources || [],
      citations: {},
    },
    groups = sourceGroups(data.sources);
  const calculated = !!(data.money_ranking || data.pay_answer);
  const roster = [
    ...new Set(
      groups.cited.flatMap((s) =>
        s.speaker && people.has(s.speaker) ? [s.speaker] : [],
      ),
    ),
  ];
  // Only an answer of another kind says so; an ordinary answer needs no
  // heading under its question.
  const kind =
    data.answer_status === 'calculated'
      ? data.pay_answer
        ? 'From the pay determinations'
        : 'From disclosed receipts'
      : data.answer_status === 'evidence_only'
        ? 'From the record'
        : data.answer_status === 'uncited'
          ? 'Answer, without citations'
          : null;
  const viewed = `Viewed ${formatDate(new Date().toISOString().slice(0, 10), 'short')}`;
  const share = () =>
    void shareRecord({
      path: '/ask',
      title: question.text,
      question: {
        text: question.fundingQuestion || question.askedAs || question.text,
        options: question.options || turn.options || { ...defaultOptions },
      },
    });
  // The same path as Talk's report (src/voice/report-answer.ts): the support
  // page asks for the question and the wrong words, so no answer text, model
  // call or account travels with it. It names no record: the report is about
  // the answer, not one of its sources.
  const report = async () => {
    try {
      await onReport(null);
    } catch {
      return; // Not handed over: no thanks.
    }
    setReported(true);
    AccessibilityInfo.announceForAccessibility(reportThanks);
  };
  const body = (
    <Group testID="ask-answer">
      {kind ? (
        <Heading level={3} testID="ask-answer-kind">
          {kind}
        </Heading>
      ) : null}
      {data.money_overview ? (
        <Group
          style={{ backgroundColor: colors.moneyWash, padding: rhythm.block }}
        >
          <MachineLabel explanation={machineNote} />
          <AnswerBody text={data.money_overview} />
        </Group>
      ) : null}
      {!calculated && data.answer_status !== 'evidence_only' ? (
        <MachineLabel explanation={machineNote} testID="ask-machine-label" />
      ) : null}
      <Group
        style={
          calculated
            ? { backgroundColor: colors.moneyWash, padding: rhythm.block }
            : undefined
        }
        testID={calculated ? 'ask-money-panel' : 'ask-answer-body'}
      >
        <AnswerBody
          text={citedText(data)}
          sources={groups.cited}
          onCite={
            pane && index !== undefined ? (n) => pane.cite(index, n) : undefined
          }
          onLink={go}
        />
      </Group>
      {data.evidence_excerpts?.map((e, i) => (
        <Group key={i}>
          <Text wordSafe selectable variant="record">
            “{serverPassage(e.text)}”
          </Text>
          <LinkRow
            title="Read the source passage"
            onPress={() => {
              const s = data.sources.find((s) => s.resource === e.resource);
              if (s) go(s.href, s.title);
            }}
          />
        </Group>
      ))}
      {calculated ? (
        <Text wordSafe variant="fine">
          {data.pay_answer
            ? 'Entitlements, not payslips.'
            : 'Selected disclosed receipts; not every donor.'}
        </Text>
      ) : null}
      {data.pay_next?.map((s) => (
        <LinkRow
          key={s.href}
          title={s.label}
          onPress={() => go(s.href, s.label)}
        />
      ))}
      {/* Every citation has a 44pt button, independent of the text's font size. */}
      <RowList>
        {groups.cited.map((s, i) => (
          <LinkRow
            key={s.resource}
            title={`${s.cited ? `[${i + 1}]` : `Record ${i + 1}`} ${s.title}`}
            detail={[s.speaker, s.date ? formatDate(s.date, 'short') : '']
              .filter(Boolean)
              .join(' · ')}
            onPress={() => go(s.href, s.title)}
            testID={`ask-citation-${i + 1}`}
          />
        ))}
      </RowList>
      {roster.length ? (
        <Section
          title="People in this answer"
          accent="people"
          testID="ask-people-card"
        >
          {roster.map((name) => (
            <PersonRow
              key={name}
              name={name}
              portrait={
                <CachedPortrait
                  name={name}
                  slug={people.get(name)}
                  testID={`ask-person-portrait-${people.get(name)}`}
                />
              }
              onPress={() =>
                pane
                  ? pane.open(`/subject/person/${people.get(name)!}`, name)
                  : router.push(personRoute(people.get(name)!))
              }
            />
          ))}
        </Section>
      ) : null}
      {/* One source line and ⋯: the sources, passages, dates and notes are
          behind the line; Share, Report and the conversation's actions
          under ⋯. */}
      <View style={[styles.foot, stacked ? styles.footStacked : null]}>
        <SourceAffordance
          glyph="doc.text"
          date={viewed}
          name={
            data.sources.length
              ? `${data.sources.length} ${data.sources.length === 1 ? 'record' : 'records'}`
              : 'No records retrieved'
          }
          accessibilityLabel={`Sources: ${viewed}, ${data.sources.length} ${data.sources.length === 1 ? 'record' : 'records'}`}
          accessibilityHint="Opens the sources, passages and notes"
          onPress={() => setSourcesOpen(true)}
          testID="ask-answer-sources"
        />
        <View ref={more} collapsable={false}>
          <IconButton
            symbol="ellipsis"
            variant="default"
            accessibilityLabel="More for this answer"
            testID="ask-answer-more"
            onPress={() =>
              showMenu(
                'This answer',
                [
                  { title: 'Share answer', onPress: share },
                  { title: 'Report this answer', onPress: () => void report() },
                  ...actions,
                ],
                findNodeHandle(more.current) ?? undefined,
              )
            }
          />
        </View>
      </View>
      {reported ? (
        <Text wordSafe variant="metadata" testID="ask-report-thanks">
          {reportThanks}
        </Text>
      ) : null}
      {sourcesOpen ? (
        <AnswerSources
          question={question.askedAs || question.text}
          sources={data.sources}
          viewed={viewed}
          notes={[
            calculated
              ? data.pay_answer
                ? payNote
                : moneyNote
              : 'Answers may be cached. Cite the sources, not this text.',
            data.money_context,
            turn.carried
              ? turn.carried.source
                ? `This suggested follow-up drew on a passage from “${turn.carried.source}”, retrieved for the previous answer.`
                : 'This suggested follow-up drew on a passage retrieved for the previous answer.'
              : null,
          ]}
          onOpen={go}
          onClose={() => setSourcesOpen(false)}
        />
      ) : null}
    </Group>
  );
  // The pane follows the answer being read: it measures this view.
  return pane ? (
    <View ref={self} collapsable={false}>
      {body}
    </View>
  ) : (
    body
  );
}

const styles = StyleSheet.create({
  foot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rhythm.tight,
  },
  footStacked: { flexDirection: 'column', alignItems: 'flex-start' },
});
