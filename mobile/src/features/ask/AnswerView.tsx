import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { webOrigin } from '../../design/environment';
import {
  LinkRow,
  RowList,
  Disclosure,
  ViewOriginal,
  Group,
  Heading,
  MachineLabel,
  PersonRow,
  Section,
  Text,
} from '../../design/primitives';
import { colors, rhythm } from '../../design/tokens';
import { formatDate } from '../../design/format';
import { fromWebPath, personRoute } from '../../navigation/routes';
import { openSource, sourceUrl } from '../../navigation/external';
import { shareRecord } from '../../navigation/share';
import { CachedPortrait } from '../CachedPortrait';
import { useAskPane } from './SourcesPane';
import {
  dateRuler,
  defaultOptions,
  parliaments,
  sourceGroups,
  sourcePassage,
  type Answer,
  type Source,
  type Turn,
} from './model';
import { serverPassage } from '../../api/passage-text';
export const machineNote =
  'Written by a model from the retrieved passages; not the record.';
export const moneyNote =
  'Opax calculated these totals from selected public disclosure records. Open a source to explore the supporting funding records. Receipts include more than gifts, and this selection does not cover every donor.';
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
function SourceRow({ s, n }: { s: Source; n?: number }) {
  return (
    <Group gap={4}>
      <LinkRow
        title={`${n ? `${n}. ` : ''}${s.title}`}
        onPress={() => openAnswerLink(s.href)}
        testID={n ? `ask-source-${n}` : undefined}
      />
      <Text wordSafe variant="metadata">
        {[
          s.speaker,
          s.party,
          s.state ? parliaments[s.state] || '' : '',
          s.date ? formatDate(s.date) : '',
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {s.snippet ? (
        <Text wordSafe selectable variant="record">
          {sourcePassage(s.snippet)}
        </Text>
      ) : null}
      <ViewOriginal sources={s.url ? [{ label: s.title, url: s.url }] : []} />
    </Group>
  );
}
export function AnswerView({
  turn,
  question,
  people,
  index,
}: {
  turn: Turn;
  question: Turn;
  people: Map<string, string>;
  /** The answer's place in the thread, for the iPad sources pane. */
  index?: number;
}) {
  // iPad regular width: sources open in the pane beside the conversation.
  const pane = useAskPane();
  const self = useRef<View>(null);
  useEffect(() => {
    if (!pane || index === undefined) return;
    return pane.register(index, self);
  }, [pane, index]);
  const go = (href: string, title: string) =>
    pane ? pane.open(href, title) : openAnswerLink(href);
  const [sourcesOpen, setSourcesOpen] = useState(false),
    [alsoOpen, setAlsoOpen] = useState(false);
  const data = turn.result || {
      answer: turn.text,
      sources: turn.sources || [],
      citations: {},
    },
    groups = sourceGroups(data.sources),
    dates = dateRuler(data.sources);
  const calculated = !!(data.money_ranking || data.pay_answer);
  const roster = [
    ...new Set(
      groups.cited.flatMap((s) =>
        s.speaker && people.has(s.speaker) ? [s.speaker] : [],
      ),
    ),
  ];
  const section = (
    <Section
      testID="ask-answer"
      accent={calculated ? 'money' : 'people'}
      info={{
        title: 'About this answer',
        testID: 'ask-answer-info',
        notes: [
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
        ],
      }}
      title={
        data.answer_status === 'calculated'
          ? data.pay_answer
            ? 'From the pay determinations'
            : 'From disclosed receipts'
          : data.answer_status === 'evidence_only'
            ? 'From the record'
            : data.answer_status === 'uncited'
              ? 'Answer, without citations'
              : 'Answer'
      }
    >
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
      {groups.cited.some((s) => s.snippet) ? (
        <Disclosure
          label="From the record"
          icon="quote.bubble"
          accent="people"
          testID="ask-quote-rail"
        >
          {groups.cited
            .filter((s) => s.snippet)
            .slice(0, 5)
            .map((s) => (
              <Group
                key={s.resource}
                gap={rhythm.tight}
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: colors.navy,
                  paddingLeft: rhythm.heading,
                }}
              >
                <Text wordSafe selectable variant="record">
                  “{sourcePassage(s.snippet, false)}”
                </Text>
                <LinkRow
                  title={s.title}
                  detail={[s.speaker, s.date ? formatDate(s.date, 'short') : '']
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={() => go(s.href, s.title)}
                />
                <ViewOriginal
                  sources={s.url ? [{ label: s.title, url: s.url }] : []}
                />
              </Group>
            ))}
        </Disclosure>
      ) : null}
      {/* On iPad the sources pane lists the retrieved records. */}
      {pane ? null : (
        <Disclosure
          label="Retrieved records"
          value={String(data.sources.length)}
          open={sourcesOpen}
          onToggle={setSourcesOpen}
          testID="ask-sources-toggle"
        >
          <Group testID="ask-sources">
            {groups.cited.map((s, i) => (
              <SourceRow key={s.resource} s={s} n={i + 1} />
            ))}
            {groups.also.length ? (
              <Disclosure
                label="Also retrieved, not cited in the answer"
                open={alsoOpen}
                onToggle={setAlsoOpen}
                testID="ask-also-toggle"
              >
                {groups.also.map((s) => (
                  <SourceRow key={s.resource} s={s} />
                ))}
              </Disclosure>
            ) : null}
          </Group>
        </Disclosure>
      )}
      {dates.length ? (
        <Disclosure
          label="Dates in the record"
          icon="calendar"
          accent="people"
          testID="ask-date-ruler"
        >
          <RowList>
            {dates.map((s) => (
              <LinkRow
                key={s.resource}
                title={s.title}
                detail={`${formatDate(s.date!, 'short')} · ${s.cited ? 'Cited' : 'Retrieved'}`}
                onPress={() => go(s.href, s.title)}
              />
            ))}
          </RowList>
        </Disclosure>
      ) : null}
      <Text wordSafe variant="fine">
        Viewed {formatDate(new Date().toISOString().slice(0, 10), 'short')}
      </Text>
      <LinkRow
        title="Share answer"
        icon="square.and.arrow.up"
        accent="people"
        onPress={() =>
          void shareRecord({
            path: '/ask',
            title: question.text,
            question: {
              text:
                question.fundingQuestion || question.askedAs || question.text,
              options: question.options ||
                turn.options || { ...defaultOptions },
            },
          })
        }
        testID="ask-share"
      />
    </Section>
  );
  // The pane follows the answer being read: it measures this view.
  return pane ? (
    <View ref={self} collapsable={false}>
      {section}
    </View>
  ) : (
    section
  );
}
