import { isAbortError, throwIfAborted } from '../../api/abort';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { peopleDepth } from '../../api/runtime';
import type { PersonProfile } from '../../api/person-identity';
import type { RecordResult } from '../../api/client';
import { SegmentedPicker } from '../../design/controls';
import { Group, Section } from '../../design/layout';
import { LinkRow, ValueRow } from '../../design/rows';
import type { SourceDetails } from '../../design/source';

import { InlineError, Skeleton } from '../../design/states';
import { Heading, Text } from '../../design/text';
import {
  counted,
  formatCount,
  formatDate,
  formatPercent,
} from '../../design/format';
import { colors, hairline, rhythm } from '../../design/tokens';
import {
  fromWebPath,
  recordListRoute,
  personSpeechesRoute,
  topicRoute,
} from '../../navigation/routes';
import { openOnWeb } from '../../navigation/external';
import { topicNames as pageTopicNames } from '../reports/model';
import { BlockSource, recordBlock } from '../your-mp/Evidence';
import {
  diaryEligible,
  diaryFor,
  displayedRecordTitle,
  type RecordRow,
} from './model';

/** A source sheet's title and notes. */
type InfoNotes = { title?: string; notes?: SourceDetails['notes'] };

export const topicNames: Record<string, string> = {
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

type Read<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; value: T };

/**
 * One block's own read: a skeleton, then content or an `InlineError` whose
 * Try again reads this block again and nothing else.
 */
export function useRead<T>(
  load: (signal?: AbortSignal) => Promise<T>,
  key: string,
) {
  const [attempt, setAttempt] = useState(0);
  const token = `${key}#${attempt}`;
  const [result, setResult] = useState<{ token: string; read: Read<T> }>();
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    // A loader that throws before its promise is the same failed read.
    Promise.resolve()
      .then(() => {
        throwIfAborted(controller.signal);
        return load(controller.signal);
      })
      .then((value) => {
        if (active) setResult({ token, read: { status: 'ready', value } });
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted && !isAbortError(error))
          setResult({ token, read: { status: 'error' } });
      });
    return () => {
      active = false;
      controller.abort();
    };
    // The read is keyed by `token`; a new `load` closure is the same read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const read: Read<T> =
    result?.token === token ? result.read : { status: 'loading' };
  return { read, retry };
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

type TopicsData = Awaited<ReturnType<typeof peopleDepth.topics>>;
type Era = 'all' | 'then' | 'now';

/** The era switch's labels from the data's own bounds ("1998 to 2012"). */
export function eraOptions(data: TopicsData) {
  const { then, now } = data.person.data.profiles;
  const bounded = then.from > 0 && then.to > 0 && now.from > 0;
  return bounded
    ? ([
        { value: 'all', label: 'All' },
        { value: 'then', label: `${then.from} to ${then.to}` },
        { value: 'now', label: `Since ${now.from}` },
      ] as const)
    : null;
}

/**
 * Topics (people.md 2.1, "More from the record"): read with the page, shown
 * inline: an era switch only when the data gives era bounds, eight topics
 * with their share, then the block's source line.
 */
export function Topics({ name }: { name: string }) {
  const { read, retry } = useRead(
    (signal?: AbortSignal) => peopleDepth.topics(name, signal),
    name,
  );
  const [era, setEra] = useState<Era>('all');
  if (read.status === 'loading')
    return (
      <View style={styles.block} testID="person-topics">
        <Heading level={3}>Topics</Heading>
        <Skeleton
          shape="rows"
          count={8}
          label="Loading topics"
          testID="person-topics-loading"
        />
      </View>
    );
  if (read.status === 'error')
    return (
      <View style={styles.block} testID="person-topics">
        <Heading level={3}>Topics</Heading>
        <InlineError
          subject="Topics"
          onRetry={retry}
          testID="person-topics-error"
        />
      </View>
    );
  const data = read.value;
  const options = eraOptions(data);
  const profile = data.person.data.profiles[options ? era : 'all'];
  if (!data.person.data.profiles.all.topics.length) return null;
  return (
    <View style={styles.block} testID="person-topics">
      <Heading level={3}>Topics</Heading>
      {options ? (
        <SegmentedPicker<Era>
          options={options}
          value={era}
          onChange={setEra}
          accessibilityLabel="Topics period"
          testID="person-topic-era"
        />
      ) : null}
      {profile.topics.length ? (
        <View>
          {profile.topics.slice(0, 8).map((t, i) => {
            const label = topicNames[t.slug] ?? t.slug;
            const value = formatPercent(t.share * 100, 0);
            return Object.hasOwn(pageTopicNames, t.slug) ? (
              <LinkRow
                key={t.slug}
                title={label}
                value={value}
                href={topicRoute(t.slug)}
                accessibilityLabel={`${pageTopicNames[t.slug]}, ${Math.round(t.share * 100)} percent of their speeches, opens topic`}
                testID={`person-topic-${i}`}
              />
            ) : (
              <ValueRow
                key={t.slug}
                label={label}
                value={value}
                testID={`person-topic-${i}`}
              />
            );
          })}
        </View>
      ) : (
        <Text wordSafe variant="secondary">
          No speeches with topics in this period.
        </Text>
      )}
      <ReadDate
        record={data.person}
        citation="OPAX topic labels"
        about={{
          title: 'Topics',
          notes: [
            `Share of ${counted(profile.labelled, 'speech', 'speeches')} with topic labels, ${profile.label}.`,
            data.person.data.coverage,
          ],
        }}
        testID="person-topics-source"
      />
    </View>
  );
}

export function openRecord(row: RecordRow) {
  const path = '/doc/' + encodeURIComponent(row.slug);
  const native = fromWebPath(path);
  if (native) router.push(native);
  else void openOnWeb(path, displayedRecordTitle(row));
}

/** The record lists a profile or party page pushes (people.md 0.1, route 15). */
export type RecordListKind = 'speeches' | 'mentions' | 'news';
export const recordListTitle: Record<RecordListKind, string> = {
  speeches: 'Speeches',
  mentions: 'Mentions in parliament',
  news: 'News',
};

/**
 * More from the record (people.md 2.1, 2.2): Topics inline for a person,
 * then navigating rows that push the full lists. Nothing loads in place.
 */
export function MoreFromRecord({
  subject,
  kinds,
  topics = false,
  testID,
}: {
  subject: { person?: string; party?: string; name: string };
  kinds: readonly RecordListKind[];
  topics?: boolean;
  testID: string;
}) {
  const prefix = subject.party ? 'party' : 'person';
  const filters = subject.party
    ? { party: subject.party }
    : { person: subject.person };
  return (
    <Section
      title="More from the record"
      testID={testID}
      headingTestID={`${testID}-heading`}
    >
      <Group>
        {topics ? <Topics name={subject.name} /> : null}
        <View>
          {kinds.map((kind) => (
            <LinkRow
              key={kind}
              title={recordListTitle[kind]}
              symbol={kind === 'news' ? 'newspaper' : 'quote.bubble'}
              href={
                kind === 'speeches' && subject.person
                  ? personSpeechesRoute(subject.person, subject.name)
                  : recordListRoute({ ...filters, kind }, subject.name)
              }
              testID={`${prefix}-${kind}`}
            />
          ))}
        </View>
      </Group>
    </Section>
  );
}

/**
 * Ministerial diary (NSW and Queensland): drawn only for a member the diary
 * covers, so nothing appears or vanishes for anyone else. A skeleton in
 * place, then content, a collapse or an `InlineError`; content is announced
 * politely.
 */
export function PersonDiary({ identity }: { identity: PersonProfile }) {
  return diaryEligible(identity) ? <Diary identity={identity} /> : null;
}
function Diary({ identity }: { identity: PersonProfile }) {
  const { read, retry } = useRead(
    (signal?: AbortSignal) => peopleDepth.access(signal),
    identity.slug,
  );
  const record = read.status === 'ready' ? read.value : null;
  const m = record ? diaryFor(identity, record.data) : null;
  useEffect(() => {
    if (m)
      AccessibilityInfo.announceForAccessibilityWithOptions(
        'Ministerial diary loaded',
        { queue: true },
      );
  }, [m]);
  if (record && !m) return null;
  return (
    <Section
      title="Ministerial diary"
      testID="person-diary"
      headingTestID="person-diary-heading"
    >
      {read.status === 'error' ? (
        <InlineError
          subject="Ministerial diary"
          onRetry={retry}
          testID="person-diary-error"
        />
      ) : !m || !record ? (
        <Skeleton
          shape="rows"
          count={5}
          label="Loading ministerial diary"
          testID="person-diary-loading"
        />
      ) : (
        <Group>
          <View>
            <ValueRow
              label="Meetings disclosed"
              value={formatCount(m.meetings_total)}
            />
            <ValueRow
              label="With people outside government"
              value={formatCount(m.external_total)}
            />
          </View>
          {m.by_org.length ? (
            <View style={styles.block}>
              <Heading level={3}>Most met</Heading>
              <View>
                {m.by_org.map(([org, n]) => (
                  <ValueRow key={org} label={org} value={formatCount(n)} />
                ))}
              </View>
            </View>
          ) : null}
          {m.recent.length ? (
            <View style={styles.block}>
              <Heading level={3}>Recent meetings</Heading>
              <View>
                {m.recent.map((r, i) => (
                  <View
                    key={`${r.date}-${i}`}
                    accessible
                    style={[styles.meeting, i ? styles.inset : null]}
                    testID={`person-diary-meeting-${i}`}
                  >
                    <Text wordSafe variant="body">
                      {r.org}
                    </Text>
                    <Text wordSafe variant="secondary">
                      {[formatDate(r.date), r.purpose]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          <ReadDate
            record={record}
            citation="NSW Cabinet Office; Queensland Government ministerial diary disclosures"
            originals={
              m.latest_pdf
                ? [{ label: 'Latest diary (PDF)', url: m.latest_pdf }]
                : []
            }
            about={{
              title: 'Ministerial diary',
              notes: [
                m.jurisdiction === 'qld'
                  ? 'From the Queensland Government’s monthly ministerial diary disclosures, published for ' +
                    m.name +
                    '.'
                  : 'From the NSW Cabinet Office’s quarterly ministers’ diary disclosures. NSW diaries are published by office, so meetings are attributed to the minister holding that office on the date.',
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

const styles = StyleSheet.create({
  block: { gap: rhythm.heading },
  meeting: { paddingVertical: rhythm.tight, gap: rhythm.line },
  inset: {
    borderTopWidth: hairline,
    borderTopColor: colors.dividerSubtle,
  },
});
