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
import { useAccessibilitySize, useReduceMotion } from '../design/accessibility';
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
import { chamberName } from '../design/parliament';
import { isPartyLabel, partyRename, partySlug } from '../design/party';
import type { PartyRename } from '../design/party-renames';
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
import { isProcedural, stageTitle } from './bills/divisions';
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
          // A missing party sits at the same centre as every other missing
          // record; the copy is its own.
          centred={notAParty || (!!record && !record.data)}
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
  const rename = partyRename(label);
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
  // A small party's members are listed by name in Members, so the count is
  // not said again as a tile.
  const named = !!members && namesMembers(members);
  // In one column Receipts follows Members within a screen, so its total is
  // said there once, not also as a tile above it.
  const receiptsTile = layout.regular;
  if (members && view.members.status !== 'error' && !named)
    tiles.push({
      value: formatCount(members.currentCount),
      label: members.currentCount === 1 ? 'sitting member' : 'sitting members',
      onPress: () => jump('members'),
      testID: 'party-figure-members',
    });
  if (receipts && view.receipts.status !== 'error' && receiptsTile)
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
  // With no strip on a phone, its "Party sources" line goes; the partial note
  // it carried moves to the Members and Receipts blocks' own source lines.
  const partyPartial =
    !tiles.length && !!(view.members.partial || view.receipts.partial);
  const partyPartialNote = (own: boolean | undefined) =>
    partyPartial && !own ? PARTY_PARTIAL_NOTE : null;
  const partyPartialLine = () => (partyPartial ? { partial: true } : undefined);

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
          'Sitting members include federal, state and territory parliamentarians with a confirmed current party affiliation. The directory is updated periodically. Undated affiliations appear separately as recorded. Past members come from recorded votes and roster party service. Roster affiliations are past only when service ended or the person is no longer current.',
          view.rosterAsAt
            ? `Roster as at ${formatDate(view.rosterAsAt)}.`
            : null,
          partyPartialNote(view.members.partial),
        ],
      })}
      citation="Parliamentary roster"
      line={partyPartialLine}
    >
      {(data) => (
        <View>
          {namesMembers(data) ? (
            <NamedMembers members={data.current} newMembers={newMembers} />
          ) : (
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
          )}

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
                      detail={recordedAs(member.recordedAs)}
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
          {view.past ? <PastMembers block={view.past} retry={retry} /> : null}
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
          partyPartialNote(view.receipts.partial),
        ],
      })}
      line={partyPartialLine}
    >
      {(data) => (
        <Group>
          <ReceiptsTotal node={data.node} />
          {data.node.lodgedAs ? (
            // Both names' returns, summed: which name each part was lodged as.
            <Text wordSafe variant="footnote" testID="party-receipts-lodged">
              {data.node.lodgedAs}
            </Text>
          ) : data.recordedAs ? (
            <Text wordSafe variant="footnote" testID="party-receipts-recorded">
              {recordedAs(data.recordedAs)}
            </Text>
          ) : null}
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
              <PartyVotes rows={data.rows} label={label} />
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
        {rename ? <PartyHistory rename={rename} /> : null}
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
              ? PARTY_PARTIAL_NOTE
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

/** Parties with this many sitting members or fewer are named in Members. */
export const NAMED_MEMBERS = 5;

const uniqueMembers = (members: readonly PartyMember[]) => {
  const seen = new Set<string>();
  return members.filter((m) => {
    if (seen.has(m.slug)) return false;
    seen.add(m.slug);
    return true;
  });
};

/** Whether Members lists the sitting members by name rather than a count. */
const namesMembers = (data: {
  currentCount: number;
  current: readonly PartyMember[];
}) =>
  data.currentCount > 0 &&
  data.currentCount <= NAMED_MEMBERS &&
  uniqueMembers(data.current).length === data.currentCount;

/** A small party's sitting members, each by name, as Past members are. */
function NamedMembers({
  members,
  newMembers,
}: {
  members: readonly PartyMember[];
  newMembers: boolean;
}) {
  const people = uniqueMembers(members);
  return (
    <View testID="party-members-named">
      {newMembers ? <NewDot testID="party-members-new" /> : null}
      {people.map((member) => (
        <PersonRow
          key={member.slug}
          name={member.name}
          portrait={<CachedPortrait name={member.name} slug={member.slug} />}
          place={
            [member.place, chamberName(member.chamber, member.jurisdiction)]
              .filter(Boolean)
              .join(', ') || undefined
          }
          detail={recordedAs(member.recordedAs)}
          href={personRoute(member.slug, member.name)}
          testID={`party-sitting-${member.slug}`}
          testDrawnName
        />
      ))}
    </View>
  );
}

const VOTES_SHOWN = 10;
const PARTY_PARTIAL_NOTE = 'Some records for this party could not be read.';
/** The bill page's rule, with its stage-or-title fallback and the question. */
const isProceduralRow = (row: DivisionData) =>
  isProcedural(
    row.division.stage ?? row.division.title ?? null,
    row.division.question,
  );

/**
 * Recent votes: substantive divisions first, newest first; procedural
 * motions folded under the same "Procedural votes (N)" the bill page uses.
 */
function PartyVotes({
  rows,
  label,
}: {
  rows: readonly DivisionData[];
  label: string;
}) {
  const main = rows.filter((row) => !isProceduralRow(row));
  const procedural = rows.filter(isProceduralRow);
  const draw = (list: readonly DivisionData[]) =>
    list.map((row, i) => (
      <PartyDivision
        key={rowKey(row)}
        row={row}
        label={label}
        which={which(row, [list[i - 1], list[i + 1]])}
      />
    ));
  return (
    <View>
      {draw(main.slice(0, VOTES_SHOWN))}
      {main.length > VOTES_SHOWN ? (
        <Disclosure
          label={`Show all ${formatCount(main.length)}`}
          testID="party-divisions-all"
        >
          {() => draw(main.slice(VOTES_SHOWN))}
        </Disclosure>
      ) : null}
      {procedural.length ? (
        <Disclosure
          label={`Procedural votes (${formatCount(procedural.length)})`}
          testID="party-divisions-procedural"
        >
          {() => <View>{draw(procedural)}</View>}
        </Disclosure>
      ) : null}
    </View>
  );
}

/** Whether two rows would read the same: one bill, stage, chamber and day. */
const sameMotion = (row: DivisionData, other: DivisionData | undefined) =>
  !!other &&
  other.billKey === row.billKey &&
  (other.division.stage ?? '') === (row.division.stage ?? '') &&
  other.division.date === row.division.date &&
  other.division.house === row.division.house;

/**
 * What tells a row from a neighbour on the same bill, stage and day: its
 * question when the neighbour's differs, otherwise the chamber's count (the
 * export keeps two such divisions apart only when their counts differ).
 */
function which(
  row: DivisionData,
  neighbours: readonly (DivisionData | undefined)[],
): string | null {
  const twins = neighbours.filter((other) => sameMotion(row, other));
  if (!twins.length) return null;
  if (row.question && twins.every((other) => other!.question !== row.question))
    return row.question;
  return `Chamber: ${formatCount(row.division.ayes)} for, ${formatCount(row.division.noes)} against`;
}

/**
 * The party's vote in words. A block vote is "Labor: all 25 against"; a
 * split vote counts both sides, "Labor: 20 for, 5 against". One member
 * voting is "Libertarian Party: 1 for".
 */
export function partyVoteLine(name: string, ayes: number, noes: number) {
  if (ayes && noes)
    return `${name}: ${formatCount(ayes)} for, ${formatCount(noes)} against`;
  const n = ayes || noes;
  const side = ayes ? 'for' : 'against';
  return `${name}: ${n > 1 ? `all ${formatCount(n)}` : formatCount(n)} ${side}`;
}

/** One recent division with this party's members' votes in words. */
function PartyDivision({
  row,
  label,
  which = null,
}: {
  row: DivisionData;
  label: string;
  /** A neighbour has the same bill, stage and day: which motion this is. */
  which?: string | null;
}) {
  const outcome =
    row.division.outcome === 'affirmative' ? 'Agreed to' : 'Not agreed to';
  const stage = stageTitle(row.division.stage) || 'Division';
  const block = !(row.ayes && row.noes);
  return (
    <DivisionRow
      title={row.title}
      meta={[
        `${stage} · ${chamberLabel(row.division.house)} · ${formatDate(row.division.date, 'short')}`,
        which,
      ]
        .filter(Boolean)
        .join('\n')}
      outcome={outcome}
      ayes={row.division.ayes}
      noes={row.division.noes}
      countsStyle="ayesNoes"
      split={{ ayes: row.ayes, noes: row.noes }}
      // A division under a former name keeps it: "Liberal Democratic Party:
      // 1 for", never the party's later name.
      votesLine={partyVoteLine(row.recordedAs ?? label, row.ayes, row.noes)}
      bar={!block}
      href={billRoute(row.billKey, undefined, {
        section: 'divisions',
        division: row.division.key,
      })}
      testID={`party-bill-${row.billKey}`}
    />
  );
}

/**
 * The disclosed total and what it is drawn from. VoiceOver hears both lines,
 * the count and the years included, not just the sum.
 */
function ReceiptsTotal({
  node,
}: {
  node: Pick<
    NonNullable<View_['receipts']['data']>['node'],
    'total' | 'count' | 'firstYear' | 'lastYear'
  >;
}) {
  const line = [
    `disclosed, from ${formatCount(node.count)} ${node.count === 1 ? 'donation or receipt' : 'donations and receipts'}`,
    node.firstYear !== undefined && node.lastYear !== undefined
      ? node.firstYear === node.lastYear
        ? String(node.firstYear)
        : `${node.firstYear} to ${node.lastYear}`
      : null,
  ]
    .filter(Boolean)
    .join(', ');
  // At accessibility sizes the exact dollars would break inside the figure
  // ("$1,120,198,70 / 4" at AX3). VoiceOver uses the same rounding as the
  // compact sum drawn at these sizes.
  const compact = useAccessibilitySize() && Math.abs(node.total) >= 1e6;
  return (
    <View
      accessible
      accessibilityLabel={`${moneyAccessibilityLabel(node.total, compact)}, ${line}`}
      testID="party-receipts-total"
    >
      <Text wordSafe variant="figure" tone="moneyInk" tabular>
        {compact ? formatMoneyCompact(node.total) : formatMoney(node.total)}
      </Text>
      <Text wordSafe variant="secondary">
        {line}
      </Text>
    </View>
  );
}

const recordedAs = (name: string | null | undefined) =>
  name ? `Recorded as ${name}` : undefined;

/**
 * A renamed party's history under the heading: its earlier name and the
 * AEC notices behind the change, which open from the source sheet.
 */
export function PartyHistory({ rename }: { rename: PartyRename }) {
  return (
    <View style={styles.history} testID="party-history">
      <Text wordSafe variant="secondary" testID="party-history-text">
        {rename.history}
      </Text>
      <SourceLine
        title="Party name history"
        citation={[
          {
            label: 'AEC party register',
            title: 'AEC party registration notices',
          },
        ]}
        asOf={rename.since}
        dateRole="recorded"
        originals={rename.sources.map((source) => ({
          label: source.label,
          url: source.href,
        }))}
        notes={[
          'One party, under its later name. Votes, bills, speeches and money recorded under the earlier name keep that name.',
        ]}
        licenceDataset="aec"
        testID="party-history-source"
      />
    </View>
  );
}

const yearsText = (years: readonly number[]) => {
  const first = years[0];
  const last = years.at(-1);
  if (first === undefined || last === undefined) return null;
  return first === last ? String(first) : `${first} to ${last}`;
};

/** Shared iOS and Android rows, with party service dates where recorded. */
export function PastMembers({
  block,
  retry,
}: {
  block: NonNullable<View_['past']>;
  retry: () => void;
}) {
  if (block.status === 'loading')
    return (
      <Skeleton
        shape="rows"
        count={2}
        label="Loading past members"
        testID="party-past-loading"
      />
    );
  if (block.status === 'error')
    return (
      <InlineError
        subject="Past members"
        onRetry={retry}
        testID="party-past-error"
      />
    );
  const rows = block.data ?? [];
  if (!rows.length) return null;
  return (
    <Disclosure
      label="Past members"
      value={formatCount(rows.length)}
      testID="party-past-toggle"
    >
      {() => (
        <View>
          {rows.map((member) => {
            const id = member.slug ?? partySlug(member.name);
            const service = member.periods?.filter((p) => p.start || p.end);
            const dates = (p: NonNullable<typeof service>[number]) =>
              p.start && p.end
                ? `${formatDate(p.start, 'short')} to ${formatDate(p.end, 'short')}`
                : p.end
                  ? `Until ${formatDate(p.end, 'short')}`
                  : p.start
                    ? `From ${formatDate(p.start, 'short')}`
                    : '';
            const oneHouse = service?.every(
              (p) =>
                p.jurisdiction === member.jurisdiction &&
                p.chamber === member.house,
            );
            const place = service?.length
              ? oneHouse
                ? [
                    chamberName(member.house, member.jurisdiction),
                    service.map(dates).join('; '),
                  ]
                    .filter(Boolean)
                    .join(', ')
                : service
                    .map((p) =>
                      [
                        chamberName(p.chamber ?? '', p.jurisdiction ?? ''),
                        dates(p),
                      ]
                        .filter(Boolean)
                        .join(', '),
                    )
                    .join('; ')
              : [
                  chamberName(member.house, member.jurisdiction),
                  yearsText(member.years),
                ]
                  .filter(Boolean)
                  .join(', ');
            return (
              <PersonRow
                key={member.personId}
                name={member.name}
                portrait={
                  member.slug ? (
                    <CachedPortrait name={member.name} slug={member.slug} />
                  ) : null
                }
                place={place || undefined}
                detail={recordedAs(member.recordedAs)}
                href={
                  member.slug
                    ? personRoute(member.slug, member.name)
                    : undefined
                }
                testID={`party-past-${id}`}
                testDrawnName
              />
            );
          })}
          <Text wordSafe variant="footnote">
            Listed from recorded votes and party service, under the name they
            sat under.
          </Text>
          <SourceLine
            title="Past members"
            citation="Parliamentary roster and recorded votes"
            asOf={block.asAt}
            originals={block.sources}
            state={
              block.partial ? 'partial' : block.stale ? 'saved' : undefined
            }
            testID="party-past-source"
          />
        </View>
      )}
    </Disclosure>
  );
}

const styles = StyleSheet.create({
  top: { gap: rhythm.block },
  history: { gap: rhythm.tight },
  faces: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  block: { gap: rhythm.heading },
  // One point, at the foot of the last section rather than a section below.
  end: { height: 1, marginTop: -rhythm.section },
});
