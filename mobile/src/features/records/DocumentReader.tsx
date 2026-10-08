import { headerItems } from '../../navigation/chrome';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../../api/runtime';
import type { PersonSlug } from '../../api/catalogs';
import { chamberName, jurisdictionName } from '../../design/parliament';
import {
  AsAtLine,
  Button,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  LoadingState,
  Section,
  Disclosure,
  LinkRow,
  ViewOriginal,
  Text,
  errorMessage,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { canonicalUrl } from '../../navigation/external';
import {
  billRoute,
  billTextRoute,
  citeRoute,
  docRoute,
  personRoute,
} from '../../navigation/routes';
import { shareHeaderItem } from '../../navigation/share';
import { sponsorSlug } from '../bills/sponsors';
import { DocumentAsk } from '../ask/DocumentAsk';
import { Records } from './data';
import { records } from './runtime';
import { metaString, textChunks, type DocumentRecord } from './model';
import { titleSubject } from './citations';
import { copyText } from './actions';
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
  const [copied, setCopied] = useState(false);
  const parts = useMemo(
    () =>
      textChunks(doc?.text ?? '', readerChunkTarget).map((text, index) => ({
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
            ...headerItems(
              doc
                ? () => [
                    shareHeaderItem({
                      path: `/doc/${doc.slug}`,
                      title: doc.title,
                    }),
                  ]
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
                  <Text
                    variant="kicker"
                    tone={
                      doc.labels.kind === 'bill_text'
                        ? 'billsInk'
                        : doc.labels.kind === 'division'
                          ? 'votesInk'
                          : 'navy'
                    }
                  >
                    {kindNames[doc.labels.kind ?? ''] ?? 'Source record'}
                  </Text>
                  <Heading level={1} testID="doc-title">
                    {titleSubject(doc) || doc.title}
                  </Heading>
                  <Speaker key={`speaker-${doc.slug}`} doc={doc} />
                  <Text variant="metadata" wordSafe>
                    {[
                      chamberName(doc.labels.chamber),
                      jurisdictionName(doc.labels.state),
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Jurisdiction not recorded'}
                  </Text>
                  <AsAtLine
                    asOf={metaString(doc, 'date') || null}
                    citation={
                      doc.url ? new URL(doc.url).hostname : 'OPAX public record'
                    }
                    testID="doc-as-at"
                  />
                  {doc.url ? (
                    <ViewOriginal
                      sources={[{ label: 'Original record', url: doc.url }]}
                      testID="doc-source"
                    />
                  ) : null}
                </Group>
                <Group
                  gap={rhythm.tight}
                  style={{ flexDirection: 'row', flexWrap: 'wrap' }}
                >
                  <Button
                    variant="quiet"
                    size="compact"
                    icon="quote.opening"
                    label="Cite"
                    onPress={() => router.push(citeRoute(doc.slug))}
                    testID="doc-cite"
                  />
                  <Button
                    variant="quiet"
                    size="compact"
                    icon="link"
                    label={copied ? 'Link copied' : 'Copy link'}
                    onPress={() => {
                      void copyText(canonicalUrl(`/doc/${doc.slug}`)).then(
                        setCopied,
                      );
                    }}
                    testID="doc-copy-link"
                  />
                </Group>
                <DocumentAsk doc={doc} />
                {doc.summary ? (
                  <Section
                    title="In brief"
                    icon="text.alignleft"
                    accent="bills"
                    testID="doc-brief"
                    info={{
                      title: 'About this summary',
                      notes: [
                        doc.labels.kind === 'bill_text'
                          ? 'Written from this document by a model, not part of the original bill text.'
                          : doc.labels.kind === 'speech'
                            ? 'Written from this speech by a model, not by a person, and not part of the record.'
                            : 'Machine summary · not part of the record',
                      ],
                      testID: 'doc-brief-info',
                    }}
                  >
                    <Text variant="caption" testID="doc-brief-label">
                      Machine summary · not part of the record
                    </Text>
                    <Text selectable>{doc.summary}</Text>
                    <AsAtLine
                      asOf={metaString(doc, 'date') || null}
                      citation="This source record"
                    />
                  </Section>
                ) : null}
                <LinkedBill key={`bill-${doc.slug}`} doc={doc} />
                {doc.labels.kind === 'speech' ? (
                  <Similar key={`similar-${doc.slug}`} doc={doc} />
                ) : null}
                <Section
                  title="Full text"
                  icon="doc.text"
                  accent={doc.labels.kind === 'division' ? 'votes' : 'bills'}
                  info={{
                    title: 'About this text',
                    notes: [
                      doc.labels.source === 'openaustralia' &&
                        'This text is reproduced from a third-party Hansard transcription and may contain concatenation artefacts (“toSenator”); verify wording against the official record before quoting.',
                      doc.labels.kind === 'bill_text' &&
                        (doc.metadata.complete === false
                          ? 'Incomplete extracted bill text. Use the original document for the complete bill.'
                          : 'Published bill text. Check the original document for authoritative wording and formatting.'),
                    ],
                    testID: 'doc-text-info',
                  }}
                >
                  {doc.labels.kind === 'bill_text' &&
                  doc.metadata.complete === false ? (
                    <Text variant="caption">
                      Incomplete extracted bill text
                    </Text>
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

function Speaker({ doc }: { doc: DocumentRecord }) {
  const [slug, setSlug] = useState<PersonSlug | null>(null);
  useEffect(() => {
    if (!doc.speaker || doc.labels.speaker_type === 'witness') return;
    let active = true;
    void Promise.all([catalogs.roster(), catalogs.slugs()])
      .then(([roster, slugs]) => {
        if (active) setSlug(sponsorSlug(doc.speaker!, roster.data, slugs.data));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [doc]);
  if (!doc.speaker) return null;
  return slug ? (
    <LinkRow
      title={doc.speaker}
      detail="More by this speaker"
      icon="person"
      accent="people"
      onPress={() => router.push(personRoute(slug))}
      testID="doc-more"
      titleTestID="doc-speaker"
    />
  ) : (
    <Text variant="strong" wordSafe>
      {doc.speaker}
    </Text>
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
      <Section
        title="The bill"
        icon="doc.text"
        accent="bills"
        testID="doc-bill"
      >
        <LinkRow
          title="Bill page"
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
    <Section title="The bill" icon="doc.text" accent="bills" testID="doc-bill">
      <Text variant="strong" wordSafe>
        {bill.title}
      </Text>
      {bill.summary ? (
        <>
          <Text variant="fine">{bill.attribution}.</Text>
          <Text>{bill.summary}</Text>
        </>
      ) : (
        <Text variant="fine">No summary written for this bill yet.</Text>
      )}
      <LinkRow
        title="Bill page"
        onPress={() => router.push(billRoute(bill.key))}
        testID="doc-bill-open"
      />
      <AsAtLine asOf={bill.asAt} citation="ParlInfo bill register" />
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
        icon="text.bubble"
        accent="bills"
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
                <Group key={row.slug}>
                  <LinkRow
                    title={titleSubject(row) || row.title}
                    onPress={() => router.push(docRoute(row.slug))}
                    testID={`doc-similar-${index}`}
                  />
                  <Text variant="metadata">{row.speaker}</Text>
                  <Text selectable>
                    {row.snippet || 'No passage available.'}
                  </Text>
                  <Text variant="fine">Passage from the record</Text>
                  <AsAtLine asOf={row.date} citation="Related source record" />
                </Group>
              ))
            ) : (
              <EmptyState message="No related speeches found for this subject." />
            )
          ) : null}
        </>
      </Disclosure>
    </Section>
  );
}
