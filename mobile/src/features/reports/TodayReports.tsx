import { useCallback, useState } from 'react';
import { reports } from '../../api/runtime';
import {
  BigFigure,
  Button,
  Disclosure,
  Group,
  Heading,
  KeyValueList,
  Section,
  ChoiceChips,
  SourceLine,
  Text,
  Card,
} from '../../design/primitives';
import { RecordRow } from '../RecordRow';
import previews from './record-previews.json';
import { ReadState, announce, useRead } from './parts';
import { openRecord } from './open';
import { rhythm } from '../../design/tokens';

export function Spotlight() {
  const [slug, setSlug] = useState('gambling');
  const load = useCallback(() => reports.report(slug), [slug]);
  return (
    <Section title="Spotlight on" accent="leads" testID="today-spotlight">
      <ChoiceChips
        value={slug}
        segments={[
          {
            value: 'gambling',
            label: 'Gambling',
            testID: 'spotlight-gambling',
          },
          { value: 'housing', label: 'Housing', testID: 'spotlight-housing' },
          { value: 'climate', label: 'Climate', testID: 'spotlight-climate' },
        ]}
        onChange={(value) => {
          setSlug(value);
          announce(`Spotlight on ${value}`);
        }}
      />
      <SpotlightContent key={slug} load={load} />
    </Section>
  );
}
function SpotlightContent({
  load,
}: {
  load: () => ReturnType<typeof reports.report>;
}) {
  const read = useRead(load);
  return (
    <ReadState
      read={read}
      citation="OPAX static report"
      testID="today-spotlight-data"
    >
      {(report) => (
        <Card
          padded={false}
          style={{ padding: rhythm.block, gap: rhythm.heading }}
        >
          <Heading level={3}>{report.title}</Heading>
          <Text testID="spotlight-lede">{report.blurb}</Text>
          <RecordRow
            title={`Read the ${report.title} report`}
            path={`/reports/${report.slug}`}
            onPress={() => openRecord(`/reports/${report.slug}`, report.title)}
            testID="today-spotlight-open"
          />
        </Card>
      )}
    </ReadState>
  );
}
export function ReportsEntry() {
  return (
    <Section title="Reports" accent="leads">
      <RecordRow
        title="Reports"
        path="/reports"
        detail="Standing investigations across the public record"
        onPress={() => openRecord('/reports', 'Reports')}
        testID="today-reports"
      />
      <RecordRow
        title="Topics A–Z"
        path="/subject/topic"
        onPress={() => openRecord('/subject/topic', 'Topics A–Z')}
        testID="today-topics"
      />
    </Section>
  );
}
export function TodayCoverage() {
  const read = useRead(reports.corpus);
  return (
    <Section title="Collection and coverage" accent="votes">
      <ReadState
        read={read}
        citation="OPAX corpus manifest"
        sheet={{
          title: 'About the coverage',
          notes: [
            'Sources cover different periods and record types. Check coverage when comparing parliaments or years.',
            'Snapshot counts describe collected records. They are not live search totals.',
          ],
        }}
        testID="today-coverage"
      >
        {(data) => (
          <Group>
            <BigFigure
              value={data.collected_speeches.toLocaleString()}
              label="speeches collected"
              accent="votes"
            />
            <KeyValueList
              items={[
                {
                  label: 'expected resources',
                  value: data.expected_resources.toLocaleString(),
                },
                ...data.sources
                  .filter((s) => s.name.startsWith('AEC donations'))
                  .map((s) => ({
                    label: 'donations classified',
                    value: s.docs.toLocaleString(),
                  })),
              ]}
            />
          </Group>
        )}
      </ReadState>
      <RecordRow
        title="Coverage & datasets"
        path="/stats"
        onPress={() => openRecord('/stats', 'Coverage by source')}
        testID="today-stats"
      />
    </Section>
  );
}
export function FromRecord() {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const item = previews[index]!;
  const path = item.path.replaceAll('&amp;', '&');
  const body = item.blocks.filter(
    (b) => b.kind !== 'p' && b.text !== item.name,
  );
  const change = (next: number) => {
    setIndex(next);
    setExpanded(false);
    announce(
      `From the record: ${previews[next]!.name}, ${next + 1} of ${previews.length}`,
    );
  };
  return (
    <Section title="From the record" accent="bills" testID="today-from-record">
      <Group>
        <Heading level={3}>{item.name}</Heading>
        {item.blocks
          .filter(
            (b) =>
              b.kind === 'p' &&
              b.text !== item.name &&
              b.text !== 'GrantConnect',
          )
          .map((b, i) => {
            const figure = /^(\$[\d,]+)(.*)$/.exec(b.text);
            return figure ? (
              <BigFigure
                key={i}
                value={figure[1]!}
                label={figure[2]!.trim()}
                accent="money"
              />
            ) : (
              <Text key={i} variant="metadata" wordSafe>
                {b.text}
              </Text>
            );
          })}
        {body.length ? (
          <Disclosure
            label="Read preview"
            open={expanded}
            onToggle={setExpanded}
          >
            <Group>
              {body.map((b, i) =>
                b.kind === 'h3' ? (
                  <Heading key={i} level={3}>
                    {b.text}
                  </Heading>
                ) : (
                  <Text key={i} wordSafe>
                    {b.text}
                  </Text>
                ),
              )}
            </Group>
          </Disclosure>
        ) : null}
        {path.startsWith('https://') ? null : (
          <RecordRow
            title="Open the entry"
            path={path}
            onPress={() => openRecord(path, item.name)}
            testID="from-record-open"
          />
        )}
        {/* One source line for the block: the notes, and the original
            record when the entry lives off OPAX. */}
        <SourceLine
          citation="OPAX homepage previews"
          title="About these previews"
          notes={[
            'OPAX static homepage previews. The source supplies no snapshot date.',
          ]}
          originals={
            path.startsWith('https://')
              ? [{ url: path, label: item.name }]
              : undefined
          }
          testID="from-record-source"
        />
        <Text variant="metadata">
          {index + 1} of {previews.length}
        </Text>
        <Button
          label="Previous entries"
          onPress={() => change(index - 1)}
          disabled={index === 0}
          testID="from-record-previous"
        />
        <Button
          label="Next entries"
          onPress={() => change(index + 1)}
          disabled={index === previews.length - 1}
          testID="from-record-next"
        />
      </Group>
    </Section>
  );
}
