import { scopedQuestion } from '../ask/AskAbout';
import { useOpenAsk } from '../ask/open';
import { headerItems } from '../../navigation/chrome';
import { SavedCopyNotice } from '../CatalogNotice';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View, findNodeHandle } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  billName,
  billSentenceCase,
  billSourceLabel,
  billStage,
  billTimeline,
  type BillTimelineEntry,
  type BillTimelineStage,
} from '../../api/bill-transforms';
import { billKey, catalogSources } from '../../api/catalogs';
import { ApiError } from '../../api/errors';
import { catalogs } from '../../api/runtime';
import { formatCount, formatDate } from '../../design/format';
import { showMenu } from '../../design/menu';
import { jurisdictionName } from '../../design/parliament';
import { partyText } from '../../design/party';
import {
  Button,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  IconButton,
  LoadingState,
  LinkRow,
  OfflineBanner,
  PersonRow,
  Portrait,
  RowList,
  Screen,
  Section,
  SourceLine,
  StatusLabel,
  SubSection,
  Text,
  errorMessage,
  useAccessibilitySize,
  type SourceOriginal,
} from '../../design/primitives';
import { chrome, colors, rhythm } from '../../design/tokens';
import { openOnWeb, openSource } from '../../navigation/external';
import { billRoute, personRoute } from '../../navigation/routes';
import { CachedPortrait } from '../CachedPortrait';
import { shareHeaderItem } from '../../navigation/share';
import { divisionQuestion, divisionTitle } from './divisions';
import { chamberLabel } from './filters';
import {
  Bullet,
  Disclosure,
  DivisionQuestion,
  DivisionSplits,
  MachineBrief,
  MachineSummary,
  RecordedParty,
  dateSpan,
  divisionParties,
} from './parts';
import { sponsorRows, type SponsorDirectory } from './sponsors';
import { FollowToggle } from '../follows/FollowToggle';
import { useCatalogRecord } from './useCatalogRecord';
import { useBillNavigation } from './navigation';

type BillRecord = Awaited<ReturnType<typeof catalogs.billFor>>;
type BillView = BillRecord['data'];
type Identity = NonNullable<BillView['identity']['data']>;
type Division = NonNullable<BillView['divisions']['data']>['rows'][number];

// The web's bill-page fine print, in its words (portal/public/app.js
// billDivisionsHTML, billSpeechesHTML, billSummaryHTML). Each now sits in
// its block's source sheet; only the one-sentence empty states draw inline.
const copy = {
  noSummary:
    "No summary yet: the dates, divisions and speeches below are the record's own.",
  noDivisions:
    'No divisions recorded. Most questions are decided on the voices, so this does not mean the bill was unopposed.',
  divisions:
    "Ayes and noes are the division's own totals. Party is each member's recorded affiliation, not a reconstruction of who they sat with on the day, and a member the record does not name is counted but not attributed. Only formal divisions leave a per-member record.",
  splits:
    'Each party reads ayes–noes. Its bar shows the ayes in bronze, then the noes, against the largest party in that division; the three largest parties are drawn, and the rest are listed with the question.',
  speeches: 'Speeches the record attaches to this bill.',
  briefs:
    'A brief under a name was written from that speech by a model, not by a person.',
  fineprint:
    'Bills, their dates and their divisions come from the parliamentary record; each bill page links the official source it was read from. Summaries are written by a model from the explanatory memorandum or the Bills Digest, are marked as such wherever they appear, and are not the record.',
};
const DIVISIONS_SHOWN = 6;

const isBillKey = (key: string) => {
  try {
    billKey(key);
    return true;
  } catch {
    return false;
  }
};
const stageText = (s: BillTimelineStage) =>
  [
    s.stage,
    s.house ? chamberLabel(s.house) : null,
    s.days > 1 ? `on ${s.days} recorded days` : null,
  ]
    .filter(Boolean)
    .join(' · ');
const unique = <T,>(items: readonly T[]) => [...new Set(items)];

/** One bill: what it would change, how it moved, and how each house divided. */
export default function BillDetail({
  recordKey,
  embedded = false,
}: { recordKey?: string; embedded?: boolean } = {}) {
  const params = useLocalSearchParams<{ key: string; section?: string }>();
  const key = recordKey ?? params.key;
  const focusedDivisions = params.section === 'divisions';
  const load = useCallback(
    (refresh: boolean) => catalogs.billFor(String(key), refresh),
    [key],
  );
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  // undefined while the directory loads; null when it could not be read.
  const [directory, setDirectory] = useState<SponsorDirectory | null>();
  const view = record?.data;
  const identity = view?.identity.data ?? null;
  const hasSponsors = !!identity?.sponsorMembers.length;
  // Sponsors link to their profile only where the roster and the directory
  // agree on who they are; otherwise the row stays plain.
  useEffect(() => {
    if (!hasSponsors) return;
    let active = true;
    catalogs
      .directory()
      .then((found) => {
        if (active)
          setDirectory({
            roster: found.roster.data,
            slugs: found.slugs.data,
            people: found.people.data,
            manifest: found.manifest.data,
            electorates: found.electorates.data,
          });
      })
      .catch(() => {
        if (active) setDirectory(null);
      });
    return () => {
      active = false;
    };
  }, [hasSponsors]);

  const name = identity
    ? billName({ title: identity.title, short_title: identity.shortTitle })
    : '';
  // A key the register could never name, or one it does not publish. A file
  // that arrives but cannot be read is an error, not a missing bill.
  const notFound =
    !record &&
    (!isBillKey(String(key)) ||
      (error instanceof ApiError && error.code === 'not-found'));
  // A saved copy says so in every block's source line ("Saved 3 Oct 2026").
  const savedAt = record?.stale ? record.savedAt : null;
  return (
    <>
      {embedded ? null : (
        <Stack.Screen
          options={{
            // The title is the page's level 1 heading; `title` still names the
            // screen for the back stack.
            title: name,
            headerTitle: '',
            ...headerItems(
              identity
                ? () => [
                    shareHeaderItem({
                      path: `/bill/${identity.key}`,
                      title: name,
                    }),
                  ]
                : undefined,
            ),
          }}
        />
      )}
      <Screen
        testID={view ? 'bill-screen' : 'bill-pending-screen'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={chrome.tint}
          />
        }
      >
        {notFound ? (
          <Group>
            <Heading level={1} testID="bill-not-found">
              No bill with this identifier
            </Heading>
            <Text>
              The register does not name this bill. It may not be published yet,
              or the link may be old.
            </Text>
          </Group>
        ) : error instanceof ApiError && error.code === 'offline' && !record ? (
          <Group>
            <OfflineBanner cached={false} testID="bill-offline-uncached" />
            <Button
              label="Try again"
              onPress={retry}
              testID="bill-error-retry"
            />
          </Group>
        ) : error && !record ? (
          <ErrorState
            message={errorMessage(error)}
            onRetry={retry}
            testID="bill-error"
          />
        ) : !view ? (
          <LoadingState
            shape="text"
            count={5}
            label="Loading the bill"
            testID="bill-loading"
          />
        ) : null}
        {view && identity && record ? (
          <>
            {record.stale ? (
              <Group gap={rhythm.tight}>
                <SavedCopyNotice
                  reason={record.staleReason}
                  testID={
                    record.staleReason ? 'bill-saved-copy' : 'bill-offline'
                  }
                />
                <Button
                  label="Try again"
                  onPress={refresh}
                  loading={refreshing}
                  testID="bill-refresh"
                />
              </Group>
            ) : null}
            {focusedDivisions ? (
              <Divisions view={view} savedAt={savedAt} focused />
            ) : (
              <>
                <BillHead
                  view={view}
                  name={name}
                  directory={directory}
                  savedAt={savedAt}
                />
                <Summary view={view} savedAt={savedAt} />
                <KeyDates view={view} savedAt={savedAt} />
                <Divisions view={view} savedAt={savedAt} />
                <Speeches view={view} savedAt={savedAt} />
                <Acts view={view} savedAt={savedAt} />
              </>
            )}
          </>
        ) : null}
      </Screen>
    </>
  );
}

/**
 * The bill's identity, said once: its status as a label with the date, the
 * title, one meta line, then the one primary action (Read the bill text),
 * Follow and ⋯ for everything else. The sponsor is the standard people row.
 * The block's source line holds the originals, the register's note and
 * "Sponsor not recorded".
 */
function BillHead({
  view,
  name,
  directory,
  savedAt,
}: {
  view: BillView;
  name: string;
  directory: SponsorDirectory | null | undefined;
  savedAt: number | null;
}) {
  const identity = view.identity.data!;
  const bills = useBillNavigation();
  const draft = identity.status === 'exposure_draft';
  const consultation = view.consultation.data;
  const sponsors = useMemo(
    () =>
      sponsorRows(
        identity.sponsorMembers,
        identity.sponsorParty,
        identity.sponsorPersonId,
        directory ?? null,
      ),
    [identity, directory],
  );
  // One meta line: "Introduced 17 Aug 2026 · House of Representatives ·
  // Home Affairs portfolio".
  const meta = [
    identity.introduced
      ? `${identity.introducedLabel} ${formatDate(identity.introduced, 'short')}`
      : null,
    identity.house ? chamberLabel(identity.house) : null,
    identity.portfolio ? `${identity.portfolio} portfolio` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const sources = view.identity.sources;
  // The register's own name for an introduced bill; a draft's release and
  // consultation pages otherwise.
  const citation = draft
    ? unique(sources.map((s) => s.label))
    : catalogSources.bills.label;
  const unsponsored = !identity.sponsorMembers.length && !draft;
  return (
    <Group gap={rhythm.heading}>
      <StatusLine identity={identity} />
      <Heading level={1} testID="bill-title">
        {identity.title}
      </Heading>
      {identity.shortTitle && identity.shortTitle !== identity.title ? (
        <Text variant="metadata" wordSafe>
          Known as the {identity.shortTitle}
        </Text>
      ) : null}
      {meta ? (
        <Text variant="metadata" wordSafe testID="bill-introduced">
          {meta}
        </Text>
      ) : null}
      {draft && !identity.sponsorMembers.length ? (
        <Text variant="metadata" wordSafe>
          Government exposure draft, not yet introduced
        </Text>
      ) : null}
      <BillActions
        identity={identity}
        name={name}
        home={sources.find((s) => s.label === billSourceLabel('billhome'))}
      />
      {identity.sponsorMembers.length ? (
        <View testID="bill-sponsor" style={styles.sponsor}>
          <Text variant="label">
            {identity.sponsorMembers.length === 1 ? 'Sponsor' : 'Sponsors'}
          </Text>
          <RowList>
            {sponsors.map((sponsor, index) => {
              const spoken = [
                sponsor.name,
                sponsor.place,
                sponsor.party ? partyText(sponsor.party).spoken : null,
                sponsor.slug ? 'profile' : null,
              ]
                .filter(Boolean)
                .join(', ');
              const slug = sponsor.slug;
              return (
                <PersonRow
                  key={`${index}-${sponsor.name}`}
                  name={sponsor.name}
                  portrait={
                    slug ? (
                      <CachedPortrait name={sponsor.name} slug={slug} />
                    ) : (
                      <Portrait loading={directory === undefined} />
                    )
                  }
                  {...(sponsor.party
                    ? {
                        party: sponsor.party.party,
                        partyStatus: sponsor.party.status,
                        formerly: sponsor.party.formerly,
                      }
                    : { party: undefined })}
                  place={sponsor.place}
                  accessibilityLabel={spoken}
                  onPress={
                    slug ? () => router.push(personRoute(slug)) : undefined
                  }
                  testID={
                    slug
                      ? `bill-sponsor-${slug}`
                      : `bill-sponsor-unlinked-${index}`
                  }
                />
              );
            })}
          </RowList>
        </View>
      ) : identity.sponsorParty ? (
        // No member named, but the register records a party.
        <View testID="bill-sponsor" style={styles.sponsor}>
          <Text variant="label">Sponsor</Text>
          <RecordedParty party={identity.sponsorParty} />
        </View>
      ) : null}
      {view.related.map((related) => (
        <LinkRow
          key={related.key}
          title={related.title}
          detail={[
            related.relation === 'predecessor'
              ? 'Builds on'
              : billSentenceCase(related.relation),
            related.note || null,
          ]
            .filter(Boolean)
            .join(' · ')}
          onPress={() => bills.openBill(related.key, related.title)}
          testID={`bill-related-${related.key}`}
        />
      ))}
      {view.became ? (
        <LinkRow
          title="Introduced to Parliament as a bill"
          onPress={() => bills.openBill(view.became!)}
          testID="bill-became"
        />
      ) : null}
      {draft && consultation ? (
        <Group gap={rhythm.tight} testID="bill-consultation">
          <Text variant="body">
            {consultation.closes
              ? `Consultation opened ${formatDate(consultation.opens)} and closes ${formatDate(consultation.closes)}`
              : `Open for consultation from ${formatDate(consultation.opens)}`}
          </Text>
          {consultation.note ? (
            <Text variant="fine">{consultation.note}</Text>
          ) : null}
          <SourceLine
            label="Consultation page"
            accessibilityLabel="View original, Consultation page"
            onPress={() =>
              void openSource(consultation.url, 'Consultation page')
            }
            testID="bill-consultation-source"
          />
        </Group>
      ) : null}
      <SourceLine
        title="About this bill"
        asOf={view.identity.asAt}
        citation={citation}
        savedAt={savedAt}
        originals={sources.map((s) => ({ label: s.label, url: s.url }))}
        licence={
          unique(sources.map((s) => s.licence).filter(Boolean)).join(', ') ||
          null
        }
        notes={[
          unsponsored
            ? identity.sponsorParty
              ? 'The register names no sponsoring member, only the party.'
              : 'Sponsor not recorded.'
            : null,
          copy.fineprint,
        ]}
        testID="bill-source"
      />
    </Group>
  );
}

/** "[Passed] 26 Aug 2026": the status word on its tone, then its date. */
function StatusLine({ identity }: { identity: Identity }) {
  return (
    <View
      accessible
      // Journeys and VoiceOver read the full sentence.
      accessibilityLabel={`${identity.statusLabel}${identity.statusAsOf ? `, as at ${formatDate(identity.statusAsOf)}` : ''}`}
      testID="bill-status"
      style={styles.status}
    >
      <StatusLabel label={identity.statusLabel} hidden />
      {identity.statusAsOf ? (
        <Text variant="metadata" tabular>
          {formatDate(identity.statusAsOf, 'short')}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One primary action, Read the bill text; Follow beside it; everything else
 * (Ask about this, the bill home, the page on opax.com.au) under ⋯. Share
 * stays in the navigation bar, or the pane's bar on iPad.
 */
function BillActions({
  identity,
  name,
  home,
}: {
  identity: Identity;
  name: string;
  /** The bill's home page in the register, when the record links one. */
  home?: { label: string; url: string };
}) {
  const bills = useBillNavigation();
  const openAsk = useOpenAsk();
  const stacked = useAccessibilitySize();
  const anchor = useRef<View>(null);
  return (
    <View style={[styles.actions, stacked ? styles.actionsStacked : null]}>
      <Button
        label="Read the bill text"
        variant="primary"
        icon="doc.text"
        size="compact"
        onPress={() => bills.openText(identity.key, name)}
        testID="bill-read-text"
      />
      <FollowToggle
        kind="bill"
        id={identity.key}
        title={name}
        testID="bill-follow"
      />
      <View ref={anchor} collapsable={false}>
        <IconButton
          symbol="ellipsis"
          variant="default"
          accessibilityLabel="More for this bill"
          testID="bill-more"
          onPress={() =>
            showMenu(
              name,
              [
                {
                  title: 'Ask about this',
                  onPress: () => openAsk(scopedQuestion('bill', name)),
                },
                ...(home
                  ? [
                      {
                        title: 'Open the bill home',
                        onPress: () => void openSource(home.url, home.label),
                      },
                    ]
                  : []),
                {
                  title: 'Open on opax.com.au',
                  onPress: () => void openOnWeb(`/bill/${identity.key}`, name),
                },
              ],
              findNodeHandle(anchor.current) ?? undefined,
            )
          }
        />
      </View>
    </View>
  );
}

function Summary({
  view,
  savedAt,
}: {
  view: BillView;
  savedAt: number | null;
}) {
  const summary = view.summary.data;
  if (!summary)
    return (
      <Section title="In short" accent="bills" testID="bill-summary">
        <EmptyState message={copy.noSummary} testID="bill-summary-none" />
      </Section>
    );
  const sentences = summary.sentences.filter(Boolean);
  const changes = summary.changes.filter(Boolean);
  const shown = changes.length > 3 ? changes.slice(0, 2) : changes;
  const more = changes.slice(shown.length);
  const sources = view.summary.sources;
  return (
    <Section title="In short" accent="bills" testID="bill-summary">
      <MachineSummary
        attribution={summary.attribution}
        sentences={sentences}
        testID="bill-summary"
      />
      {changes.length ? (
        <SubSection title="What it changes">
          {shown.map((change, index) => (
            <Bullet key={index}>{change}</Bullet>
          ))}
          {more.length ? (
            <Disclosure
              label={`${more.length} more ${more.length === 1 ? 'change' : 'changes'}`}
              testID="bill-summary-changes-more"
            >
              {more.map((change, index) => (
                <Bullet key={index}>{change}</Bullet>
              ))}
            </Disclosure>
          ) : null}
        </SubSection>
      ) : null}
      {summary.affected ? (
        <SubSection title="Who is affected">
          <Text variant="body">{summary.affected}</Text>
        </SubSection>
      ) : null}
      <SourceLine
        title="About this summary"
        asOf={summary.as_of}
        // Undated material: the summary is dated by when it was written.
        dateLabel={
          summary.as_of
            ? undefined
            : `Written ${formatDate(summary.generated_at, 'short')}`
        }
        citation={unique(sources.map((s) => s.label))}
        savedAt={savedAt}
        originals={sources.map((s) => ({ label: s.label, url: s.url }))}
        notes={[
          summary.describes_version
            ? `Describes the bill ${summary.describes_version}.`
            : null,
          summary.as_of
            ? `Written by a model from material dated ${formatDate(summary.as_of)}; not the record.`
            : 'Written by a model; not the record.',
        ]}
        licence={
          unique(sources.map((s) => s.licence).filter(Boolean)).join(', ') ||
          null
        }
        testID="bill-summary-source"
      />
    </Section>
  );
}

/** The ruler's marks: where the bill began, where it crossed, where it ended. */
function rulerPoints(entries: readonly BillTimelineEntry[]) {
  const first = entries[0]!;
  const last = entries[entries.length - 1]!;
  const home = first.stages.find((s) => s.house)?.house ?? null;
  const crossed = home
    ? entries.findIndex(
        (entry, i) =>
          i > 0 &&
          i < entries.length - 1 &&
          entry.stages.some((s) => s.house && s.house !== home),
      )
    : -1;
  const house = (h: string) =>
    h === 'senate'
      ? 'Senate'
      : h === 'representatives'
        ? 'House'
        : chamberLabel(h);
  const points = [{ at: 0, label: first.stages[0]!.stage, date: first.from }];
  if (crossed > 0) {
    const entry = entries[crossed]!;
    const stage = entry.stages.find((s) => s.house && s.house !== home)!;
    points.push({ at: crossed, label: house(stage.house!), date: entry.from });
  }
  points.push({
    at: entries.length - 1,
    label: last.stages[last.stages.length - 1]!.stage,
    date: last.to ?? last.from,
  });
  return points;
}

/**
 * How the bill moved, at a glance: a dot for each dated entry on one rule,
 * named where it began, where it reached the other house and where it
 * ended. At accessibility sizes the marks are a short list instead.
 */
function StageRuler({ entries }: { entries: readonly BillTimelineEntry[] }) {
  const stacked = useAccessibilitySize();
  const points = rulerPoints(entries);
  const spoken = points
    .map((p) => `${p.label}, ${formatDate(p.date)}`)
    .join('; ');
  if (stacked)
    return (
      <View
        accessible
        accessibilityLabel={spoken}
        testID="bill-dates-ruler"
        style={styles.rulerList}
      >
        {points.map((p) => (
          <View key={p.at} style={styles.date}>
            <View style={styles.dot} />
            <Text variant="metadata" wordSafe style={styles.grow}>
              {`${p.label} · ${formatDate(p.date, 'short')}`}
            </Text>
          </View>
        ))}
      </View>
    );
  return (
    <View
      accessible
      accessibilityLabel={spoken}
      testID="bill-dates-ruler"
      style={styles.ruler}
    >
      <View style={styles.track}>
        <View style={styles.rule} />
        {entries.map((entry, i) => (
          <View key={`${entry.from}-${i}`} style={styles.rulerDot} />
        ))}
      </View>
      <View style={styles.rulerLabels}>
        {points.map((p, i) => (
          <View
            key={p.at}
            style={[
              styles.rulerLabel,
              i === 0
                ? styles.labelStart
                : i === points.length - 1
                  ? styles.labelEnd
                  : styles.labelMiddle,
            ]}
          >
            <Text variant="label" tone="ink" wordSafe>
              {p.label}
            </Text>
            <Text variant="fine" tabular>
              {formatDate(p.date, 'short')}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DateRows({ entries }: { entries: readonly BillTimelineEntry[] }) {
  return (
    <RowList>
      {entries.map((entry, index) => (
        <View
          key={`${entry.from}-${entry.to}-${index}`}
          accessible
          accessibilityLabel={`${dateSpan(entry.from, entry.to, 'long')}: ${entry.stages.map(stageText).join('; ')}`}
          testID={`bill-date-${index}`}
          style={styles.date}
        >
          <View style={styles.dot} />
          <View style={styles.dateText}>
            <Text variant="strong">{dateSpan(entry.from, entry.to)}</Text>
            {entry.stages.map((stage, i) => (
              <Text key={i} variant="metadata" wordSafe>
                {stageText(stage)}
              </Text>
            ))}
          </View>
        </View>
      ))}
    </RowList>
  );
}

function KeyDates({
  view,
  savedAt,
}: {
  view: BillView;
  savedAt: number | null;
}) {
  const timeline = billTimeline(view.keyDates.data ?? []);
  const entries = timeline.entries;
  const parlinfo = (view.keyDates.data ?? []).some((d) =>
    d.url?.startsWith('https://parlinfo.aph.gov.au/'),
  );
  const known = new Map(view.identity.sources.map((s) => [s.url, s.label]));
  const originals: SourceOriginal[] = unique(
    view.keyDates.sources.map((s) => s.url),
  ).map((url) => ({
    label: known.get(url) ?? catalogSources.bills.label,
    url,
  }));
  return (
    <Section title="How it moved" accent="bills" testID="bill-key-dates">
      {entries.length > 1 ? (
        <>
          <StageRuler entries={entries} />
          <Disclosure
            label={`All ${formatCount(timeline.runs)} stages`}
            testID="bill-dates-all"
          >
            <DateRows entries={entries} />
          </Disclosure>
        </>
      ) : entries.length ? (
        <DateRows entries={entries} />
      ) : (
        <EmptyState message="No dates recorded." testID="bill-dates-none" />
      )}
      <SourceLine
        title="About these dates"
        asOf={view.keyDates.asAt}
        // Parliament's register for introduced bills; a draft's own release
        // and consultation pages otherwise.
        citation={
          parlinfo
            ? catalogSources.bills.label
            : unique(view.identity.sources.map((s) => s.label))
        }
        savedAt={savedAt}
        originals={originals}
        notes={[
          timeline.folded
            ? `The register records a stage on each day it was before the house. These ${timeline.runs} stages carry ${timeline.dates} such dates: a stage that ran across sitting days is one stage with its span, not one a day.`
            : null,
        ]}
        testID="bill-dates-source"
      />
    </Section>
  );
}

function Divisions({
  view,
  savedAt,
  focused = false,
}: {
  view: BillView;
  savedAt: number | null;
  focused?: boolean;
}) {
  const [all, setAll] = useState(false);
  const data = view.divisions.data!;
  const identity = view.identity.data!;
  const rows = data.rows;
  const shown = all ? rows : rows.slice(0, DIVISIONS_SHOWN);
  const rest = rows.length - shown.length;
  const name = billName({
    title: identity.title,
    short_title: identity.shortTitle,
  });
  return (
    <Section
      title={focused ? undefined : 'Divisions'}
      accent="votes"
      testID="bill-divisions"
    >
      {focused ? (
        <Group gap={rhythm.tight}>
          <Heading level={1} testID="bill-divisions-title">
            Bill divisions
          </Heading>
          <LinkRow
            title={name}
            accessibilityLabel={`${name}, the bill`}
            onPress={() => router.push(billRoute(identity.key))}
            testID="bill-divisions-details"
            titleTestID="bill-divisions-bill-name"
          />
        </Group>
      ) : null}
      {rows.length ? (
        <RowList>
          {shown.map((division, index) => (
            <DivisionItem
              key={division.key}
              division={division}
              index={index}
              bill={{ title: identity.title, short_title: identity.shortTitle }}
            />
          ))}
        </RowList>
      ) : (
        <EmptyState message={copy.noDivisions} testID="bill-divisions-none" />
      )}
      {rest > 0 ? (
        <Button
          label={`Show more (${formatCount(rest)} more)`}
          variant="quiet"
          icon="chevron.down"
          onPress={() => setAll(true)}
          testID="bill-divisions-more"
        />
      ) : null}
      {rows.length ? (
        <SourceLine
          title="About these divisions"
          asOf={view.divisions.asAt}
          citation="They Vote For You"
          licence="ODbL"
          savedAt={savedAt}
          originals={rows.map((d) => ({
            label: 'They Vote For You',
            url: d.url,
            record: `${divisionTitle(d)}, ${chamberLabel(d.house)}, ${formatDate(d.date, 'short')}`,
          }))}
          notes={[
            copy.divisions,
            copy.splits,
            data.partyBasisNote,
            data.collapsed
              ? `The source records some divisions more than once; ${data.collapsed} ${data.collapsed === 1 ? 'row' : 'rows'} identical in day, stage and counts ${data.collapsed === 1 ? 'is' : 'are'} shown here once.`
              : null,
          ]}
          testID="bill-divisions-source"
        />
      ) : null}
    </Section>
  );
}

/**
 * One division: the outcome and counts, its title (the recorded stage, D5),
 * chamber and date, then the three largest parties as bars. The question in
 * the record's words and the other parties wait behind one disclosure.
 */
function DivisionItem({
  division,
  index,
  bill,
}: {
  division: Division;
  index: number;
  bill: { title: string; short_title: string | null };
}) {
  const id = `bill-division-${index}`;
  const outcome = division.outcomeLabel || 'Outcome not recorded';
  const counts = `${formatCount(division.ayes)} ayes, ${formatCount(division.noes)} noes`;
  const parties = divisionParties(division.splits);
  const question = divisionQuestion(division.question, division.stage, bill);
  const words = question ? question.split(/\s+/).filter(Boolean).length : 0;
  const more = parties.rest.length;
  const moreParties = more
    ? `${formatCount(more)} more ${more === 1 ? 'party' : 'parties'}`
    : null;
  return (
    <View style={styles.division} testID={id}>
      <View
        accessible
        accessibilityLabel={`${outcome}, ${counts}`}
        testID={`${id}-outcome`}
        style={styles.outcome}
      >
        <StatusLabel label={outcome} hidden />
        <Text variant="strong" tabular>
          {counts}
        </Text>
      </View>
      <View style={styles.divisionHead}>
        <Heading level={3} testID={`${id}-title`}>
          {divisionTitle(division)}
        </Heading>
        <Text variant="metadata" wordSafe>
          {[chamberLabel(division.house), formatDate(division.date, 'short')]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      {parties.recorded ? (
        <DivisionSplits
          splits={parties.shown}
          max={parties.max}
          testID={`${id}-splits`}
        />
      ) : (
        <Text variant="fine" testID={`${id}-splits-none`}>
          Party split not recorded for this division.
        </Text>
      )}
      {parties.notes.length ? (
        <Text variant="fine">{parties.notes.join(' · ')}</Text>
      ) : null}
      {question || more ? (
        <Disclosure
          label={[question ? 'The question' : null, moreParties]
            .filter(Boolean)
            .join(' · ')}
          accessibilityLabel={[
            question ? `The question, ${words} words` : null,
            moreParties,
          ]
            .filter(Boolean)
            .join(', ')}
          testID={`${id}-more`}
        >
          {question ? (
            <DivisionQuestion text={question} testID={`${id}-question`} />
          ) : null}
          {more ? (
            <DivisionSplits
              splits={parties.rest}
              max={parties.max}
              testID={`${id}-splits-more`}
              rowTestID={`${id}-splits`}
            />
          ) : null}
        </Disclosure>
      ) : null}
    </View>
  );
}

function Speeches({
  view,
  savedAt,
}: {
  view: BillView;
  savedAt: number | null;
}) {
  const speeches = (view.speeches.data ?? []).filter((s) => s.slug);
  const briefs = speeches.some((s) => s.brief);
  return (
    <Section title="Speeches" accent="bills" testID="bill-speeches">
      {speeches.length ? (
        <RowList>
          {speeches.map((speech, index) => {
            const place =
              speech.state && speech.state !== 'federal'
                ? (jurisdictionName(speech.state) ?? null)
                : null;
            const meta = [
              place,
              speech.stage_hint ? billStage(speech.stage_hint) : null,
              speech.speaker ? formatDate(speech.date, 'short') : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <View
                key={speech.slug}
                style={styles.speech}
                testID={`bill-speech-${index}`}
              >
                <Text wordSafe variant="strong">
                  {speech.speaker ||
                    `Speech on ${formatDate(speech.date, 'short')}`}
                </Text>
                <View style={styles.speechMeta}>
                  {speech.party ? <RecordedParty party={speech.party} /> : null}
                  {meta ? <Text variant="metadata">{meta}</Text> : null}
                </View>
                {speech.brief && speech.briefLabel ? (
                  <MachineBrief
                    label={speech.briefLabel}
                    brief={speech.brief}
                    testID={`bill-speech-${index}-brief`}
                  />
                ) : null}
                <LinkRow
                  title="Read the speech"
                  accessibilityHint="Opens the reader"
                  onPress={() => void openOnWeb(speech.url, 'Read the speech')}
                  testID={`bill-speech-${index}-web`}
                />
              </View>
            );
          })}
        </RowList>
      ) : (
        <EmptyState
          message="No speeches linked to this bill yet."
          testID="bill-speeches-none"
        />
      )}
      {speeches.length ? (
        <SourceLine
          title="About these speeches"
          asOf={view.speeches.asAt}
          citation="OPAX indexed parliamentary record"
          savedAt={savedAt}
          notes={[copy.speeches, briefs ? copy.briefs : null]}
          testID="bill-speeches-source"
        />
      ) : null}
    </Section>
  );
}

function Acts({ view, savedAt }: { view: BillView; savedAt: number | null }) {
  const acts = (view.acts.data ?? []).filter((a) => a.title);
  const passed = /passed|assent/i.test(view.identity.data?.status ?? '');
  if (!acts.length && !passed) return null;
  return (
    <Section title="What became law" accent="bills" testID="bill-acts">
      {acts.length ? (
        <RowList>
          {acts.map((act) => (
            <Group key={act.frl_uri} gap={rhythm.line}>
              <Text wordSafe variant="strong">
                {act.title}
              </Text>
              <Text variant="metadata">
                {act.assent_date
                  ? `Assented ${formatDate(act.assent_date, 'short')}`
                  : 'Assent date not recorded'}
              </Text>
            </Group>
          ))}
        </RowList>
      ) : (
        <EmptyState message="No Act matched to this bill yet." />
      )}
      {acts.length ? (
        <SourceLine
          title="About these Acts"
          asOf={view.acts.asAt}
          citation="Federal Register of Legislation"
          savedAt={savedAt}
          originals={acts.map((act) => ({
            label: 'Act text',
            url: act.frl_uri,
            record: act.title,
          }))}
          testID="bill-acts-source"
        />
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  status: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  actionsStacked: { flexDirection: 'column', alignItems: 'stretch' },
  sponsor: { gap: rhythm.line },
  ruler: { gap: rhythm.tight, paddingTop: rhythm.line },
  rulerList: { gap: rhythm.tight },
  // Dots spread along one hairline, first and last at its ends.
  track: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 10,
  },
  rule: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 4,
    height: 2,
    backgroundColor: colors.billsInk,
  },
  rulerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.billsInk,
  },
  rulerLabels: { flexDirection: 'row', gap: rhythm.tight },
  rulerLabel: { flex: 1, gap: 2 },
  labelStart: { alignItems: 'flex-start' },
  labelMiddle: { alignItems: 'center' },
  labelEnd: { alignItems: 'flex-end' },
  date: { flexDirection: 'row', gap: rhythm.tight, alignItems: 'flex-start' },
  dateText: { flex: 1, gap: 2 },
  grow: { flex: 1 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
    backgroundColor: colors.billsInk,
  },
  outcome: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  division: { gap: rhythm.tight },
  divisionHead: { gap: 2 },
  speech: { gap: rhythm.tight },
  speechMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
  },
});
