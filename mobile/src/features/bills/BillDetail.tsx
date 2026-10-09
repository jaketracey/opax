import { AskAbout } from '../ask/AskAbout';
import { headerItems } from '../../navigation/chrome';
import { SavedCopyNotice } from '../CatalogNotice';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  billName,
  billSentenceCase,
  billStage,
  billTimeline,
  type BillTimelineStage,
} from '../../api/bill-transforms';
import { billKey, catalogSources } from '../../api/catalogs';
import { ApiError } from '../../api/errors';
import { catalogs } from '../../api/runtime';
import { formatCount, formatDate } from '../../design/format';
import { jurisdictionName } from '../../design/parliament';
import { partyText } from '../../design/party';
import {
  AsAtLine,
  Button,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  LoadingState,
  LinkRow,
  OfflineBanner,
  OpaxWebLink,
  PersonRow,
  Portrait,
  RowList,
  Screen,
  Section,
  SourceLink,
  StaleNotice,
  StatusLabel,
  SubSection,
  Text,
  errorMessage,
} from '../../design/primitives';
import { chrome, colors, spacing } from '../../design/tokens';
import { billRoute, personRoute } from '../../navigation/routes';
import { CachedPortrait } from '../CachedPortrait';
import { shareHeaderItem } from '../../navigation/share';
import { chamberLabel } from './filters';
import {
  Bullet,
  DivisionNote,
  MachineBrief,
  MachineSummary,
  PartySplits,
  RecordedParty,
  dateSpan,
} from './parts';
import { sponsorRows, type SponsorDirectory } from './sponsors';
import { FollowToggle } from '../follows/FollowToggle';
import { useCatalogRecord } from './useCatalogRecord';
import { useBillNavigation } from './navigation';

type BillRecord = Awaited<ReturnType<typeof catalogs.billFor>>;
type BillView = BillRecord['data'];
type Division = NonNullable<BillView['divisions']['data']>['rows'][number];

// The web's bill-page fine print and empty states, in its words
// (portal/public/app.js billDivisionsHTML, billSpeechesHTML, billSummaryHTML).
const copy = {
  noSummary:
    "Nothing has been written about this bill from its explanatory material. The dates, divisions and speeches below are the record's own.",
  noDivisions:
    'Most questions are decided on the voices and leave no per-member record, so a bill with no division here was not necessarily unopposed.',
  divisions:
    "Ayes and noes are the division's own totals. Party is each member's recorded affiliation, not a reconstruction of who they sat with on the day, and a member the record does not name is counted but not attributed. Only formal divisions leave a per-member record.",
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
  const bills = useBillNavigation();
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
            {focusedDivisions ? (
              <>
                {record.stale ? (
                  <Group>
                    <SavedCopyNotice
                      reason={record.staleReason}
                      testID={
                        record.staleReason ? 'bill-saved-copy' : 'bill-offline'
                      }
                    />
                    <StaleNotice
                      savedAt={record.savedAt}
                      refreshing={refreshing}
                      testID="bill-stale"
                    />
                    <Button label="Try again" onPress={retry} />
                  </Group>
                ) : null}
                <AskAbout kind="bill" name={name} />
                <Divisions view={view} focused />
              </>
            ) : (
              <>
                <BillHead
                  view={view}
                  directory={directory}
                  stale={record.stale}
                  staleReason={record.staleReason}
                  savedAt={record.savedAt}
                  refreshing={refreshing}
                  onRefresh={refresh}
                />
                <AskAbout kind="bill" name={name} />
                <LinkRow
                  title="Read the bill text"
                  icon="doc.text"
                  accent="bills"
                  onPress={() => bills.openText(identity.key, name)}
                  testID="bill-read-text"
                />
                <Summary view={view} />
                <KeyDates view={view} />
                <Divisions view={view} />
                <Speeches view={view} />
                <Acts view={view} />
              </>
            )}
            <Section
              title="Original records"
              accent="bills"
              testID="bill-sources"
              info={{
                title: 'About this record',
                notes: [copy.fineprint],
                testID: 'bill-sources-info',
              }}
            >
              {view.identity.sources.length ? (
                <View style={styles.originals}>
                  {view.identity.sources.map((source, index) => (
                    <SourceLink
                      key={`${source.label}-${index}`}
                      label={source.label}
                      citation={source.label}
                      url={source.url}
                      kind="record"
                      testID={`bill-source-${index}`}
                    />
                  ))}
                </View>
              ) : (
                <Text variant="fine">
                  No original source link is held for this bill.
                </Text>
              )}
              <AsAtLine
                asOf={view.identity.asAt}
                citation={
                  view.identity.sources.length
                    ? [...new Set(view.identity.sources.map((s) => s.label))]
                    : undefined
                }
                savedAt={record.stale ? record.savedAt : null}
                testID="bill-as-at"
              />
              <RowList>
                <OpaxWebLink
                  label="This bill on opax.com.au"
                  path={`/bill/${identity.key}`}
                  testID="bill-web"
                />
              </RowList>
            </Section>
          </>
        ) : null}
      </Screen>
    </>
  );
}

function BillHead({
  view,
  directory,
  stale,
  staleReason,
  savedAt,
  refreshing,
  onRefresh,
}: {
  view: BillView;
  directory: SponsorDirectory | null | undefined;
  stale: boolean;
  staleReason?: 'unreadable' | 'unavailable';
  savedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
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
  return (
    <Group gap={spacing.s3}>
      {stale ? (
        <>
          <SavedCopyNotice
            reason={staleReason}
            testID={staleReason ? 'bill-saved-copy' : 'bill-offline'}
          />
          <StaleNotice
            savedAt={savedAt}
            refreshing={refreshing}
            testID="bill-stale"
          />
          <Button
            label="Try again"
            onPress={onRefresh}
            loading={refreshing}
            testID="bill-refresh"
          />
        </>
      ) : null}
      <Text variant="label" tone="billsInk">
        {draft ? 'Exposure draft' : 'Bill'}
      </Text>
      <Heading level={1} testID="bill-title">
        {identity.title}
      </Heading>
      {identity.shortTitle && identity.shortTitle !== identity.title ? (
        <Text variant="metadata">Known as the {identity.shortTitle}</Text>
      ) : null}
      <Text variant="body" testID="bill-status">
        <Text variant="strong">{identity.statusLabel}</Text>
        {identity.statusAsOf
          ? `, as at ${formatDate(identity.statusAsOf)}`
          : ''}
      </Text>
      <FollowToggle
        kind="bill"
        id={identity.key}
        title={billName({
          title: identity.title,
          short_title: identity.shortTitle,
        })}
        testID="bill-follow"
      />
      {identity.introduced ? (
        <Text variant="metadata" wordSafe testID="bill-introduced">
          {identity.introducedLabel} {formatDate(identity.introduced)}
          {identity.house ? ` in the ${chamberLabel(identity.house)}` : ''}
        </Text>
      ) : null}
      <View testID="bill-sponsor" style={styles.sponsor}>
        {identity.sponsorMembers.length ? (
          <>
            <Text variant="metadata">
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
          </>
        ) : (
          <Text variant="metadata">
            {draft
              ? 'Government exposure draft, not yet introduced'
              : 'Sponsor not recorded'}
          </Text>
        )}
        {!identity.sponsorMembers.length && identity.sponsorParty ? (
          <RecordedParty party={identity.sponsorParty} />
        ) : null}
      </View>
      {identity.portfolio ? (
        <Text variant="metadata" testID="bill-portfolio">
          Portfolio: {identity.portfolio}
        </Text>
      ) : null}
      {view.related.map((related) => (
        <View key={related.key} testID={`bill-related-${related.key}`}>
          <Text variant="metadata">
            {related.relation === 'predecessor'
              ? 'Builds on'
              : billSentenceCase(related.relation)}
          </Text>
          <LinkRow
            title={related.title}
            onPress={() => bills.openBill(related.key, related.title)}
          />
          {related.note ? <Text variant="fine">{related.note}</Text> : null}
        </View>
      ))}
      {view.became ? (
        <LinkRow
          title="Introduced to Parliament as a bill"
          onPress={() => bills.openBill(view.became!)}
          testID="bill-became"
        />
      ) : null}
      {draft && consultation ? (
        <Group gap={spacing.s2} testID="bill-consultation">
          <Text variant="body">
            {consultation.closes
              ? `Consultation opened ${formatDate(consultation.opens)} and closes ${formatDate(consultation.closes)}`
              : `Open for consultation from ${formatDate(consultation.opens)}`}
          </Text>
          {consultation.note ? (
            <Text variant="fine">{consultation.note}</Text>
          ) : null}
          <SourceLink
            label="Consultation page"
            citation="Consultation page"
            url={consultation.url}
            kind="record"
            testID="bill-consultation-source"
          />
        </Group>
      ) : null}
    </Group>
  );
}

function Summary({ view }: { view: BillView }) {
  const summary = view.summary.data;
  if (!summary)
    return (
      <Section title="In short" accent="bills" testID="bill-summary">
        <EmptyState message="No summary yet." testID="bill-summary-none" />
        <Text variant="fine">{copy.noSummary}</Text>
      </Section>
    );
  const sentences = summary.sentences.filter(Boolean);
  const changes = summary.changes.filter(Boolean);
  const about = [
    summary.describes_version
      ? `Describes the bill ${summary.describes_version}.`
      : null,
    summary.as_of
      ? `Written from material dated ${formatDate(summary.as_of)}.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Section title="In short" accent="bills" testID="bill-summary">
      <MachineSummary
        attribution={summary.attribution}
        sentences={sentences}
        testID="bill-summary"
      />
      {changes.length ? (
        <SubSection title="What it changes">
          {changes.map((change, index) => (
            <Bullet key={index}>{change}</Bullet>
          ))}
        </SubSection>
      ) : null}
      {summary.affected ? (
        <SubSection title="Who is affected">
          <Text variant="body">{summary.affected}</Text>
        </SubSection>
      ) : null}
      {about ? <Text variant="fine">{about}</Text> : null}
      {view.summary.sources.length ? (
        <View style={styles.originals}>
          {view.summary.sources.map((source, index) => (
            <SourceLink
              key={`${source.label}-${index}`}
              label={source.label}
              citation={source.label}
              url={source.url}
              kind="record"
              testID={`bill-summary-source-${index}`}
            />
          ))}
        </View>
      ) : null}
    </Section>
  );
}

function KeyDates({ view }: { view: BillView }) {
  const timeline = billTimeline(view.keyDates.data ?? []);
  return (
    <Section
      title="Key dates"
      accent="bills"
      testID="bill-key-dates"
      info={
        timeline.folded
          ? {
              title: 'About these dates',
              notes: [
                `The register records a stage on each day it was before the house. These ${timeline.runs} stages carry ${timeline.dates} such dates: a stage that ran across sitting days is one stage with its span, not one a day.`,
              ],
              testID: 'bill-key-dates-info',
            }
          : undefined
      }
    >
      {timeline.entries.length ? (
        <RowList>
          {timeline.entries.map((entry, index) => (
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
      ) : (
        <EmptyState message="No dates recorded." testID="bill-dates-none" />
      )}
      <AsAtLine
        asOf={view.keyDates.asAt}
        citation={
          // Parliament's register for introduced bills; a draft's own release
          // and consultation pages otherwise.
          (view.keyDates.data ?? []).some((d) =>
            d.url?.startsWith('https://parlinfo.aph.gov.au/'),
          )
            ? catalogSources.bills.label
            : [...new Set(view.identity.sources.map((s) => s.label))]
        }
      />
    </Section>
  );
}

function Divisions({
  view,
  focused = false,
}: {
  view: BillView;
  focused?: boolean;
}) {
  const [all, setAll] = useState(false);
  const data = view.divisions.data!;
  const rows = data.rows;
  const shown = all ? rows : rows.slice(0, DIVISIONS_SHOWN);
  const rest = rows.length - shown.length;
  return (
    <Section
      title={focused ? undefined : 'Divisions'}
      accent="votes"
      testID="bill-divisions"
      info={
        rows.length
          ? {
              title: 'About divisions',
              notes: [
                copy.divisions,
                data.collapsed
                  ? `The source records some divisions more than once; ${data.collapsed} ${data.collapsed === 1 ? 'row' : 'rows'} identical in day, stage and counts ${data.collapsed === 1 ? 'is' : 'are'} shown here once.`
                  : null,
              ],
              testID: 'bill-divisions-info',
            }
          : undefined
      }
    >
      {focused ? (
        <Group>
          <Heading level={1} testID="bill-divisions-title">
            Bill divisions
          </Heading>
          <Text variant="metadata" testID="bill-divisions-bill-name">
            {billName({
              title: view.identity.data!.title,
              short_title: view.identity.data!.shortTitle,
            })}
          </Text>
          <LinkRow
            title="Full bill details"
            onPress={() => router.push(billRoute(view.identity.data!.key))}
            testID="bill-divisions-details"
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
              basisNote={data.partyBasisNote}
            />
          ))}
        </RowList>
      ) : (
        <>
          <EmptyState
            message="No divisions recorded."
            testID="bill-divisions-none"
          />
          <Text variant="fine">{copy.noDivisions}</Text>
        </>
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
        <AsAtLine
          asOf={view.divisions.asAt}
          citation="They Vote For You"
          licence="ODbL"
        />
      ) : null}
    </Section>
  );
}

function DivisionItem({
  division,
  index,
  basisNote,
}: {
  division: Division;
  index: number;
  basisNote: string;
}) {
  const date = formatDate(division.date, 'short');
  const title =
    division.head ||
    [division.stageLabel || 'Division', date].filter(Boolean).join(', ');
  const meta = [
    division.head && division.stageLabel ? division.stageLabel : null,
    chamberLabel(division.house),
    division.head ? date : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const outcome = division.outcomeLabel || 'Outcome not recorded';
  const counts = `${formatCount(division.ayes)} ayes, ${formatCount(division.noes)} noes`;
  return (
    <View style={styles.division} testID={`bill-division-${index}`}>
      <Text variant="strong">{title}</Text>
      {meta ? (
        <Text variant="metadata" wordSafe>
          {meta}
        </Text>
      ) : null}
      <View
        accessible
        accessibilityLabel={`${outcome}, ${counts}`}
        testID={`bill-division-${index}-outcome`}
        style={styles.outcome}
      >
        <StatusLabel label={outcome} hidden />
        <Text variant="strong" tabular>
          {counts}
        </Text>
      </View>
      <PartySplits
        splits={division.splits}
        basisNote={basisNote}
        testID={`bill-division-${index}-splits`}
      />
      <SourceLink
        citation="They Vote For You"
        record={`division, ${date}`}
        url={division.url}
        kind="record"
        testID={`bill-division-${index}-source`}
      />
      {/* The record's prose comes after the counts and source; a long note
          folds so the next division is never buried under it. */}
      <DivisionNote
        note={division.note}
        links={division.noteLinks}
        testID={`bill-division-${index}-note`}
      />
    </View>
  );
}

function Speeches({ view }: { view: BillView }) {
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
                <OpaxWebLink
                  label="Read the speech"
                  path={speech.url}
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
        <Text variant="fine">
          Speeches the record attaches to this bill.{' '}
          {briefs ? copy.briefs : 'Open a speech to read it in full.'}
        </Text>
      ) : null}
    </Section>
  );
}

function Acts({ view }: { view: BillView }) {
  const acts = (view.acts.data ?? []).filter((a) => a.title);
  const passed = /passed|assent/i.test(view.identity.data?.status ?? '');
  if (!acts.length && !passed) return null;
  return (
    <Section title="What became law" accent="bills" testID="bill-acts">
      {acts.length ? (
        <RowList>
          {acts.map((act, index) => (
            <Group key={act.frl_uri} gap={spacing.s1}>
              <Text wordSafe variant="strong">
                {act.title}
              </Text>
              <Text variant="metadata">
                {act.assent_date
                  ? `Assented ${formatDate(act.assent_date, 'short')}`
                  : 'Assent date not recorded'}
              </Text>
              <SourceLink
                label="Act text"
                citation={act.title}
                record={
                  act.assent_date
                    ? `assented ${formatDate(act.assent_date, 'short')}`
                    : 'assent date not recorded'
                }
                url={act.frl_uri}
                kind="record"
                testID={`bill-act-${index}`}
              />
            </Group>
          ))}
        </RowList>
      ) : (
        <EmptyState message="No Act matched to this bill yet." />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  sponsor: { gap: spacing.s1 },
  date: { flexDirection: 'row', gap: spacing.s3, alignItems: 'flex-start' },
  dateText: { flex: 1, gap: 2 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
    backgroundColor: colors.billsInk,
  },
  originals: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.s4,
    rowGap: spacing.s1,
  },
  outcome: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.s3,
  },
  division: { gap: spacing.s3 },
  speech: { gap: spacing.s2 },
  speechMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.s3,
  },
});
