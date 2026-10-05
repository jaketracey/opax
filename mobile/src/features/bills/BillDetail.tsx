import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  billName,
  billSentenceCase,
  billStage,
  billTimeline,
  type BillTimelineStage,
} from '../../api/bill-transforms';
import { billKey, catalogSources, type PersonSlug } from '../../api/catalogs';
import { ApiError } from '../../api/errors';
import { catalogs } from '../../api/runtime';
import { formatCount, formatDate } from '../../design/format';
import { jurisdictionName } from '../../design/parliament';
import {
  AsAtLine,
  Button,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  LoadingState,
  OfflineBanner,
  OpaxWebLink,
  RowList,
  Screen,
  Section,
  SourceLink,
  StaleNotice,
  SubSection,
  Text,
  errorMessage,
} from '../../design/primitives';
import { chrome, spacing } from '../../design/tokens';
import { billRoute, personRoute } from '../../navigation/routes';
import { shareHeaderItem } from '../../navigation/share';
import { chamberLabel } from './filters';
import {
  Bullet,
  DivisionNote,
  InlineLink,
  MachineBrief,
  PartySplits,
  RecordedParty,
  dateSpan,
} from './parts';
import { sponsorSlug } from './sponsors';
import { useCatalogRecord } from './useCatalogRecord';

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
  acts: 'Act text on the Federal Register of Legislation, CC BY 4.0.',
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
export default function BillDetail() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const load = useCallback(() => catalogs.billFor(String(key)), [key]);
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  const [sponsors, setSponsors] = useState<Record<string, PersonSlug>>({});
  const view = record?.data;
  const identity = view?.identity.data ?? null;
  // Sponsors link to their profile only where the roster and the directory
  // agree on who they are; otherwise the name stays plain text.
  useEffect(() => {
    const members = identity?.sponsorMembers ?? [];
    if (!members.length) return;
    let active = true;
    Promise.all([catalogs.roster(), catalogs.slugs()])
      .then(([roster, slugs]) => {
        if (!active) return;
        const found: Record<string, PersonSlug> = {};
        for (const member of members) {
          const slug = sponsorSlug(
            member.name,
            roster.data,
            slugs.data,
            members.length === 1 ? identity?.sponsorPersonId : null,
          );
          if (slug) found[member.name] = slug;
        }
        setSponsors(found);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [identity]);

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
      <Stack.Screen
        options={{
          // The title is the page's level 1 heading; `title` still names the
          // screen for the back stack.
          title: name,
          headerTitle: '',
          unstable_headerRightItems: identity
            ? () => [
                shareHeaderItem({ path: `/bill/${identity.key}`, title: name }),
              ]
            : undefined,
        }}
      />
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
            <BillHead
              view={view}
              sponsors={sponsors}
              stale={record.stale}
              savedAt={record.savedAt}
              refreshing={refreshing}
              onRefresh={refresh}
            />
            <Summary view={view} />
            <KeyDates view={view} />
            <Divisions view={view} />
            <Speeches view={view} />
            <Acts view={view} />
            <Section title="Sources" testID="bill-sources">
              {view.identity.sources.length ? (
                view.identity.sources.map((source, index) => (
                  <SourceLink
                    key={`${source.label}-${index}`}
                    citation={source.label}
                    url={source.url}
                    kind="record"
                    testID={`bill-source-${index}`}
                  />
                ))
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
              <OpaxWebLink
                label="This bill on opax.com.au"
                path={`/bill/${identity.key}`}
                testID="bill-web"
              />
              <Text variant="fine">{copy.fineprint}</Text>
            </Section>
          </>
        ) : null}
      </Screen>
    </>
  );
}

function BillHead({
  view,
  sponsors,
  stale,
  savedAt,
  refreshing,
  onRefresh,
}: {
  view: BillView;
  sponsors: Record<string, PersonSlug>;
  stale: boolean;
  savedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const identity = view.identity.data!;
  const draft = identity.status === 'exposure_draft';
  const consultation = view.consultation.data;
  return (
    <Group gap={spacing.s3}>
      {stale ? (
        <>
          <OfflineBanner testID="bill-offline" />
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
      <Text variant="kicker">{draft ? 'Exposure draft' : 'Bill'}</Text>
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
            {identity.sponsorMembers.map((member) => {
              const label = member.suffix
                ? `${member.name} ${member.suffix}`
                : member.name;
              const slug = sponsors[member.name];
              return slug ? (
                <InlineLink
                  key={member.name}
                  label={label}
                  accessibilityLabel={`${label}, profile`}
                  onPress={() => router.push(personRoute(slug))}
                  testID={`bill-sponsor-${slug}`}
                />
              ) : (
                <Text wordSafe key={member.name} variant="strong">
                  {label}
                </Text>
              );
            })}
          </>
        ) : (
          <Text variant="metadata">
            {draft
              ? 'Government exposure draft, not yet introduced'
              : 'Sponsor not recorded'}
          </Text>
        )}
        {identity.sponsorParty ? (
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
          <InlineLink
            label={related.title}
            onPress={() => router.push(billRoute(related.key))}
          />
          {related.note ? <Text variant="fine">{related.note}</Text> : null}
        </View>
      ))}
      {view.became ? (
        <InlineLink
          label="Introduced to Parliament as a bill"
          onPress={() => router.push(billRoute(view.became!))}
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
      <Section title="In short" testID="bill-summary">
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
    <Section title="In short" testID="bill-summary">
      {/* The attribution comes first, so no reader meets the summary as the
          record: the label, then the stored attribution in full. */}
      <Group gap={spacing.s1}>
        <Text variant="kicker" testID="bill-summary-label">
          Machine summary
        </Text>
        <Text variant="fine" testID="bill-summary-attribution">
          {summary.attribution}.
        </Text>
      </Group>
      <Group gap={spacing.s3} testID="bill-summary-text">
        {sentences.map((sentence, index) => (
          <Text key={index} variant="body">
            {sentence}
          </Text>
        ))}
      </Group>
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
      {view.summary.sources.map((source, index) => (
        <SourceLink
          key={`${source.label}-${index}`}
          citation={source.label}
          url={source.url}
          kind="record"
          testID={`bill-summary-source-${index}`}
        />
      ))}
    </Section>
  );
}

function KeyDates({ view }: { view: BillView }) {
  const timeline = billTimeline(view.keyDates.data ?? []);
  return (
    <Section title="Key dates" testID="bill-key-dates">
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
              <Text variant="strong">{dateSpan(entry.from, entry.to)}</Text>
              {entry.stages.map((stage, i) => (
                <Text key={i} variant="metadata" wordSafe>
                  {stageText(stage)}
                </Text>
              ))}
            </View>
          ))}
        </RowList>
      ) : (
        <EmptyState message="No dates recorded." testID="bill-dates-none" />
      )}
      {timeline.folded ? (
        <Text variant="fine">
          The register records a stage on each day it was before the house.
          These {timeline.runs} stages carry {timeline.dates} such dates: a
          stage that ran across sitting days is one stage with its span, not one
          a day.
        </Text>
      ) : null}
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

function Divisions({ view }: { view: BillView }) {
  const [all, setAll] = useState(false);
  const data = view.divisions.data!;
  const rows = data.rows;
  const shown = all ? rows : rows.slice(0, DIVISIONS_SHOWN);
  const rest = rows.length - shown.length;
  return (
    <Section title="Divisions" testID="bill-divisions">
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
          onPress={() => setAll(true)}
          testID="bill-divisions-more"
        />
      ) : null}
      {rows.length ? (
        <Text variant="fine">
          {copy.divisions}
          {data.collapsed
            ? ` The source records some divisions more than once; ${data.collapsed} ${data.collapsed === 1 ? 'row' : 'rows'} identical in day, stage and counts ${data.collapsed === 1 ? 'is' : 'are'} shown here once.`
            : ''}
        </Text>
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
      <Text
        variant="body"
        accessibilityLabel={`${outcome}, ${counts}`}
        testID={`bill-division-${index}-outcome`}
      >
        <Text variant="strong">{outcome}</Text> · {counts}
      </Text>
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
    <Section title="Speeches" testID="bill-speeches">
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
    <Section title="What became law" testID="bill-acts">
      {acts.length ? (
        acts.map((act, index) => (
          <SourceLink
            key={act.frl_uri}
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
        ))
      ) : (
        <EmptyState message="No Act matched to this bill yet." />
      )}
      {acts.length ? <Text variant="fine">{copy.acts}</Text> : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  sponsor: { gap: spacing.s1 },
  date: { gap: spacing.s1 },
  division: { gap: spacing.s3 },
  speech: { gap: spacing.s2 },
  speechMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.s3,
  },
});
