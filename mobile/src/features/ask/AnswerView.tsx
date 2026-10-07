import { useState } from 'react';
import { router } from 'expo-router';
import { webOrigin } from '../../design/environment';
import {
  Button,
  Group,
  Heading,
  PersonRow,
  Section,
  Text,
} from '../../design/primitives';
import { colors, spacing } from '../../design/tokens';
import { formatDate } from '../../design/format';
import { fromWebPath, personRoute } from '../../navigation/routes';
import { openSource, sourceUrl } from '../../navigation/external';
import { shareRecord } from '../../navigation/share';
import {
  dateRuler,
  defaultOptions,
  sourceGroups,
  type Answer,
  type Source,
  type Turn,
} from './model';
export const machineNote =
  'Machine-written from the retrieved passages; not the record.';
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
}: {
  text: string;
  sources?: Source[];
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
          onPress={() => openAnswerLink(source.href)}
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
              paddingVertical: spacing.s3,
              borderBottomWidth: 1,
              borderBottomColor: colors.dividerSubtle,
            }}
          >
            {cells.map((v, j) => (
              <Text key={j}>
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
          <Text key={i} selectable>
            {inline(line.replace(/^[-*]\s/, '• '))}
          </Text>
        ),
      );
  }
  return (
    <Group>
      {blocks}
      {links.map((link, i) => (
        <Button
          key={`${i}-${link.href}`}
          label={link.label}
          onPress={() => openAnswerLink(link.href)}
        />
      ))}
    </Group>
  );
}
function SourceRow({ s, n }: { s: Source; n?: number }) {
  return (
    <Group gap={4}>
      <Button
        label={`${n ? `${n}. ` : ''}${s.title}`}
        onPress={() => openAnswerLink(s.href)}
        testID={n ? `ask-source-${n}` : undefined}
      />
      <Text variant="metadata">
        {[
          s.speaker,
          s.party,
          s.state,
          s.date ? formatDate(s.date) : '',
          s.source,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {s.snippet ? <Text selectable>{s.snippet}</Text> : null}
    </Group>
  );
}
export function AnswerView({
  turn,
  question,
  people,
}: {
  turn: Turn;
  question: Turn;
  people: Map<string, string>;
}) {
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
  return (
    <Section
      testID="ask-answer"
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
        <Group style={{ backgroundColor: colors.sunken, padding: spacing.s4 }}>
          <Text variant="fine">{machineNote}</Text>
          <AnswerBody text={data.money_overview} />
        </Group>
      ) : null}
      {!calculated && data.answer_status !== 'evidence_only' ? (
        <Text variant="fine" testID="ask-machine-label">
          {machineNote}
        </Text>
      ) : null}
      <Group testID={calculated ? 'ask-money-panel' : 'ask-answer-body'}>
        <AnswerBody text={citedText(data)} sources={groups.cited} />
      </Group>
      {data.evidence_excerpts?.map((e, i) => (
        <Group key={i}>
          <Text selectable>“{e.text}”</Text>
          <Button
            label="Read the source passage"
            onPress={() => {
              const s = data.sources.find((s) => s.resource === e.resource);
              if (s) openAnswerLink(s.href);
            }}
          />
        </Group>
      ))}
      {calculated ? (
        <Text variant="fine">{data.pay_answer ? payNote : moneyNote}</Text>
      ) : null}
      {data.pay_next?.map((s) => (
        <Button
          key={s.href}
          label={s.label}
          onPress={() => openAnswerLink(s.href)}
        />
      ))}
      {/* Every citation has a 44pt button, independent of the text's font size. */}
      {groups.cited.map((s, i) => (
        <Button
          key={s.resource}
          label={`${s.cited ? `[${i + 1}]` : `Source ${i + 1}`} ${s.title}`}
          onPress={() => openAnswerLink(s.href)}
          testID={`ask-citation-${i + 1}`}
        />
      ))}
      {roster.length ? (
        <Section title="People in this answer" testID="ask-people-card">
          {roster.map((name) => (
            <PersonRow
              key={name}
              name={name}
              onPress={() => router.push(personRoute(people.get(name)!))}
            />
          ))}
        </Section>
      ) : null}
      {groups.cited.some((s) => s.snippet) ? (
        <Section title="From the record" testID="ask-quote-rail">
          {groups.cited
            .filter((s) => s.snippet)
            .slice(0, 5)
            .map((s) => (
              <Group key={s.resource}>
                <Text selectable>“{s.snippet}”</Text>
                <Button
                  label={[s.speaker, s.date ? formatDate(s.date) : '', s.title]
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={() => openAnswerLink(s.href)}
                />
              </Group>
            ))}
        </Section>
      ) : null}
      <Button
        label={`Sources (${data.sources.length})`}
        onPress={() => setSourcesOpen(!sourcesOpen)}
        expanded={sourcesOpen}
        testID="ask-sources-toggle"
      />
      {sourcesOpen ? (
        <Group testID="ask-sources">
          <Text variant="fine">
            {calculated
              ? data.pay_answer
                ? payNote
                : moneyNote
              : 'Answers may be cached. Cite the sources, not this text.'}
          </Text>
          {groups.cited.map((s, i) => (
            <SourceRow key={s.resource} s={s} n={i + 1} />
          ))}
          {groups.also.length ? (
            <>
              <Button
                label="Also retrieved, not cited in the answer"
                onPress={() => setAlsoOpen(!alsoOpen)}
                expanded={alsoOpen}
                testID="ask-also-toggle"
              />
              {alsoOpen
                ? groups.also.map((s) => <SourceRow key={s.resource} s={s} />)
                : null}
            </>
          ) : null}
        </Group>
      ) : null}
      {dates.length ? (
        <Group testID="ask-date-ruler">
          <Heading level={3}>Dates in the record</Heading>
          {dates.map((s) => (
            <Group key={s.resource} gap={4}>
              <Text variant="metadata">
                {formatDate(s.date!)} · {s.cited ? 'Cited' : 'Retrieved'}
              </Text>
              <Button label={s.title} onPress={() => openAnswerLink(s.href)} />
            </Group>
          ))}
        </Group>
      ) : null}
      {data.money_context ? (
        <Text variant="fine">{data.money_context}</Text>
      ) : null}
      {turn.carried ? (
        <Text variant="fine">
          {turn.carried.source
            ? `This suggested follow-up drew on a passage from “${turn.carried.source}”, retrieved for the previous answer.`
            : 'This suggested follow-up drew on a passage retrieved for the previous answer.'}
        </Text>
      ) : null}
      <Text variant="metadata">
        Viewed {formatDate(new Date().toISOString().slice(0, 10))} · Source:
        OPAX retrieved records
      </Text>
      <Button
        label="Share answer"
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
}
