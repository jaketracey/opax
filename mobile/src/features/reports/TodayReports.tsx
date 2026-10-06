import { useCallback, useState } from 'react';
import { reports } from '../../api/runtime';
import {
  AsAtLine,
  Button,
  Group,
  Heading,
  KeyValueList,
  Section,
  SegmentedControl,
  Text,
} from '../../design/primitives';
import { RecordRow } from '../RecordRow';
import previews from './record-previews.json';
import { Prose, ReadState, announce, useRead } from './parts';
import { openRecord } from './open';

export function Spotlight() {
  const [slug, setSlug] = useState('gambling');
  const load = useCallback(() => reports.report(slug), [slug]);
  return (
    <Section title="Spotlight on:" testID="today-spotlight">
      <SegmentedControl
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
        <Group>
          <Heading level={3}>{report.title}</Heading>
          {report.lede ? (
            <Prose
              value={report.lede.text}
              sources={report.lede.sources}
              testID="spotlight-lede"
            />
          ) : (
            <Text>{report.blurb}</Text>
          )}
          <RecordRow
            title={`Read the ${report.title} report`}
            onPress={() => openRecord(`/reports/${report.slug}`, report.title)}
            testID="today-spotlight-open"
          />
        </Group>
      )}
    </ReadState>
  );
}
export function ReportsEntry() {
  return (
    <Section title="Reports">
      <RecordRow
        title="Reports"
        detail="Standing investigations across the public record"
        onPress={() => openRecord('/reports', 'Reports')}
        testID="today-reports"
      />
      <RecordRow
        title="Topics A–Z"
        onPress={() => openRecord('/subject/topic', 'Topics A–Z')}
        testID="today-topics"
      />
    </Section>
  );
}
export function TodayCoverage() {
  const read = useRead(reports.corpus);
  return (
    <Section title="Collection & coverage">
      <Text>
        Sources cover different periods and record types. Check coverage when
        comparing parliaments or years.
      </Text>
      <ReadState
        read={read}
        citation="OPAX corpus manifest"
        testID="today-coverage"
      >
        {(data) => (
          <Group>
            <KeyValueList
              items={[
                {
                  label: 'speeches collected',
                  value: data.collected_speeches.toLocaleString(),
                },
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
            <Text variant="fine">
              Snapshot counts describe collected records. They are not live
              search totals.
            </Text>
          </Group>
        )}
      </ReadState>
      <RecordRow
        title="Coverage & datasets"
        onPress={() => openRecord('/stats', 'Sources & coverage')}
        testID="today-stats"
      />
    </Section>
  );
}
export function FromRecord() {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const item = previews[index]!;
  const change = (next: number) => {
    setIndex(next);
    setExpanded(false);
    announce(
      `From the record: ${previews[next]!.name}, ${next + 1} of ${previews.length}`,
    );
  };
  return (
    <Section title="From the record" testID="today-from-record">
      <Group>
        <Heading level={3}>{item.name}</Heading>
        {item.blocks
          .filter((b) => b.text !== item.name && (expanded || b.kind === 'p'))
          .map((b, i) =>
            b.kind === 'h3' ? (
              <Heading key={i} level={3}>
                {b.text}
              </Heading>
            ) : (
              <Text
                key={i}
                variant={b.kind === 'p' ? 'metadata' : 'body'}
                wordSafe
              >
                {b.text}
              </Text>
            ),
          )}
        <Button
          label={expanded ? 'Hide preview' : 'Read preview'}
          expanded={expanded}
          onPress={() => setExpanded((v) => !v)}
        />
        <RecordRow
          title="Open the entry"
          onPress={() =>
            openRecord(item.path.replaceAll('&amp;', '&'), item.name)
          }
          testID="from-record-open"
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
        <AsAtLine asOf={null} citation="OPAX static homepage previews" />
      </Group>
    </Section>
  );
}
