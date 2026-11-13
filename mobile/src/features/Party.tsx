import { associatedLine, donorAssociatedTo } from '../api/associated';
import { RouteOptions } from '../navigation/preview';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Platform,
  RefreshControl,
  StyleSheet,
  View,
  type ScrollView,
} from 'react-native';
import type { PartyPageRecord } from '../api/catalogs';
import { nameKey } from '../api/ids';
import type { PartyMember } from '../api/party-page';
import { apiClient, catalogs, portraits } from '../api/runtime';
import { useReduceMotion } from '../design/accessibility';
import { useLayout } from '../design/adaptive';
import { Disclosure } from '../design/disclosure';
import {
  counted,
  disclosureYearNote,
  formatCount,
  formatDate,
  formatMoney,
  formatMoneyCompact,
  moneyAccessibilityLabel,
} from '../design/format';
import { Group, Screen, Section, TitleAnchor } from '../design/layout';
import { isPartyLabel, partySlug } from '../design/party';
import { FaceStack, PersonRow } from '../design/people';
import { StatStrip, type StatTileProps } from '../design/record';
import { DivisionRow, LinkRow, MoneyRow } from '../design/rows';
import { SourceLine } from '../design/source';
import {
  ContentUnavailable,
  InlineError,
  LoadingState,
  Skeleton,
} from '../design/states';
import { Text } from '../design/text';
import { rhythm } from '../design/tokens';
import { useHeaderBottom } from '../design/useHeaderBottom';
import { headerItems, pageItems } from '../navigation/chrome';
import { openOnWeb } from '../navigation/external';
import {
  billRoute,
  moneyRecordRoute,
  partySourcesRoute,
  personRoute,
} from '../navigation/routes';
import type { PartySection } from '../navigation/routes/people';
import { shareRecord } from '../navigation/share';
import { stageTitle } from './bills/divisions';
import { chamberLabel } from './bills/filters';
import { useCatalogRecord } from './bills/useCatalogRecord';
import { CachedPortrait } from './CachedPortrait';
import { AddedSinceGroup } from './follows/AddedSinceGroup';
import type { Change } from './follows/changes';
import { NewDot } from './follows/NewDot';
import { followKey, useFollows } from './follows/store';
import { useFollowStates } from './follows/useFollowStates';
import { ProfileBlock } from './people/Block';
import { decodeMoneyGraph, moneyCatalogs, type MoneyGraph } from './money/data';
import { associatedEntityRoute } from './money/record-routes';
import { donorNodeFor } from './money/lookup';
import { usePageActions } from './people/PageActions';
import { partyTimingID } from './people/party-timing';
import {
  FundingError,
  FundingLoading,
  PartyAccess,
  PartyDebts,
  PartyReturns,
  fundingNotes,
  hasFunding,
  usePartyFunding,
} from './people/PartyDepth';
import { ProfileHeader } from './people/ProfileHeader';
import { MoreFromRecord } from './people/Sections';
import { SurfaceGrid } from './today/SurfaceGrid';
import { profileGrid } from './split/grid';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const partyArrival = (v: unknown): PartySection | undefined =>
  v === 'members' || v === 'receipts' || v === 'changes' ? v : undefined;

async function openAssociatedEntity(name: string) {
  let graph: MoneyGraph | null = null;
  try {
    graph = (await apiClient.get(moneyCatalogs.federal.path, decodeMoneyGraph))
      .data;
  } catch {
    // A name search is still available when the donor index cannot be read.
  }
  router.push(associatedEntityRoute(name, graph));
}

/** Sitting party members across federal, state and territory parliaments. */
export const partyMembersRoute = (label: string, sitting = true): Href => ({
  pathname: '/directory',
  params: {
    kind: 'person',
    party: label,
    ...(sitting ? { sitting: '1' } : {}),
  },
});

export default function Party() {
  const params = useLocalSearchParams<{
    slug: string;
    name?: string;
    section?: string;
  }>();
  const slug = one(params.slug) ?? '';
  return (
    <PartyPage
      key={slug}
      input={one(params.name) ?? slug}
      arrival={partyArrival(one(params.section))}
    />
  );
}

type View_ = NonNullable<PartyPageRecord['data']>;

function AssociatedEntityRows({
  rows,
  party,
}: {
  rows: NonNullable<View_['associated']['data']>['rows'];
  party: string;
}) {
  const [graph, setGraph] = useState<MoneyGraph | null>();
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => apiClient.get(moneyCatalogs.federal.path, decodeMoneyGraph))
      .then(
        (record) => {
          if (active) setGraph(record?.data ?? null);
        },
        () => {
          if (active) setGraph(null);
        },
      );
    return () => {
      active = false;
    };
  }, [rows]);
  return (
    <View>
      {rows.slice(0, 8).map((entity, index) => (
        <LinkRow
          key={entity.name}
          title={entity.name}
          detail={[
            associatedLine(
              donorAssociatedTo(
                donorNodeFor({ name: entity.name }, graph ?? null),
                party,
              ),
            ),
            entity.year,
            entity.receipts !== null
              ? `receipts ${formatMoney(entity.receipts)}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          onPress={() => openAssociatedEntity(entity.name)}
          testID={`party-associated-${index}`}
        />
      ))}
    </View>
  );
}

export function PartyPage({
  input,
  arrival,
  embedded = false,
}: {
  input: string;
  arrival?: PartySection;
  /** In an iPad split pane: no navigation bar items. */
  embedded?: boolean;
}) {
  // "Independent" is a label, not a party: no page, no read.
  const notAParty = !isPartyLabel(input) && /^independent/i.test(input);
  const load = useCallback(
    (
      refresh: boolean,
      publish: (record: PartyPageRecord) => void,
      signal?: AbortSignal,
    ) =>
      notAParty
        ? new Promise<PartyPageRecord>(() => {})
        : catalogs.partyPage(input, refresh, publish, signal),
    [input, notAParty],
  );
  const { record, error, refresh, retry, refreshing } = useCatalogRecord(load);
  const view = notAParty ? null : (record?.data ?? null);
  const label = view?.label ?? input;
  const webPath = `/subject/party/${encodeURIComponent(label)}`;
  const menu = usePageActions({ kind: 'party', name: label, webPath });
  const pending = notAParty ? (
    <ContentUnavailable
      symbol="person.3"
      title="Not a party"
      body="Independent members each have their own profile."
      action={{
        label: 'See independent members',
        onPress: () => router.push(partyMembersRoute('Independent', false)),
        testID: 'party-not-a-party-action',
      }}
      testID="party-not-a-party"
    />
  ) : record && !record.data ? (
    // A resolved absence after a successful catalog read: never Safari.
    <ContentUnavailable
      symbol="person.3"
      title="This party isn’t in OPAX’s records yet"
      body="Its page may be on opax.com.au."
      action={{
        label: 'Open on opax.com.au',
        onPress: () => void openOnWeb(webPath, input),
        testID: 'party-not-found-web',
      }}
      testID="party-not-found"
    />
  ) : error && !record ? (
    <ContentUnavailable
      symbol="exclamationmark.triangle"
      title="Couldn’t load this party"
      body="Check your connection and try again."
      action={{ label: 'Try again', onPress: retry, testID: 'party-retry' }}
      testID="party-error"
    />
  ) : !view ? (
    <>
      <LoadingState
        shape="text"
        count={2}
        label="Loading party"
        testID="party-loading"
      />
      <Skeleton shape="rows" count={3} label="Loading party" />
    </>
  ) : null;
  return (
    <>
      {embedded ? null : (
        <RouteOptions
          stableItems
          options={{
            // The back button on the next page names this one.
            title: view?.label ?? '',
            ...headerItems(
              view
                ? pageItems({
                    name: view.label,
                    share: () =>
                      void shareRecord({ path: webPath, title: view.label }),
                    menu,
                  })
                : undefined,
            ),
          }}
        />
      )}
      {pending || !view ? (
        <Screen
          column="wide"
          testID="party-screen"
          // "Not a party" makes no read, so a pull would spin forever.
          refreshControl={
            notAParty ? undefined : (
              <RefreshControl refreshing={refreshing} onRefresh={refresh} />
            )
          }
        >
          {pending}
        </Screen>
      ) : (
        <PartyContent
          view={view}
          arrival={arrival}
          refreshing={refreshing}
          refresh={refresh}
          retry={retry}
        />
      )}
    </>
  );
}

/**
 * The members to try for the Members row's faces, in order. The list can
 * open on members with no portrait (a new member, a state member), so the
 * people with one in the portrait index come first, federal members ahead
 * of state ones, each in the list's own order. Each person once.
 */
export function faceCandidates(
  members: readonly PartyMember[],
  hasPortrait: (member: PartyMember) => boolean,
): PartyMember[] {
  const seen = new Set<string>();
  const people = members.filter((m) => {
    if (seen.has(m.slug)) return false;
    seen.add(m.slug);
    return true;
  });
  const rank = (m: PartyMember) =>
    (hasPortrait(m) ? 0 : 2) + (m.jurisdiction === 'federal' ? 0 : 1);
  // Array.prototype.sort is stable: ties keep the list's order.
  return people.sort((a, b) => rank(a) - rank(b));
}

const FACES = 6;
/** At most this many portraits are read to find the six faces. */
const FACE_READS = 18;

/**
 * Up to six sitting members' portraits for the Members row, as other face
 * stacks show them: only faces that load. A portrait that fails is skipped
 * for the next member, never drawn as a blank circle. Six blank circles
 * hold the row's shape while the portraits load.
 */
export async function loadFaces(
  candidates: readonly PartyMember[],
  read: (member: PartyMember) => Promise<string | null>,
): Promise<string[]> {
  const found: string[] = [];
  const tries = candidates.slice(0, FACE_READS);
  for (let at = 0; at < tries.length && found.length < FACES; ) {
    const batch = tries.slice(at, at + FACES - found.length);
    at += batch.length;
    const uris = await Promise.all(batch.map((m) => read(m).catch(() => null)));
    for (const uri of uris) if (uri) found.push(uri);
  }
  return found;
}

function useFaces(members: readonly PartyMember[]) {
  const key = members.map((m) => `${m.jurisdiction}|${m.slug}`).join(',');
  const [faces, setFaces] = useState<{ key: string; uris: string[] }>();
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => portraits?.list())
      .catch(() => undefined)
      .then((listed) => {
        const slugs = new Set(listed?.map((p) => p.slug));
        const names = new Set(listed?.map((p) => nameKey(p.name)));
        return loadFaces(
          faceCandidates(
            members,
            (m) => slugs.has(m.slug) || names.has(nameKey(m.name)),
          ),
          async (m) =>
            (await portraits?.get({ name: m.name, slug: m.slug }))?.localURI ??
            null,
        );
      })
      .catch(() => [])
      .then((uris) => {
        if (active) setFaces({ key, uris });
      });
    return () => {
      active = false;
    };
    // `key` names the members; `members` is the same list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return faces?.key === key
    ? faces.uris
    : Array.from({ length: Math.min(FACES, members.length) }, () => null);
}

function PartyContent({
  view,
  arrival,
  refreshing,
  refresh,
  retry,
}: {
  view: View_;
  arrival?: PartySection;
  refreshing: boolean;
  refresh: () => void;
  retry: () => void;
}) {
  const label = view.label;
  const [titleTiming, setTitleTiming] = useState<string | undefined>();
  const scroll = useRef<ScrollView>(null);
  const y = useRef<Partial<Record<PartySection, number>>>({});
  const headerBottom = useHeaderBottom();
  const reduceMotion = useReduceMotion();
  const funding = usePartyFunding();
  const layout = useLayout();
  const members = view.members.data;
  const faces = useFaces(members?.current ?? []);

  // A tile, a change row or `?section=` asks for a section.
  const [goTo, setGoTo] = useState<{
    to: PartySection;
    animated: boolean;
    at: number;
  } | null>(null);
  const jump = (to: PartySection) =>
    setGoTo({ to, animated: !reduceMotion, at: Date.now() });
  useEffect(() => {
    if (!goTo) return;
    const top = y.current[goTo.to];
    if (top === undefined) return;
    const offset = Platform.OS === 'ios' ? headerBottom : 0;
    scroll.current?.scrollTo({
      y: Math.max(0, top - offset - rhythm.heading),
      animated: goTo.animated,
    });
  }, [goTo, headerBottom]);
  const arrived = useRef(false);
  const placed = (to: PartySection) => (top: number) => {
    y.current[to] = top;
    if (arrival === to && !arrived.current) {
      arrived.current = true;
      setGoTo({ to, animated: false, at: Date.now() });
    }
  };

  // What changed since the reader last looked, for a followed party.
  const follows = useFollows();
  const { states } = useFollowStates();
  const id = partySlug(label);
  const follow = (follows ?? []).find(
    (f) => followKey(f) === followKey({ kind: 'party', id }),
  );
  const state = follow ? states.get(followKey(follow)) : undefined;
  const changes = useMemo<readonly Change[]>(
    () => (state?.status === 'ready' ? state.changes : []),
    [state],
  );
  const newMembers = changes.some((c) => c.marker === 'members');
  const newReturns = changes.some((c) => c.marker === 'returns');

  // The strip: two tiles, each reading its section's figure.
  const receipts = view.receipts.data;
  const tiles: StatTileProps[] = [];
  if (members && view.members.status !== 'error')
    tiles.push({
      value: formatCount(members.currentCount),
      label: members.currentCount === 1 ? 'sitting member' : 'sitting members',
      onPress: () => jump('members'),
      testID: 'party-figure-members',
    });
  if (receipts && view.receipts.status !== 'error')
    tiles.push({
      value: formatMoneyCompact(receipts.node.total),
      label: 'disclosed receipts',
      onPress: () => jump('receipts'),
      testID: 'party-figure-receipts',
    });
  const stripCitations = [
    tiles.some((t) => t.testID === 'party-figure-members')
      ? {
          label: 'Parliamentary roster',
          title: 'Parliamentary roster (members)',
          asOf: view.members.asAt ?? view.rosterAsAt,
        }
      : null,
    tiles.some((t) => t.testID === 'party-figure-receipts')
      ? {
          label: 'AEC disclosure returns',
          title: 'AEC disclosure returns (receipts)',
          asOf: view.receipts.asAt,
        }
      : null,
  ]
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => String(a.asOf ?? '~').localeCompare(String(b.asOf ?? '~')));

  const divisions = view.divisions.data;
  const associated = view.associated.data;
  const fundingRecord =
    funding.read.status === 'ready' ? funding.read.value : null;
  const showDebts =
    funding.read.status !== 'ready' ||
    !!fundingRecord?.data.parties[label]?.debts ||
    !!associated?.rows.length ||
    view.associated.status === 'error' ||
    view.associated.status === 'loading';

  // At regular width, related sections pair (people.md 2.2):
  // Members with Recent votes, Receipts with Debts and associated entities.
  // Compact windows keep one column in their own order.
  const pairs = layout.regular;
  const membersSection = (
    <ProfileBlock
      title="Members"
      id="party-members"
      block={view.members}
      retry={retry}
      action={
        view.members.data
          ? {
              label: 'See all',
              accessibilityLabel: `See all ${counted(view.members.data.currentCount, `${label} member`)}`,
              href: partyMembersRoute(label),
              testID: 'party-members-all',
            }
          : undefined
      }
      about={() => ({
        title: 'Members',
        notes: [
          'Sitting members include federal, state and territory parliamentarians with a confirmed current party affiliation. The directory is updated periodically. Undated affiliations appear separately as recorded; former members are excluded.',
          view.rosterAsAt
            ? `Roster as at ${formatDate(view.rosterAsAt)}.`
            : null,
        ],
      })}
    >
      {(data) => (
        <View>
          <LinkRow
            title={counted(data.currentCount, 'sitting member')}
            leading={
              <View style={styles.faces}>
                {newMembers ? <NewDot testID="party-members-new" /> : null}
                <FaceStack portraits={faces} />
              </View>
            }
            href={partyMembersRoute(label)}
            accessibilityLabel={`${counted(data.currentCount, `sitting ${label} member`)}${newMembers ? '. New' : ''}`}
            accessibilityHint={`Opens Parliamentarians filtered to ${label}`}
            testID="party-current-count"
          />

          {data.recorded.length ? (
            <Disclosure
              label="Recorded affiliation"
              value={formatCount(data.recorded.length)}
              testID="party-recorded-toggle"
            >
              {() => (
                <View>
                  {data.recorded.map((member) => (
                    <PersonRow
                      key={member.slug}
                      name={member.name}
                      portrait={
                        <CachedPortrait name={member.name} slug={member.slug} />
                      }
                      place={member.place || undefined}
                      href={personRoute(member.slug, member.name)}
                      testID={`party-member-${member.slug}`}
                      testDrawnName
                    />
                  ))}
                  <Text wordSafe variant="footnote">
                    Their current membership is not confirmed.
                  </Text>
                </View>
              )}
            </Disclosure>
          ) : null}
        </View>
      )}
    </ProfileBlock>
  );
  const receiptsSection = (
    <ProfileBlock
      title="Receipts"
      id="party-receipts"
      block={view.receipts}
      retry={retry}
      skeleton="figure"
      citation="AEC disclosure returns"
      licenceDataset="aec"
      about={() => ({
        title: 'Receipts',
        notes: [
          'AEC disclosure data: donations under the disclosure threshold are not reported and cannot appear here, so totals are a floor, not a ceiling.',
          'Sources are the largest donor-to-party flows in the disclosure returns, largest first; they are not all of the party’s receipts. No sequence or causal link is inferred.',
          disclosureYearNote,
          ...(fundingRecord ? fundingNotes(fundingRecord, label) : []),
        ],
      })}
    >
      {(data) => (
        <Group>
          <View
            accessible
            accessibilityLabel={`${moneyAccessibilityLabel(data.node.total)}, disclosed`}
            testID="party-receipts-total"
          >
            <Text wordSafe variant="figure" tone="moneyInk" tabular>
              {formatMoney(data.node.total)}
            </Text>
            <Text wordSafe variant="secondary">
              {[
                `disclosed, from ${formatCount(data.node.count)} ${data.node.count === 1 ? 'donation or receipt' : 'donations and receipts'}`,
                data.node.firstYear !== undefined &&
                data.node.lastYear !== undefined
                  ? data.node.firstYear === data.node.lastYear
                    ? String(data.node.firstYear)
                    : `${data.node.firstYear} to ${data.node.lastYear}`
                  : null,
              ]
                .filter(Boolean)
                .join(', ')}
            </Text>
          </View>
          <Text wordSafe variant="footnote" testID="party-money-caveat">
            A floor, not a ceiling.
          </Text>
          <View>
            {data.donors.slice(0, 8).map((donor, i) => (
              <MoneyRow
                key={donor.id}
                name={donor.name}
                detail={donor.associated ?? undefined}
                amount={donor.amount}
                compact
                href={moneyRecordRoute({ node: donor.id }, donor.name)}
                testID={`party-donor-${i}`}
              />
            ))}
            <LinkRow
              title="Largest sources by year"
              href={partySourcesRoute(id, label)}
              testID="party-donor-years-toggle"
            />
            <LinkRow
              title="Money map"
              href={moneyRecordRoute({ node: `party:${label}` }, label)}
              testID="party-money-map"
            />
          </View>
          {funding.read.status === 'loading' ? (
            <FundingLoading />
          ) : funding.read.status === 'error' ? (
            <FundingError retry={funding.retry} />
          ) : fundingRecord ? (
            <View>
              {newReturns ? <NewDot testID="party-returns-new" /> : null}
              <PartyReturns record={fundingRecord} name={label} />
            </View>
          ) : null}
        </Group>
      )}
    </ProfileBlock>
  );
  const debtsSection = showDebts ? (
    <Section
      title="Debts and associated entities"
      testID="party-debts-section"
      headingTestID="party-debts-section-heading"
    >
      <Group>
        {funding.read.status === 'loading' ? (
          <FundingLoading />
        ) : funding.read.status === 'error' &&
          (view.receipts.status === 'error' || view.receipts.data === null) ? (
          // Receipts draws no funding error when it is in error itself or
          // has nothing to show: say it once here.
          <FundingError retry={funding.retry} />
        ) : fundingRecord ? (
          <PartyDebts record={fundingRecord} name={label} />
        ) : null}
        {view.associated.status === 'loading' ? (
          <Skeleton
            shape="rows"
            count={3}
            label="Loading associated entities"
            testID="party-associated-loading"
          />
        ) : view.associated.status === 'error' ? (
          <InlineError
            subject="Associated entities"
            onRetry={retry}
            testID="party-associated-error"
          />
        ) : associated?.rows.length ? (
          <View style={styles.block} testID="party-associated">
            <Text wordSafe variant="subsectionTitle" accessibilityRole="header">
              Associated entities
            </Text>
            <AssociatedEntityRows rows={associated.rows} party={label} />
            {associated.total > Math.min(8, associated.rows.length) ? (
              <Text wordSafe variant="footnote">
                {`${formatCount(Math.min(8, associated.rows.length))} of ${formatCount(associated.total)} shown, largest receipts first.`}
              </Text>
            ) : null}
          </View>
        ) : null}
        {fundingRecord || associated ? (
          <SourceLine
            title="Debts and associated entities"
            asOf={
              [fundingRecord?.asOf, view.associated.asAt]
                .filter(Boolean)
                .sort()[0] ?? null
            }
            citation={[
              fundingRecord
                ? {
                    label: 'AEC annual returns',
                    asOf: fundingRecord.asOf,
                  }
                : null,
              associated
                ? {
                    label: 'AEC associated entity returns',
                    asOf: view.associated.asAt,
                  }
                : null,
            ]}
            state={view.associated.partial ? 'partial' : null}
            originals={
              fundingRecord
                ? [
                    {
                      label: 'AEC Transparency Register',
                      url: fundingRecord.data.meta.register_url,
                    },
                  ]
                : []
            }
            notes={[
              'Debts are the balances owed at 30 June, not new borrowing. Creditors under the disclosure threshold are not itemised.',
              'Associated entities are the entities’ own annual returns. They are not added to the party’s receipts. Names are matched on case, punctuation and company suffixes only; the same body under two spellings appears twice.',
              fundingRecord && !hasFunding(fundingRecord, label)
                ? 'No annual return or debt is itemised for this party.'
                : null,
            ]}
            licenceDataset="aec"
            testID="party-debts-source"
          />
        ) : null}
      </Group>
    </Section>
  ) : null;
  const votesSection =
    view.divisions.status === 'error' ||
    view.divisions.status === 'loading' ||
    divisions?.rows.length ||
    (divisions?.failed && !divisions.scanned) ? (
      <ProfileBlock
        title="Recent votes"
        id="party-divisions"
        block={view.divisions}
        retry={retry}
        errorSubject="Votes"
        citation="They Vote For You"
        licenceDataset="tvfy"
        about={(data) => ({
          title: 'Recent votes',
          notes: [
            data
              ? `From the ${formatCount(data.scanned)} most recent bills with recorded votes. This party’s own members’ votes, newest first; not its whole voting history.`
              : null,
            'A division is a recorded vote: each member’s choice is counted and published.',
            'Party is each member’s recorded affiliation, not a reconstruction of who they sat with on the day. A division on an amendment is not a vote on the bill itself.',
            data?.basisNote,
            data?.failed
              ? `${counted(data.failed, 'bill', 'bills')} could not be read. This block is partial.`
              : null,
          ],
        })}
        line={(data) => ({
          partial: !!data?.failed,
          coverage: data?.rows.length
            ? `Divisions to ${formatDate(data.rows[0]!.division.date, 'short')}`
            : null,
        })}
      >
        {(data) =>
          data.failed && !data.scanned ? (
            <InlineError
              subject="Votes"
              onRetry={retry}
              testID="party-divisions-error"
            />
          ) : (
            <View>
              {data.rows.slice(0, 10).map((row) => (
                <PartyDivision key={rowKey(row)} row={row} label={label} />
              ))}
              {data.rows.length > 10 ? (
                <Disclosure
                  label={`Show all ${formatCount(data.rows.length)}`}
                  testID="party-divisions-all"
                >
                  {() =>
                    data.rows
                      .slice(10)
                      .map((row) => (
                        <PartyDivision
                          key={rowKey(row)}
                          row={row}
                          label={label}
                        />
                      ))
                  }
                </Disclosure>
              ) : null}
              <Text wordSafe variant="footnote">
                {`From the ${formatCount(data.scanned)} most recent bills with recorded votes.`}
              </Text>
            </View>
          )
        }
      </ProfileBlock>
    ) : null;

  // ProfileHeader owns the H1, so Screen cannot find it among its children.
  // Match the person's measured title handover on iOS only.
  const ProfileTitle = Platform.OS === 'ios' ? TitleAnchor : Fragment;
  return (
    <Screen
      column="wide"
      barTitle={label}
      scrollRef={scroll}
      testID="party-screen"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <View style={styles.top} testID={titleTiming ?? 'party'}>
        <ProfileTitle>
          <ProfileHeader
            variant="party"
            name={label}
            follow={{ kind: 'party', id }}
            testID="party"
            titleTestID="party-title"
            onTitleLayout={() => {
              if (!titleTiming) setTitleTiming(partyTimingID());
            }}
          />
        </ProfileTitle>
        {tiles.length ? (
          <StatStrip tiles={tiles} testID="party-figures" />
        ) : null}
      </View>
      {follow && changes.length ? (
        <View onLayout={(e) => placed('changes')(e.nativeEvent.layout.y)}>
          <AddedSinceGroup
            follow={follow}
            changes={changes}
            current={state?.status === 'ready' ? state.current : undefined}
            stale={state?.status === 'ready' ? state.stale : undefined}
            savedAt={state?.status === 'ready' ? state.savedAt : undefined}
            testID="party-added-since"
            onRowPress={(change) =>
              jump(change.marker === 'members' ? 'members' : 'receipts')
            }
          />
        </View>
      ) : null}
      {pairs ? (
        <>
          <View onLayout={(e) => placed('members')(e.nativeEvent.layout.y)}>
            <SurfaceGrid {...profileGrid} testID="party-members-grid">
              {membersSection}
              {votesSection}
            </SurfaceGrid>
          </View>
          <View onLayout={(e) => placed('receipts')(e.nativeEvent.layout.y)}>
            <SurfaceGrid {...profileGrid} testID="party-receipts-grid">
              {receiptsSection}
              {debtsSection}
            </SurfaceGrid>
          </View>
        </>
      ) : (
        <>
          <View onLayout={(e) => placed('members')(e.nativeEvent.layout.y)}>
            {membersSection}
          </View>
          <View onLayout={(e) => placed('receipts')(e.nativeEvent.layout.y)}>
            {receiptsSection}
          </View>
          {debtsSection}
          {votesSection}
        </>
      )}
      <PartyAccess name={label} />
      <MoreFromRecord
        subject={{ party: id, name: label }}
        kinds={['mentions']}
        testID="party-more"
      />
      {tiles.length ? (
        <SourceLine
          title="Party sources"
          asOf={stripCitations[0]?.asOf ?? null}
          citation={stripCitations}
          state={
            view.members.partial || view.receipts.partial ? 'partial' : null
          }
          notes={[
            view.members.partial || view.receipts.partial
              ? 'Some records for this party could not be read.'
              : null,
          ]}
          testID="party-figures-source"
        />
      ) : null}
      {/* The page's end, for journeys that scroll to it; nothing drawn. */}
      <View testID="party-end" collapsable={false} style={styles.end} />
    </Screen>
  );
}

type DivisionData = NonNullable<View_['divisions']['data']>['rows'][number];
const rowKey = (row: DivisionData) => `${row.billKey}:${row.division.key}`;

/** One recent division with this party's members' votes in words. */
function PartyDivision({ row, label }: { row: DivisionData; label: string }) {
  const outcome =
    row.division.outcome === 'affirmative' ? 'Agreed to' : 'Not agreed to';
  const stage = stageTitle(row.division.stage) || 'Division';
  return (
    <DivisionRow
      title={row.title}
      meta={`${stage} · ${chamberLabel(row.division.house)} · ${formatDate(row.division.date, 'short')}\n${label} members: ${formatCount(row.ayes)} for, ${formatCount(row.noes)} against`}
      outcome={outcome}
      ayes={row.division.ayes}
      noes={row.division.noes}
      countsStyle="ayesNoes"
      split={{ ayes: row.ayes, noes: row.noes }}
      href={billRoute(row.billKey, undefined, {
        section: 'divisions',
        division: row.division.key,
      })}
      testID={`party-bill-${row.billKey}`}
    />
  );
}

const styles = StyleSheet.create({
  top: { gap: rhythm.block },
  faces: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  block: { gap: rhythm.heading },
  // One point, at the foot of the last section rather than a section below.
  end: { height: 1, marginTop: -rhythm.section },
});
