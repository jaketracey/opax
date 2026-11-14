import { LoadingStatus } from '../../design/states';
import { isAbortError } from '../../api/abort';
import { RouteOptions } from '../../navigation/preview';
import type { NativeStackHeaderItem } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native';
import type { BillIndex } from '../../api/catalog-decoders';
import {
  hasMarkdownHeadings,
  markdownParts,
  passageText,
  serverPassage,
} from '../../api/passage-text';
import { catalogs } from '../../api/runtime';
import { formatDate } from '../../design/format';
import { haptic } from '../../design/haptics';
import { billStatus } from '../../design/parliament';
import {
  BillRow,
  Button,
  Disclosure,
  Heading,
  InlineError,
  LinkRow,
  MachinePill,
  PageFoot,
  PersonRow,
  RecordRow,
  SectionHeader,
  Skeleton,
  SourceLine,
  Text,
  VoteSplit,
} from '../../design/primitives';
import { symbols } from '../../design/symbols';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { headerItems, shareItem } from '../../navigation/chrome';
import {
  billRoute,
  citeRoute,
  docRoute,
  moneyRecordRoute,
  personRoute,
} from '../../navigation/routes';
import { canShare, shareRecord } from '../../navigation/share';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { documentQuestion } from '../ask/DocumentAsk';
import { useOpenAsk } from '../ask/open';
import { sponsorRows, type SponsorRow } from '../bills/sponsors';
import { CachedPortrait } from '../CachedPortrait';
import { isOrganisation } from '../money-public/privacy';
import { useIsMyMember } from '../your-mp/useIsMyMember';
import { titleSubject } from './citations';
import type { Records } from './data';
import {
  isVerbatimText,
  metaLine,
  metaString,
  recordDate,
  recordHeadline,
  recordKind,
  textChunks,
  type DocumentRecord,
} from './model';
import { useSpeechSpeakers } from './speaker';
import { useRecordNavigation } from './navigation';
import {
  ReaderList,
  findMatches,
  readerChunkTarget,
  type ReaderPart,
} from './ReaderList';
import { recordBarItems } from './RecordActions';
import { RecordLoadError } from './RecordLoadError';
import { FindControls } from './FindControls';
import { records } from './runtime';
import { recordCaveat, recordOriginal, recordSource } from './source';
import { useRead } from './useRead';

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
/** The In short pill's note, in plain words (records.md 2.2). */
const machineNote = (doc: DocumentRecord) =>
  doc.labels.kind === 'bill_text'
    ? 'Written by a model from this bill text. It is not part of the bill.'
    : doc.labels.kind === 'speech'
      ? 'Written by a model from this speech. It is not part of the record.'
      : 'Written by a model. It is not part of the record.';

function askLabel(doc: DocumentRecord, headline: string) {
  const subjects: Record<string, string> = {
    speech: 'this speech',
    division: 'this division',
    bill_text: 'this bill text',
    press_release: 'this release',
    government_release: 'this release',
    research_report: 'this report',
    grant_invitation: 'this grant invitation',
    grant_award: 'this grant award',
    contract: 'this contract',
    legal: 'this legal record',
  };
  return `Ask about ${subjects[recordKind(doc)] ?? 'this record'}: ${headline}`;
}
/** First paint waits this long for the speaker's roster match (records.md 2.3). */
const SPEAKER_WINDOW = 400;
const titleKey = (value: string) =>
  value.replace(/\s+/g, ' ').trim().toLowerCase();
/** A query from Search, capped at 100 characters on a whole word. */
function findQuery(value: unknown): string {
  const text =
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text.length > 100 ? text.slice(0, 100).replace(/\s+\S*$/, '') : text;
}

type Directory = Awaited<ReturnType<typeof catalogs.directory>>;
/**
 * The roster read starts on mount, beside the record. First paint waits for
 * both, or 400 ms after the record, whichever is sooner; a match that comes
 * later is ignored for this visit, so nothing above the text moves.
 */
function useSpeaker(doc: DocumentRecord | null) {
  const [directory, setDirectory] = useState<Directory | 'failed' | null>(null);
  const arrived = useRef(false);
  const [late, setLate] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void catalogs
      .directory(undefined, controller.signal)
      .then((found) => {
        arrived.current = true;
        if (active) setDirectory(found);
      })
      .catch(() => {
        arrived.current = true;
        if (active) setDirectory('failed');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);
  const wanted = !!doc?.speaker && doc.labels.speaker_type !== 'witness';
  const slug = doc?.slug ?? null;
  useEffect(() => {
    if (!slug || !wanted || directory) return;
    const timer = setTimeout(() => {
      if (!arrived.current) setLate(slug);
    }, SPEAKER_WINDOW);
    return () => clearTimeout(timer);
  }, [slug, wanted, directory]);
  const ready = !!doc && (!wanted || !!directory || late === doc.slug);
  const row = useMemo((): SponsorRow | null => {
    if (!doc?.speaker || !wanted || !directory || directory === 'failed')
      return null;
    if (late === doc.slug) return null;
    const [match] = sponsorRows(
      [{ name: doc.speaker, suffix: '' }],
      doc.labels.party ?? null,
      null,
      {
        roster: directory.roster.data,
        slugs: directory.slugs.data,
        people: directory.people.data,
        manifest: directory.manifest.data,
        electorates: directory.electorates.data,
      },
    );
    return match?.slug ? match : null;
  }, [doc, wanted, directory, late]);
  return { ready, row };
}

/** The reader's find bar state: the query from Search and its current match. */
function useFind(
  parts: ReaderPart[],
  query: string,
  first: number,
  passage = false,
  automatic = false,
) {
  const matches = useMemo(
    () => findMatches(parts, query, { tolerant: automatic }),
    [parts, query, automatic],
  );
  const [open, setOpen] = useState(!passage && !!query);
  const [index, setIndex] = useState(first);
  const [engaged, setEngaged] = useState(false);
  const [jump, setJump] = useState<{
    index: number;
    attempt: number;
    position: number;
  } | null>(null);
  const total = matches.length;
  const current = total ? Math.min(Math.max(index, 0), total - 1) : 0;
  const reveal = (at: number) => {
    const match = matches[at];
    if (!match) return;
    if (Platform.OS === 'ios')
      AccessibilityInfo.announceForAccessibility(`Match ${at + 1} of ${total}`);
    setJump((old) => ({
      index: match.part,
      attempt: (old?.attempt ?? 0) + 1,
      position: 0.33,
    }));
  };
  const firstPart = matches[0]?.part;
  const citationJump = useMemo(
    () =>
      passage && firstPart !== undefined
        ? { index: firstPart, attempt: 1, position: 0.33 }
        : null,
    [passage, firstPart],
  );
  const step = (by: number) => {
    if (!total) return;
    if (!engaged) {
      setEngaged(true);
      reveal(current);
      return;
    }
    const next = (current + by + total) % total;
    haptic('selection');
    setIndex(next);
    reveal(next);
  };
  return {
    open: open && !!query && (!automatic || total > 0),
    query,
    total,
    current,
    jump: jump ?? citationJump,
    marks:
      (open || passage) && query
        ? {
            query,
            current: matches[current] ?? null,
            passage,
            tolerant: automatic,
          }
        : null,
    goTo: () => {
      setEngaged(true);
      reveal(current);
    },
    next: () => step(1),
    previous: () => step(-1),
    done: () => setOpen(false),
  };
}

export default function DocumentReader({
  recordSlug,
  embedded = false,
  citedPassage,
}: { recordSlug?: string; embedded?: boolean; citedPassage?: string } = {}) {
  const params = useLocalSearchParams<{
    slug: string;
    cite?: string;
    q?: string;
    match?: string;
    passage?: string;
    find?: string;
  }>();
  const slug = recordSlug ?? params.slug ?? '';
  const load = useCallback(
    (signal?: AbortSignal) => records.document(slug, signal),
    [slug],
  );
  const { value, error, retry } = useRead(load);
  const doc = value?.data ?? null;
  const speaker = useSpeaker(doc);
  const shown = speaker.ready ? doc : null;
  const headline = doc ? recordHeadline(doc) : '';
  const titleRef = useRef<View>(null);
  const ios = Platform.OS === 'ios';
  const title = useTitleOnScroll(
    embedded ? null : titleRef,
    embedded || !shown ? undefined : headline,
    { trailing: ios && canShare ? 2 : 1 },
  );
  const openAsk = useOpenAsk();
  const parts = useMemo(() => {
    // Divisions and other Markdown texts: headings become part titles.
    if (
      doc &&
      !isVerbatimText(doc) &&
      (recordKind(doc) === 'division' || hasMarkdownHeadings(doc.text))
    )
      return markdownParts(doc.text).flatMap((section, at) =>
        textChunks(section.text, readerChunkTarget).map((text, index) => ({
          id: `${at}-${index}`,
          text,
          ...(index === 0 && section.title ? { title: section.title } : {}),
        })),
      );
    return textChunks(
      (doc && isVerbatimText(doc) ? passageText : serverPassage)(doc?.text, {
        paragraphs: true,
      }),
      readerChunkTarget,
    ).map((text, index) => ({
      id: String(index),
      text,
    }));
  }, [doc]);
  const passage = citedPassage ?? params.passage;
  const find = useFind(
    shown ? parts : [],
    passage
      ? passage.slice(0, 4000)
      : embedded || recordSlug
        ? ''
        : findQuery(params.q),
    Math.max(0, Number(params.match) || 0),
    !!passage,
    !passage && params.find === 'auto',
  );
  // opax://doc-cite/<slug> arrives as /doc/<slug>?cite=1: the record first,
  // then Citation formats over it, so Done lands on the record.
  const cited = useRef(false);
  useEffect(() => {
    if (embedded || !shown || params.cite !== '1' || cited.current) return;
    cited.current = true;
    router.setParams({ cite: undefined });
    router.push(citeRoute(shown.slug));
  }, [embedded, shown, params.cite]);
  const target = doc
    ? { slug: doc.slug, title: headline, kind: doc.labels.kind }
    : null;
  const ask = () => {
    if (doc) openAsk({ question: documentQuestion(doc) }, headline);
  };
  const share = () => {
    if (doc) void shareRecord({ path: `/doc/${doc.slug}`, title: headline });
  };
  const android = Platform.OS === 'android';
  // iOS draws no bottom toolbar: iOS 26's floating tab bar stays up on
  // pushes and covered it. Ask about this follows the summary, Share
  // sits beside ⋯, and the find bar's controls take the bar while open.
  const askRow = embedded || android || ios;
  const findBar = ios && !embedded && !!shown && find.open;
  return (
    <>
      {embedded ? null : (
        <RouteOptions
          stableItems
          options={{
            title: shown ? headline : '',
            ...headerItems(
              findBar
                ? () => findItems(find)
                : shown && target && ios
                  ? () => [
                      ...(canShare
                        ? [shareItem({ name: 'this record', onPress: share })]
                        : []),
                      ...recordBarItems(target)(),
                    ]
                  : shown && target
                    ? recordBarItems(
                        target,
                        android
                          ? [
                              {
                                title: 'Ask about this',
                                symbol: symbols.ask,
                                onPress: ask,
                              },
                              ...(canShare
                                ? [
                                    {
                                      title: 'Share',
                                      symbol: 'square.and.arrow.up' as const,
                                      onPress: share,
                                    },
                                  ]
                                : []),
                            ]
                          : [],
                      )
                    : undefined,
            ),
          }}
        />
      )}
      {android && !embedded && shown && find.open ? (
        <FindControls
          query={find.query}
          current={find.current}
          total={find.total}
          onPrevious={find.previous}
          onNext={find.next}
          onDone={find.done}
        />
      ) : null}
      <ReaderList
        testID="doc-reader"
        parts={shown ? parts : []}
        jumpTo={find.jump}
        find={find.marks}
        onScroll={embedded ? undefined : title.onScroll}
        header={
          error ? (
            <RecordLoadError
              error={error}
              slug={slug}
              onRetry={retry}
              testID="doc-error"
            />
          ) : !shown ? (
            <ReaderSkeleton />
          ) : (
            <>
              {ios && !embedded && find.open ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={findLabel(find)}
                  accessibilityHint={find.total ? 'Go to match' : undefined}
                  disabled={!find.total}
                  onPress={find.goTo}
                  testID="doc-find-status"
                  style={styles.findStatus}
                >
                  <Text variant="secondary" tabular wordSafe>
                    {find.total
                      ? `${find.query} · ${find.current + 1} of ${find.total}`
                      : `No matches for ${find.query}`}
                  </Text>
                </Pressable>
              ) : null}
              <ReaderHeader
                doc={shown}
                headline={headline}
                speaker={speaker.row}
                titleRef={titleRef}
                onTitleLayout={embedded ? undefined : title.onTitleLayout}
                askRow={askRow ? ask : null}
                hasText={parts.length > 0}
              />
            </>
          )
        }
        footer={
          shown ? (
            <View>
              <LinkedBill key={`bill-${shown.slug}`} doc={shown} />
              {shown.labels.kind === 'speech' ? (
                <Similar key={`similar-${shown.slug}`} doc={shown} />
              ) : null}
              <View style={styles.endSource}>
                <RecordSourceLine doc={shown} testID="doc-source" />
              </View>
              <View style={styles.after}>
                <PageFoot variant="today" />
              </View>
            </View>
          ) : null
        }
      />
    </>
  );
}

type Find = ReturnType<typeof useFind>;
const findLabel = (find: Find) =>
  find.total
    ? `Match ${find.current + 1} of ${find.total} for ${find.query}`
    : `No matches for ${find.query}`;
/** The find bar's controls, in the navigation bar while it is open. */
function findItems(find: Find): NativeStackHeaderItem[] {
  return [
    {
      type: 'button',
      label: 'Previous match',
      accessibilityLabel: 'Previous match',
      icon: { type: 'sfSymbol', name: 'chevron.up' },
      disabled: !find.total,
      onPress: find.previous,
    },
    {
      type: 'button',
      label: 'Next match',
      accessibilityLabel: 'Next match',
      icon: { type: 'sfSymbol', name: 'chevron.down' },
      disabled: !find.total,
      onPress: find.next,
    },
    {
      type: 'button',
      label: 'Done',
      accessibilityLabel: 'Done',
      variant: 'plain',
      tintColor: colors.navy,
      onPress: find.done,
    },
  ];
}

/** Bars in the header's final shape, then lines of text (records.md 2.5). */
function ReaderSkeleton() {
  return (
    <LoadingStatus
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading the record"
      accessibilityState={{ busy: true }}
      testID="doc-loading"
      style={styles.skeleton}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.skeleton}
      >
        <Bar width="40%" height={18} />
        <View style={styles.skeletonGroup}>
          <Bar width="100%" height={30} />
          <Bar width="70%" height={30} />
        </View>
        <View style={styles.skeletonSpeaker}>
          <View style={styles.circle} />
          <View style={styles.skeletonGroup}>
            <Bar width="60%" height={18} />
            <Bar width="40%" height={16} />
          </View>
        </View>
        <Bar width="40%" height={16} />
        <View style={styles.skeletonGroup}>
          {Array.from({ length: 8 }, (_, index) => (
            <Bar key={index} width={index === 7 ? '60%' : '100%'} height={20} />
          ))}
        </View>
      </View>
    </LoadingStatus>
  );
}
function Bar({ width, height }: { width: `${number}%`; height: number }) {
  return <View style={[styles.bar, { width, height }]} />;
}

/** Metadata can be partial: blank strings and booleans are not zero votes. */
function divisionCount(raw: unknown): number | null {
  if (
    typeof raw !== 'number' &&
    (typeof raw !== 'string' || !/^\d+$/.test(raw.trim()))
  )
    return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function ReaderHeader({
  doc,
  headline,
  speaker,
  titleRef,
  onTitleLayout,
  askRow,
  hasText,
}: {
  doc: DocumentRecord;
  headline: string;
  speaker: SponsorRow | null;
  titleRef: React.RefObject<View | null>;
  onTitleLayout?: ViewProps['onLayout'];
  askRow: (() => void) | null;
  hasText: boolean;
}) {
  const meta = metaLine(doc, { date: false });
  const caveat = recordCaveat(doc);
  const organisation = organisationOf(doc);
  const ayes = divisionCount(doc.metadata.ayes_count);
  const noes = divisionCount(doc.metadata.noes_count);
  const day = recordDate(doc);
  const votes =
    doc.labels.kind === 'division' &&
    ayes !== null &&
    noes !== null &&
    // The split's spoken label names its date; an undated division has none.
    !!day;
  return (
    <View>
      {meta ? (
        <Text
          wordSafe
          variant="secondary"
          testID="doc-meta"
          style={styles.meta}
        >
          {meta}
        </Text>
      ) : null}
      <View ref={titleRef} onLayout={onTitleLayout}>
        <Heading level={1} testID="doc-title">
          {headline}
        </Heading>
      </View>
      <Speaker doc={doc} row={speaker} />
      {caveat ? (
        <Text
          variant="footnote"
          tone="inkSoft"
          testID="doc-caveat"
          style={styles.caveat}
        >
          {caveat}
        </Text>
      ) : null}
      {organisation ? (
        <View style={styles.rows}>
          <OrganisationRow {...organisation} />
        </View>
      ) : null}
      {votes ? (
        <View style={styles.block} testID="doc-votes">
          <VoteSplit
            ayes={ayes}
            noes={noes}
            countsStyle="ayesNoes"
            {...{
              dateRange: { start: day!, end: day! },
              citation: recordSource(doc).citation.label,
            }}
          />
        </View>
      ) : null}
      {doc.summary ? (
        <View style={styles.block}>
          <SectionHeader
            title="In short"
            testID="doc-brief"
            accessory={
              <MachinePill
                note={{ title: 'Machine-written', body: [machineNote(doc)] }}
                testID="doc-brief-label"
              />
            }
          />
          <View style={styles.brief} testID="doc-brief-body">
            <Text selectable variant="body">
              {doc.summary}
            </Text>
          </View>
        </View>
      ) : null}
      {askRow ? (
        <View style={styles.block}>
          <Button
            label="Ask about this"
            variant="primary"
            symbol={symbols.ask}
            accessibilityLabel={askLabel(doc, headline)}
            accessibilityHint="Opens Ask with a question drafted"
            onPress={askRow}
            testID="doc-ask"
          />
        </View>
      ) : null}
      {doc.labels.kind === 'bill_text' && doc.metadata.complete === false ? (
        <Text variant="footnote" testID="doc-incomplete" style={styles.block}>
          This text is incomplete. The original document has the full bill.
        </Text>
      ) : null}
      {!hasText ? (
        <Text variant="body" tone="inkSoft" style={styles.block}>
          The text of this record isn&apos;t held in OPAX. The original is
          linked from its source line.
        </Text>
      ) : null}
      <View style={styles.beforeText} />
    </View>
  );
}

/**
 * Who spoke, as a person row (portrait, party, place, and "Your MP" for the
 * reader's own member), joined to the roster as a bill's sponsors are. A
 * speaker the roster can't name stays plain text, never a link.
 */
function Speaker({
  doc,
  row,
}: {
  doc: DocumentRecord;
  row: SponsorRow | null;
}) {
  const navigation = useRecordNavigation();
  const slug = row?.slug ?? '';
  const yourMP = useIsMyMember(slug);
  if (!doc.speaker) return null;
  return (
    <View style={styles.speaker}>
      {row && slug ? (
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
          yourMP={yourMP}
          dragPath={`/subject/person/${slug}`}
          {...(navigation.inPane
            ? { onPress: () => navigation.openPerson(slug, row.name) }
            : { href: personRoute(slug) })}
          testID="doc-more"
        />
      ) : (
        <Text variant="name" wordSafe testID="doc-speaker-name">
          {doc.speaker}
        </Text>
      )}
    </View>
  );
}

/**
 * The record's source line (records.md 2.6): its own date, "18 Aug 2026 ·
 * Hansard", and a sheet headed "Recorded 18 August 2026" with the original,
 * the notes and the licence.
 */
function RecordSourceLine({
  doc,
  testID,
}: {
  doc: DocumentRecord;
  testID: string;
}) {
  const source = recordSource(doc);
  const original = recordOriginal(doc);
  return (
    <SourceLine
      dateRole="recorded"
      asOf={recordDate(doc)}
      citation={[source.citation]}
      originals={original ? [original] : []}
      notes={[
        ...source.notes,
        original
          ? null
          : 'No official link is published for this record. Cite it by its title and date.',
      ]}
      licence={source.licence}
      licenceDataset={source.licenceDataset}
      testID={testID}
    />
  );
}

/**
 * The grant recipient or contract supplier, when the record names an
 * organisation with an id. A private individual is never named or linked
 * (money-public/privacy.ts, App Review 5.1.1).
 */
function organisationOf(doc: DocumentRecord) {
  const kind = doc.labels.kind ?? '';
  if (!/^(grant_award|grant|contract)$/.test(kind)) return null;
  const fields =
    doc.metadata.source_fields && typeof doc.metadata.source_fields === 'object'
      ? (doc.metadata.source_fields as Record<string, unknown>)
      : {};
  const read = (...keys: string[]) => {
    for (const key of keys)
      for (const from of [doc.metadata, fields]) {
        const found = from[key];
        if (typeof found === 'string' && found.trim()) return found.trim();
      }
    return '';
  };
  const abr = [doc.metadata.abr, fields.abr].find(
    (value): value is Record<string, unknown> =>
      !!value && typeof value === 'object',
  );
  const rid = read('recipient_id', 'supplier_id', 'rid');
  const name = read('recipient_name', 'supplier_name', 'organisation');
  if (!rid || !name) return null;
  // The money data's own fields: the entity kind and the ABN entity type.
  const entity = read('recipient_kind', 'supplier_kind', 'entity_type', 'k');
  const abnType =
    read('abn_type') ||
    (typeof abr?.etype === 'string' ? abr.etype : '') ||
    read('entity_type');
  if (!isOrganisation(name, entity || undefined, abnType || undefined, rid))
    return null;
  // Money records know federal and Queensland only.
  const place = read('jur', 'jurisdiction') || doc.labels.state || '';
  return {
    rid,
    name,
    jur: /^(qld|queensland)$/i.test(place) ? 'qld' : 'federal',
  };
}
function OrganisationRow({
  rid,
  jur,
  name,
}: {
  rid: string;
  jur: string;
  name: string;
}) {
  return (
    <LinkRow
      title={`Open ${name}`}
      href={moneyRecordRoute({ rid, jur }, name)}
      testID="doc-organisation"
    />
  );
}

type BillEntry = BillIndex['bills'][number];
/** The bill's own row: status, when it was introduced, and who brought it. */
function LinkedBillRow({ bill }: { bill: BillEntry }) {
  const navigation = useRecordNavigation();
  return (
    <BillRow
      billKey={bill.key}
      title={bill.title}
      status={billStatus(bill.status)}
      rawStatus={bill.status}
      date={bill.introduced}
      dateLabel="Introduced"
      meta={
        bill.portfolio
          ? { portfolio: bill.portfolio }
          : bill.sponsor
            ? { sponsor: bill.sponsor, party: bill.sponsor_party }
            : undefined
      }
      dragPath={`/bill/${bill.key}`}
      {...(navigation.inPane
        ? { onPress: () => navigation.openBill(bill.key, bill.title) }
        : { href: billRoute(bill.key) })}
      testID="doc-bill-open"
    />
  );
}
function LinkedBill({ doc }: { doc: DocumentRecord }) {
  const navigation = useRecordNavigation();
  const [found, setFound] = useState<{
    bill: BillEntry;
    asAt: string | null;
  } | null>(null);
  const key = metaString(doc, 'bill_key');
  const textBill =
    doc.labels.kind === 'bill_text' && /^au-federal-[a-z0-9-]+$/.test(key);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const subject = textBill
      ? ''
      : metaString(doc, 'bill_ref') ||
        metaString(doc, 'topic') ||
        metaString(doc, 'debate') ||
        titleSubject(doc);
    if (!textBill && !subject) return;
    void catalogs
      .bills(undefined, controller.signal)
      .then((result) => {
        const matches = result.data.bills.filter((entry) =>
          textBill
            ? entry.key === key
            : [entry.title, ...(entry.aliases ?? [])].some(
                (title) => titleKey(title) === titleKey(subject),
              ),
        );
        if (matches.length !== 1 || !active) return;
        const bill = matches[0]!;
        setFound({
          bill,
          asAt: bill.status_as_of ?? result.data.generated_at,
        });
      })
      .catch(() => {});
    return () => {
      active = false;
      controller.abort();
    };
  }, [doc, key, textBill]);
  if (!found && !textBill) return null;
  return (
    <View style={styles.after} testID="doc-bill">
      <SectionHeader title="The bill" />
      {found ? (
        <LinkedBillRow bill={found.bill} />
      ) : (
        <LinkRow
          title={metaString(doc, 'title') || 'Bill page'}
          onPress={() => navigation.openBill(key)}
          testID="doc-bill-open"
        />
      )}
      {textBill ? (
        <LinkRow
          title="Other versions of this bill"
          onPress={() =>
            navigation.openText(key, metaString(doc, 'version_id') || undefined)
          }
          testID="doc-bill-text"
        />
      ) : null}
      {found ? (
        <View style={styles.source}>
          <SourceLine
            asOf={found.asAt}
            citation={[{ label: 'ParlInfo', title: 'ParlInfo bill register' }]}
            testID="doc-bill-source"
          />
        </View>
      ) : null}
    </View>
  );
}

type SimilarResult = Awaited<ReturnType<Records['similar']>>;
function Similar({ doc }: { doc: DocumentRecord }) {
  const speakerFor = useSpeechSpeakers();
  const navigation = useRecordNavigation();
  const [value, setValue] = useState<SimilarResult | null>(null);
  const [error, setError] = useState<unknown>(null),
    [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [doc.slug],
  );
  const loadSimilar = () => {
    setOpen(true);
    if (value || loading) return;
    setError(null);
    setLoading(true);
    const controller = new AbortController();
    request.current = controller;
    void records
      .similar(doc, topics, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setValue(next);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !isAbortError(error)) setError(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  };
  const rows: ReactNode[] =
    value?.data.map((row, index) => {
      const record = {
        slug: row.slug,
        title: row.title,
        speaker: row.speaker,
        date: row.date,
        labels: {
          kind: 'speech',
          ...(row.chamber ? { chamber: row.chamber } : {}),
        },
      };
      const drawn = (
        <RecordRow
          meta={metaLine(record)}
          title={recordHeadline(record)}
          excerpt={{ text: serverPassage(row.snippet) || '' }}
          speaker={speakerFor(row)}
          href={docRoute(row.slug)}
          onPress={
            navigation.inPane
              ? () => navigation.openDoc(row.slug, recordHeadline(record))
              : undefined
          }
          testID={`doc-similar-${index}`}
        />
      );
      return <View key={row.slug}>{drawn}</View>;
    }) ?? [];
  return (
    <View style={styles.after}>
      <Disclosure
        label="Similar speeches"
        open={open}
        onToggle={(next) => (next ? loadSimilar() : setOpen(false))}
        testID="doc-similar"
      >
        <View style={styles.similar}>
          {loading ? (
            <Skeleton count={3} label="Loading similar speeches" />
          ) : null}
          {error ? (
            <InlineError
              subject="Similar speeches"
              message="Similar speeches couldn’t be loaded."
              onRetry={loadSimilar}
            />
          ) : null}
          {value ? (
            value.data.length ? (
              <>
                {rows}
                <SourceLine
                  dateRole="found"
                  asOf={value.savedAt}
                  citation={[{ label: 'OPAX search' }]}
                  originals={value.data.flatMap((row) =>
                    row.url
                      ? [
                          {
                            label: 'Hansard',
                            url: row.url,
                            record: row.date
                              ? `speech, ${formatDate(row.date, 'short')}`
                              : 'speech',
                          },
                        ]
                      : [],
                  )}
                  notes={[
                    'Speeches on the same subject, found by OPAX search.',
                  ]}
                  testID="doc-similar-source"
                />
              </>
            ) : (
              <Text variant="body" tone="inkSoft">
                No similar speeches found.
              </Text>
            )
          ) : null}
        </View>
      </Disclosure>
    </View>
  );
}

const styles = StyleSheet.create({
  findStatus: {
    minHeight: minimumTarget,
    justifyContent: 'center',
    marginBottom: rhythm.block,
  },
  meta: { marginBottom: rhythm.line },
  speaker: { marginTop: rhythm.block },
  source: { marginTop: rhythm.tight },
  caveat: { marginTop: rhythm.line },
  rows: { marginTop: rhythm.tight },
  block: { marginTop: rhythm.block },
  brief: { gap: rhythm.tight },
  beforeText: { height: rhythm.block },
  endSource: { marginTop: rhythm.group },
  after: { marginTop: rhythm.section },
  similar: { gap: rhythm.tight },
  skeleton: { gap: rhythm.block },
  skeletonGroup: { gap: rhythm.tight, flex: 1 },
  skeletonSpeaker: {
    flexDirection: 'row',
    gap: rhythm.tight,
    alignItems: 'flex-start',
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderCurve: 'continuous',
    backgroundColor: colors.sunken,
  },
  bar: {
    borderRadius: 4,
    borderCurve: 'continuous',
    backgroundColor: colors.sunken,
  },
});
