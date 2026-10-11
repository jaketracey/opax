import { headerItems } from '../../navigation/chrome';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../../api/runtime';
import { passageText, serverPassage } from '../../api/passage-text';
import { chamberName, jurisdictionName } from '../../design/parliament';
import {
  EmptyState,
  ErrorState,
  Group,
  Heading,
  LoadingState,
  MachineLabel,
  Section,
  Disclosure,
  LinkRow,
  PersonRow,
  SourceLine,
  Text,
} from '../../design/primitives';
import { formatDate } from '../../design/format';
import { rhythm } from '../../design/tokens';
import {
  billRoute,
  billTextRoute,
  docRoute,
  personRoute,
} from '../../navigation/routes';
import { sponsorRows, type SponsorRow } from '../bills/sponsors';
import { CachedPortrait } from '../CachedPortrait';
import { DocumentAsk } from '../ask/DocumentAsk';
import { Records } from './data';
import { records } from './runtime';
import {
  isVerbatimText,
  metaString,
  textChunks,
  type DocumentRecord,
} from './model';
import { titleSubject } from './citations';
import { RecordActions, recordMenuItem } from './RecordActions';
import { recordSource } from './source';
import { ReaderList, readerChunkTarget } from './ReaderList';
import { useRead } from './useRead';
import { RecordLoadError } from './RecordLoadError';

// The web's taxonomy; unknown topics must not alter the search request.
const topics = new Set([
  'gambling',
  'financial-services',
  'mining-energy',
  'climate-environment',
  'property-construction',
  'housing',
  'health',
  'media-communications',
  'hospitality-alcohol',
  'defence-security',
  'agriculture',
  'unions-workplace',
  'immigration',
  'indigenous-affairs',
  'tax-budget',
  'education',
  'welfare-social',
  'integrity-democracy',
  'infrastructure-transport',
  'justice-law',
  'foreign-affairs',
]);
const kindNames: Record<string, string> = {
  speech: 'Speech',
  division: 'Division',
  press_release: 'Government release',
  bill_text: 'Bill text',
  grant_invitation: 'Grant invitation',
  grant_award: 'Published grant award',
  research_report: 'Research source note',
  legal: 'Legal record',
};
/** The record's own calendar date (an ISO day), or null. */
function recordDay(doc: DocumentRecord) {
  const iso = metaString(doc, 'date').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}
/**
 * The one line under the title (pass 5, P1-2): what the record is, where and
 * when, "Speech · House of Representatives · 18 Aug 2026". No kicker above
 * the title, and no separate date line. A title that is itself the kind and
 * date ("Speech · 9 February 1999") leaves them off the line.
 */
export function metaLine(doc: DocumentRecord) {
  const titled = !!titleSubject(doc);
  const day = recordDay(doc);
  const place = jurisdictionName(doc.labels.state);
  return [
    titled ? (kindNames[doc.labels.kind ?? ''] ?? 'Source record') : null,
    chamberName(doc.labels.chamber),
    place && place !== 'Federal' ? place : null,
    titled && day ? formatDate(day, 'short') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
/**
 * The subject when the title has one; a title that is only the speaker and
 * the date ("Peter Costello — 1999-02-09") reads "Speech · 9 February 1999",
 * since the speaker row sits directly below.
 */
function heading(doc: DocumentRecord) {
  const subject = titleSubject(doc);
  if (subject) return subject;
  const iso = metaString(doc, 'date').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? `${kindNames[doc.labels.kind ?? ''] ?? 'Source record'} · ${formatDate(iso)}`
    : doc.title;
}
const titleKey = (value: string) =>
  value.replace(/\s+/g, ' ').trim().toLowerCase();
export default function DocumentReader({
  recordSlug,
  embedded = false,
}: { recordSlug?: string; embedded?: boolean } = {}) {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = recordSlug ?? params.slug ?? '';
  const load = useCallback(() => records.document(slug), [slug]);
  const { value, error, retry } = useRead(load);
  const doc = value?.data;
  const parts = useMemo(
    () =>
      textChunks(
        (doc && isVerbatimText(doc) ? passageText : serverPassage)(doc?.text, {
          paragraphs: true,
        }),
        readerChunkTarget,
      ).map((text, index) => ({
        id: String(index),
        text,
      })),
    [doc],
  );
  return (
    <>
      {embedded ? null : (
        <Stack.Screen
          options={{
            title: 'Record',
            headerTitle: '',
            // Cite, Copy link and Share under one ⋯ (P1-2).
            ...headerItems(
              doc
                ? () => [recordMenuItem({ slug: doc.slug, title: doc.title })]
                : undefined,
            ),
          }}
        />
      )}
      <ReaderList
        testID="doc-reader"
        parts={parts}
        header={
          <>
            {error ? (
              <RecordLoadError
                error={error}
                slug={slug}
                onRetry={retry}
                testID="doc-error"
              />
            ) : !doc ? (
              <LoadingState label="Loading the record" />
            ) : (
              <>
                <Group gap={rhythm.tight}>
                  <Heading level={1} testID="doc-title">
                    {heading(doc)}
                  </Heading>
                  <View style={styles.meta}>
                    <Text
                      variant="metadata"
                      wordSafe
                      style={styles.grow}
                      testID="doc-meta"
                    >
                      {metaLine(doc) || 'Jurisdiction not recorded'}
                    </Text>
                    {/* A pane has no navigation bar: its ⋯ sits here. */}
                    {embedded ? (
                      <RecordActions slug={doc.slug} title={doc.title} />
                    ) : null}
                  </View>
                  <Speaker key={`speaker-${doc.slug}`} doc={doc} />
                  <RecordSourceLine doc={doc} />
                </Group>
                <DocumentAsk doc={doc} />
                {doc.summary ? (
                  <Section title="In brief" accent="bills" testID="doc-brief">
                    <MachineLabel
                      explanation={
                        doc.labels.kind === 'bill_text'
                          ? 'Written from this document by a model, not part of the original bill text.'
                          : doc.labels.kind === 'speech'
                            ? 'Written from this speech by a model, not by a person, and not part of the record.'
                            : 'Written by a model; not part of the record.'
                      }
                      testID="doc-brief-label"
                    />
                    <Text selectable>{doc.summary}</Text>
                  </Section>
                ) : null}
                <LinkedBill key={`bill-${doc.slug}`} doc={doc} />
                {doc.labels.kind === 'speech' ? (
                  <Similar key={`similar-${doc.slug}`} doc={doc} />
                ) : null}
                {/* The text's notes are in the record's source sheet. */}
                <Section
                  title="Full text"
                  accent={doc.labels.kind === 'division' ? 'votes' : 'bills'}
                >
                  {doc.labels.kind === 'bill_text' &&
                  doc.metadata.complete === false ? (
                    <Text variant="fine">Incomplete extracted bill text</Text>
                  ) : null}
                </Section>
                {!doc.text ? (
                  <EmptyState message="No text is held for this record." />
                ) : null}
              </>
            )}
          </>
        }
      />
    </>
  );
}

/**
 * Who spoke, as a person row (portrait, party as a dot and its name, place),
 * joined to the roster the way a bill's sponsors are. A speaker the roster
 * cannot name stays plain text, never a link.
 */
function Speaker({ doc }: { doc: DocumentRecord }) {
  const [row, setRow] = useState<SponsorRow | null>(null);
  useEffect(() => {
    if (!doc.speaker || doc.labels.speaker_type === 'witness') return;
    let active = true;
    void catalogs
      .directory()
      .then((found) => {
        const [match] = sponsorRows(
          [{ name: doc.speaker!, suffix: '' }],
          doc.labels.party ?? null,
          null,
          {
            roster: found.roster.data,
            slugs: found.slugs.data,
            people: found.people.data,
            manifest: found.manifest.data,
            electorates: found.electorates.data,
          },
        );
        if (active && match?.slug) setRow(match);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [doc]);
  if (!doc.speaker) return null;
  const slug = row?.slug;
  return row && slug ? (
    <PersonRow
      name={row.name}
      portrait={<CachedPortrait name={row.name} slug={slug} />}
      {...(row.party
        ? {
            party: row.party.party,
            partyStatus: row.party.status,
            formerly: row.party.formerly,
          }
        : { party: undefined })}
      place={row.place}
      statusShown={!!row.place?.startsWith('Formerly ')}
      dragPath={`/subject/person/${slug}`}
      onPress={() => router.push(personRoute(slug))}
      testID="doc-more"
    />
  ) : (
    <Text variant="strong" wordSafe testID="doc-speaker-name">
      {doc.speaker}
    </Text>
  );
}
/**
 * The record's one source line (P1-2): the original opens from its sheet
 * (no separate "View original"), with the text's notes and the licence.
 * The meta line above dates the record, so the line names only its source.
 */
function RecordSourceLine({ doc }: { doc: DocumentRecord }) {
  const source = recordSource(doc);
  return (
    <SourceLine
      title="About this record"
      dateLabel={null}
      asOf={recordDay(doc)}
      citation={[source.citation]}
      originals={
        doc.url
          ? [{ label: source.original, url: doc.url, record: doc.title }]
          : []
      }
      notes={[
        ...source.notes,
        doc.url
          ? null
          : 'No official link is published for this record; it is cited by its title and date.',
      ]}
      licence={source.licence}
      licenceDataset={source.licenceDataset}
      testID="doc-source"
    />
  );
}
function LinkedBill({ doc }: { doc: DocumentRecord }) {
  const [bill, setBill] = useState<{
    key: string;
    title: string;
    summary: string | null;
    attribution: string | null;
    asAt: string | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    if (doc.labels.kind === 'bill_text') return;
    const subject =
      metaString(doc, 'bill_ref') ||
      metaString(doc, 'topic') ||
      metaString(doc, 'debate') ||
      titleSubject(doc);
    if (!subject) return;
    void catalogs
      .bills()
      .then(async (result) => {
        const matches = result.data.bills.filter((entry) =>
          [entry.title, ...(entry.aliases ?? [])].some(
            (title) => titleKey(title) === titleKey(subject),
          ),
        );
        if (matches.length !== 1) return;
        const entry = matches[0]!;
        const detail = await catalogs.billFor(entry.key);
        const summary = detail.data.summary.data;
        if (active)
          setBill({
            key: entry.key,
            title: entry.title,
            summary: summary?.sentences[0] ?? null,
            attribution: summary?.attribution ?? null,
            asAt: detail.data.identity.asAt,
          });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [doc]);
  const key = metaString(doc, 'bill_key');
  if (doc.labels.kind === 'bill_text' && /^au-federal-[a-z0-9-]+$/.test(key))
    return (
      <Section title="The bill" accent="bills" testID="doc-bill">
        <LinkRow
          title="Bill page"
          dragPath={`/bill/${key}`}
          onPress={() => router.push(billRoute(key))}
          testID="doc-bill-open"
        />
        <LinkRow
          title="Text versions"
          onPress={() =>
            router.push(
              billTextRoute(key, metaString(doc, 'version_id') || undefined),
            )
          }
        />
      </Section>
    );
  if (!bill) return null;
  return (
    <Section title="The bill" accent="bills" testID="doc-bill">
      <Text variant="strong" wordSafe>
        {bill.title}
      </Text>
      {bill.summary ? (
        <>
          <MachineLabel
            explanation={
              bill.attribution ?? 'Written by a model; not the record.'
            }
            testID="doc-bill-label"
          />
          <Text>{bill.summary}</Text>
        </>
      ) : (
        <Text variant="fine">No summary written for this bill yet.</Text>
      )}
      <LinkRow
        title="Bill page"
        dragPath={`/bill/${bill.key}`}
        onPress={() => router.push(billRoute(bill.key))}
        testID="doc-bill-open"
      />
      <SourceLine
        asOf={bill.asAt}
        citation="ParlInfo bill register"
        testID="doc-bill-source"
      />
    </Section>
  );
}
function Similar({ doc }: { doc: DocumentRecord }) {
  const [value, setValue] = useState<Awaited<
    ReturnType<Records['similar']>
  > | null>(null);
  const [error, setError] = useState<unknown>(null),
    [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const loadSimilar = () => {
    setOpen(true);
    if (value || loading) return;
    setError(null);
    setLoading(true);
    void records
      .similar(doc, topics)
      .then(setValue)
      .catch(setError)
      .finally(() => setLoading(false));
  };
  return (
    <Section>
      <Disclosure
        label="Similar speeches"
        open={open}
        onToggle={(next) => (next ? loadSimilar() : setOpen(false))}
        testID="doc-similar"
      >
        <>
          {loading ? <LoadingState label="Finding related speeches…" /> : null}
          {error ? (
            <ErrorState
              message="Related speeches could not be loaded."
              onRetry={loadSimilar}
            />
          ) : null}
          {value ? (
            value.data.length ? (
              value.data.map((row, index) => (
                <Group key={row.slug} gap={rhythm.tight}>
                  <LinkRow
                    title={titleSubject(row) || row.title}
                    detail={[
                      row.speaker,
                      row.date ? formatDate(row.date, 'short') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    onPress={() => router.push(docRoute(row.slug))}
                    testID={`doc-similar-${index}`}
                    dragPath={`/doc/${row.slug}`}
                  />
                  <Text variant="record" selectable>
                    {serverPassage(row.snippet) || 'No passage available.'}
                  </Text>
                </Group>
              ))
            ) : (
              <EmptyState message="No related speeches found for this subject." />
            )
          ) : null}
          {value?.data.length ? (
            <SourceLine
              title="About similar speeches"
              dateLabel={null}
              citation="Hansard"
              notes={[
                'Speeches on the same subject, found by OPAX search. Each passage is from the record; open a speech for its full text and source.',
              ]}
              testID="doc-similar-source"
            />
          ) : null}
        </>
      </Disclosure>
    </Section>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  grow: { flex: 1 },
});
