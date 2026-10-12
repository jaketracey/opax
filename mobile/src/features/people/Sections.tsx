import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { peopleDepth } from '../../api/runtime';
import type { PersonProfile } from '../../api/person-identity';
import type { RecordResult } from '../../api/client';
import { serverPassage } from '../../api/passage-text';
import {
  ChoiceChips,
  LinkRow,
  RowList,
  type InfoNotes,
  type SourceDetails,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  KeyValueList,
  LoadingState,
  Section,
  Text,
  errorMessage,
  MACHINE_BRIEF_EXPLANATION,
  MachineLabel,
} from '../../design/primitives';
import { formatCount, formatDate, formatPercent } from '../../design/format';
import { jurisdictionName } from '../../design/parliament';
import { fromWebPath } from '../../navigation/routes';
import { openOnWeb, openSource } from '../../navigation/external';
import { rhythm, type Accent } from '../../design/tokens';
import { BlockSource, recordBlock } from '../your-mp/Evidence';
import {
  diaryFor,
  matchingNews,
  displayedRecordTitle,
  cleanPassage,
  type RecordRow,
} from './model';

const topicNames: Record<string, string> = {
  gambling: 'Gambling',
  'financial-services': 'Financial services',
  'mining-energy': 'Mining & energy',
  'climate-environment': 'Climate & environment',
  'property-construction': 'Property & construction',
  housing: 'Housing',
  health: 'Health',
  'media-communications': 'Media & communications',
  'hospitality-alcohol': 'Hospitality & alcohol',
  'defence-security': 'Defence & security',
  agriculture: 'Agriculture',
  'unions-workplace': 'Unions & workplace',
  immigration: 'Immigration',
  'indigenous-affairs': 'Indigenous affairs',
  'tax-budget': 'Tax & budget',
  education: 'Education',
  'welfare-social': 'Welfare & social services',
  'integrity-democracy': 'Integrity & democracy',
  'infrastructure-transport': 'Infrastructure & transport',
  'justice-law': 'Justice & law',
  'foreign-affairs': 'Foreign affairs',
};
/**
 * A block read on demand: a row in "More from the record" until it is
 * tapped, then its own section. Its methodology joins the source line the
 * loaded block ends with, so the heading carries no ⓘ.
 */
export interface MoreItem<T = unknown> {
  /** The loaded section's test ID; its row is `${id}-toggle`. */
  id: string;
  /** The loaded section's title: "What they talk about". */
  title: string;
  /** The row's title: "Topics". */
  row: string;
  accent?: Accent;
  load: () => Promise<T>;
  render: (data: T) => ReactNode;
}
/** A typed item as the section holds it: its data is read back by its own render. */
function moreItem<T>(item: MoreItem<T>): MoreItem {
  return item as unknown as MoreItem;
}
type Read =
  | { status: 'busy' }
  | { status: 'error'; message: string }
  | { status: 'done'; value: unknown };

/**
 * One section, "More from the record", of rows that each load in place when
 * tapped (pass 5, P2-1): never a section around a single "Show …" row. A
 * loaded block replaces its row with its own section, drawn above; the
 * section goes once every row has loaded. Nothing is read until a row is
 * tapped, and a block is read once.
 */
export function MoreFromRecord({
  items,
  testID = 'more-from-record',
}: {
  items: readonly MoreItem[];
  testID?: string;
}) {
  const [reads, setReads] = useState<Record<string, Read>>({});
  const active = useRef(true),
    pending = useRef(new Set<string>());
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const read = async (item: MoreItem) => {
    if (pending.current.has(item.id)) return;
    pending.current.add(item.id);
    setReads((r) => ({ ...r, [item.id]: { status: 'busy' } }));
    try {
      const value = await item.load();
      if (active.current) {
        setReads((r) => ({ ...r, [item.id]: { status: 'done', value } }));
        AccessibilityInfo.announceForAccessibility(item.title + ' loaded');
      }
    } catch (e) {
      if (active.current) {
        setReads((r) => ({
          ...r,
          [item.id]: { status: 'error', message: errorMessage(e) },
        }));
        AccessibilityInfo.announceForAccessibility(
          item.title + ' could not be loaded',
        );
      }
    } finally {
      pending.current.delete(item.id);
    }
  };
  const done = (item: MoreItem) => {
    const r = reads[item.id];
    return r?.status === 'done' ? r : null;
  };
  const rows = items.filter((item) => !done(item));
  return (
    <>
      {items.map((item) => {
        const loaded = done(item);
        return loaded ? (
          <Section
            key={item.id}
            title={item.title}
            testID={item.id}
            accent={item.accent ?? 'people'}
          >
            {item.render(loaded.value)}
          </Section>
        ) : null;
      })}
      {rows.length ? (
        <Section title="More from the record" accent="people" testID={testID}>
          <RowList>
            {rows.flatMap((item) => {
              const r = reads[item.id];
              return [
                <LinkRow
                  key={item.id}
                  title={item.row}
                  accessibilityHint="Loads here"
                  disabled={r?.status === 'busy'}
                  testID={item.id + '-toggle'}
                  onPress={() => void read(item)}
                />,
                r?.status === 'busy' ? (
                  <LoadingState
                    key={item.id + '-loading'}
                    label={'Loading ' + item.row.toLowerCase()}
                  />
                ) : r?.status === 'error' ? (
                  <ErrorState
                    key={item.id + '-error'}
                    message={r.message}
                    onRetry={() => void read(item)}
                    testID={item.id + '-error'}
                  />
                ) : null,
              ].filter(Boolean);
            })}
          </RowList>
        </Section>
      ) : null}
    </>
  );
}
/**
 * A fetched record's one source line: its date and source, "Saved [date]"
 * for a saved copy, and the notes and originals in the source sheet.
 */
export function ReadDate({
  record,
  citation,
  about,
  originals,
  testID,
}: {
  record: RecordResult<unknown>;
  citation: string;
  /** The source sheet's title and notes. */
  about?: InfoNotes;
  originals?: SourceDetails['originals'];
  testID?: string;
}) {
  return (
    <BlockSource
      block={recordBlock(record)}
      citation={citation}
      title={about?.title}
      notes={about?.notes}
      originals={originals}
      testID={testID}
    />
  );
}
/** What they talk about: topic shares, read on demand. */
export function topicsItem(name: string): MoreItem {
  return moreItem({
    id: 'person-topics',
    title: 'What they talk about',
    row: 'Topics',
    load: () => peopleDepth.topics(name),
    render: (data) => <Topics data={data} />,
  });
}
function Topics({
  data,
}: {
  data: Awaited<ReturnType<typeof peopleDepth.topics>>;
}) {
  const [era, setEra] = useState<'all' | 'then' | 'now'>('all');
  const profile = data.person.data.profiles[era];
  return (
    <Group>
      <ChoiceChips<'all' | 'then' | 'now'>
        value={era}
        onChange={setEra}
        segments={[
          { value: 'all', label: 'All' },
          { value: 'then', label: 'Then' },
          { value: 'now', label: 'Now' },
        ]}
        testID="person-topic-era"
      />
      <Text wordSafe variant="strong">
        {profile.label} · {formatCount(profile.labelled)} labelled speeches so
        far
      </Text>
      {profile.topics.length ? (
        profile.topics.slice(0, 8).map((t) => {
          const baseline = data.baseline.data.topics.find(
            (b) => b.slug === t.slug,
          );
          return (
            <Group key={t.slug} gap={rhythm.line}>
              <Heading level={3}>{topicNames[t.slug] ?? t.slug}</Heading>
              <Text wordSafe variant="metadata">
                Their share of labelled speeches:{' '}
                {formatPercent(t.share * 100, 1)} · {formatCount(t.count)}{' '}
                speeches
              </Text>
              {baseline && data.baseline.data.labelled > 0 ? (
                <Text wordSafe variant="fine">
                  Share across the whole labelled record:{' '}
                  {formatPercent(
                    (baseline.count / data.baseline.data.labelled) * 100,
                    1,
                  )}
                </Text>
              ) : null}
            </Group>
          );
        })
      ) : (
        <EmptyState message="No topic-labelled speeches are held for this era yet." />
      )}
      <ReadDate
        record={data.person}
        citation="OPAX topic labels on indexed speeches"
        about={{
          title: 'About the topic profile',
          notes: [data.person.data.coverage],
        }}
        testID="person-topics-source"
      />
    </Group>
  );
}
export function openRecord(row: RecordRow) {
  const path = '/doc/' + encodeURIComponent(row.slug);
  const native = fromWebPath(path);
  if (native) router.push(native);
  else void openOnWeb(path, displayedRecordTitle(row));
}
/** Latest speeches, mentions of a person, or a party in parliament. */
export function recordItem(
  name: string,
  kind: 'speeches' | 'mentions' | 'party',
): MoreItem {
  const title =
    kind === 'speeches'
      ? 'Latest indexed speeches'
      : kind === 'party'
        ? 'In parliament'
        : 'Mentions in parliament';
  const id = kind === 'party' ? 'party-mentions' : 'person-' + kind;
  return moreItem({
    id,
    title,
    row: kind === 'speeches' ? 'Latest speeches' : 'Mentions in parliament',
    load: () =>
      kind === 'speeches'
        ? peopleDepth.speeches(name)
        : peopleDepth.mentions(name, kind === 'party'),
    render: (data) => {
      const rows =
        kind === 'speeches'
          ? data.records.data.results
          : data.records.data.results.slice(0, 5);
      const brief = (r: RecordRow) => data.briefs[r.resource ?? ''];
      // One machine-written label for the list. Where briefs and passages
      // mix, a passage says it is the record's own words.
      const briefs = rows.filter((r) => brief(r)).length;
      return (
        <Group>
          {briefs ? (
            <MachineLabel explanation={MACHINE_BRIEF_EXPLANATION} />
          ) : null}
          {rows.map((r, i) => (
            <Group
              key={r.slug + i}
              gap={rhythm.tight}
              testID={id + '-row-' + i}
            >
              <LinkRow
                title={displayedRecordTitle(r)}
                onPress={() => openRecord(r)}
                testID={id + '-open-' + i}
              />
              <Text wordSafe variant="metadata">
                {r.speaker ? r.speaker + ' · ' : ''}
                {r.date ? formatDate(r.date) : 'Undated'}
                {r.state
                  ? ' · ' +
                    (jurisdictionName(r.state) ?? 'Jurisdiction not recorded')
                  : ''}
                {briefs && !brief(r)
                  ? kind === 'speeches'
                    ? ' · from the speech'
                    : ' · from the record'
                  : ''}
              </Text>
              {brief(r) ? (
                <Text wordSafe>{brief(r)}</Text>
              ) : (
                <Text wordSafe variant="record">
                  {(kind === 'speeches'
                    ? cleanPassage(r.snippet)
                    : kind === 'party'
                      ? serverPassage(r.snippet, { max: 240 })
                      : serverPassage(r.snippet, { max: 220 })) ||
                    'Open the speech to read the record.'}
                </Text>
              )}
            </Group>
          ))}
          {!data.records.data.results.length ? (
            <EmptyState message="No mentions found in the indexed record." />
          ) : null}
          <ReadDate
            record={data.records}
            citation="OPAX indexed parliamentary record; each row opens its source record"
            about={{
              title: 'About this parliamentary record',
              notes: [
                kind === 'speeches'
                  ? 'Newest results within the indexed retrieval window.'
                  : null,
                'Machine briefs are automated summaries; passages are extracts from the record.',
                data.records.data.coverage,
              ],
            }}
            testID={id + '-source'}
          />
        </Group>
      );
    },
  });
}
/** Today's politics headlines that name them. */
export function newsItem(name: string): MoreItem {
  return moreItem({
    id: 'people-news',
    title: 'News headlines',
    row: 'News headlines',
    load: () => peopleDepth.news(),
    render: (data) => {
      const items = matchingNews(name, data.data.items);
      return items.length ? (
        <Group>
          {items.map((item, i) => (
            <Group key={item.url} gap={rhythm.line}>
              <LinkRow
                title={item.title}
                external
                onPress={() => void openSource(item.url, item.title)}
                testID={'people-news-' + i}
              />
              {item.published ? (
                <Text wordSafe variant="fine">
                  {formatDate(item.published)}
                </Text>
              ) : null}
            </Group>
          ))}
          <ReadDate
            record={data}
            citation="ABC News; The Guardian"
            testID="people-news-source"
          />
        </Group>
      ) : (
        <Group>
          <EmptyState message="Nothing in today's politics headlines mentions them." />
          <ReadDate
            record={data}
            citation="ABC News; The Guardian"
            testID="people-news-source"
          />
        </Group>
      );
    },
  });
}
export function PersonDiary({ identity }: { identity: PersonProfile }) {
  const eligible = [
    ...identity.seats.map((s) => s.jurisdiction),
    ...(identity.rosterRow?.states ?? []),
    ...(identity.rosterRow?.representation ?? []).map((s) => s.jurisdiction),
  ].some((j) => j === 'nsw' || j === 'qld');
  return eligible ? <Diary identity={identity} /> : null;
}
function Diary({ identity }: { identity: PersonProfile }) {
  const [record, setRecord] = useState<Awaited<
      ReturnType<typeof peopleDepth.access>
    > | null>(null),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    peopleDepth
      .access()
      .then((r) => {
        if (active) {
          setRecord(r);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [retry]);
  const m = record ? diaryFor(identity, record.data) : null;
  if (record && !m) return null;
  return (
    <Section title="Ministerial diary" accent="people" testID="person-diary">
      {error ? (
        <ErrorState message={error} onRetry={() => setRetry((v) => v + 1)} />
      ) : !m || !record ? (
        <LoadingState label="Loading the ministerial diary" />
      ) : (
        <Group>
          <KeyValueList
            items={[
              {
                label: 'Disclosed meetings',
                value: formatCount(m.meetings_total),
              },
              {
                label: 'With people and organisations outside government',
                value: formatCount(m.external_total),
              },
            ]}
          />
          <Heading level={3}>Most-met organisations</Heading>
          <KeyValueList
            items={m.by_org.map(([org, n]) => ({
              label: org,
              value: formatCount(n),
            }))}
          />
          <Heading level={3}>Recent meetings</Heading>
          {m.recent.map((r, i) => (
            <Group key={i} gap={rhythm.line}>
              <Text wordSafe variant="strong">
                {r.org}
              </Text>
              <Text wordSafe variant="metadata">
                {formatDate(r.date)}
              </Text>
              {r.purpose ? <Text wordSafe>{r.purpose}</Text> : null}
            </Group>
          ))}
          <ReadDate
            record={record}
            citation="NSW Cabinet Office; Queensland Government ministerial diary disclosures"
            originals={
              m.latest_pdf
                ? [{ label: 'Latest diary (PDF)', url: m.latest_pdf }]
                : []
            }
            about={{
              title: 'About the ministerial diary',
              notes: [
                m.jurisdiction === 'qld'
                  ? "From the Queensland Government's monthly ministerial diary disclosures, published for " +
                    m.name +
                    '.'
                  : "From the NSW Cabinet Office's quarterly ministers' diary disclosures. NSW diaries are published by office, so meetings are attributed to the minister holding that office on the date.",
                'Staff, cabinet, departmental and other government meetings are counted but left out of the lists.',
              ],
            }}
            testID="person-diary-source"
          />
        </Group>
      )}
    </Section>
  );
}
