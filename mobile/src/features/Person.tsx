import { PayBlock, PartyReceiptsBlock } from './people/FinancialBlocks';
import {
  PersonTopics,
  RecordSection,
  NewsSection,
  PersonDiary,
  QuickFacts,
} from './people/Sections';
import { AskAbout } from './ask/AskAbout';
import { headerItems } from '../navigation/chrome';
import {
  formatCount,
  formatDate,
  formatMoney,
  formatPercent,
  formatYearRange,
  moneyAccessibilityLabel,
} from '../design/format';
import { useEffect, useState } from 'react';
import { Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../api/runtime';
import { CachedPortrait } from './CachedPortrait';
import {
  AsAtLine,
  BigFigure,
  Disclosure,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  KeyValueList,
  LinkRow,
  LoadingState,
  OpaxWebLink,
  PadGrid,
  PartyLabel,
  Portrait,
  RowList,
  Screen,
  Section,
  StatRow,
  SubSection,
  Text,
  errorMessage,
} from '../design/primitives';
import { partyDot } from '../design/party';
import { rhythm } from '../design/tokens';
import {
  CHAMBER_NOT_RECORDED,
  chamberName,
  jurisdictionName,
} from '../design/parliament';
import { shareHeaderItem } from '../navigation/share';
import {
  billRoute,
  electorateRoute,
  expenseGlossaryRoute,
} from '../navigation/routes';
import { FollowToggle } from './follows/FollowToggle';
import { profileGrid } from './split/grid';
import { EvidenceFooter, RecordBlock } from './your-mp/Evidence';
import { DeclaredInterests } from './people/DeclaredInterests';
import {
  uncoveredProfile,
  hasParliamentaryMembership,
  votingMetaFor,
  type ProfileView,
} from './your-mp/model';
const partialMissing =
  'No readable record was found for this person. Some rows in the latest public export were unreadable.';
export default function Person() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <ProfileScreen key={slug} slug={slug} />;
}
export function ProfileScreen({
  slug,
  embedded = false,
}: {
  slug: string;
  embedded?: boolean;
}) {
  const [profile, setProfile] = useState<ProfileView | null>(null),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0),
    [refreshing, setRefreshing] = useState(false),
    [noNativeProfile, setNoNativeProfile] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      const person = await catalogs.person(slug);
      if (
        !person.data.canonicalPersonId &&
        !hasParliamentaryMembership(person.data, await catalogs.directory())
      ) {
        if (active) setNoNativeProfile(true);
        return null;
      }
      const p = person.data.canonicalPersonId
        ? await catalogs.profileFor(person.data.canonicalPersonId)
        : uncoveredProfile(person.data);
      if (!person.data.canonicalPersonId) {
        p.blocks.identity.partial = person.partial;
        p.blocks.identity.staleReason = person.staleReason;
        p.blocks.identity.stale = person.stale;
        p.blocks.identity.savedAt = person.savedAt;
      }
      return p;
    })()
      .then((p) => {
        if (active) {
          setProfile(p);
          if (p) setNoNativeProfile(false);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [slug, retry]);
  const refresh = () => {
      setRefreshing(true);
      setError(null);
      setRetry((v) => v + 1);
    },
    identity = profile?.blocks.identity.data,
    b = profile?.blocks;
  const webPath = `/subject/person/${profile?.slug ?? slug}`;
  return (
    <>
      {embedded ? null : (
        <Stack.Screen
          options={{
            title: identity?.name ?? '',
            headerTitle: '',
            ...headerItems(
              identity
                ? () => [
                    shareHeaderItem({ path: webPath, title: identity.name }),
                  ]
                : undefined,
            ),
          }}
        />
      )}
      <Screen
        column="wide"
        testID={identity ? 'person-screen' : 'person-pending-screen'}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {error ? (
          <ErrorState message={error} onRetry={refresh} testID="person-error" />
        ) : null}
        {noNativeProfile ? (
          <Group testID="person-no-native-profile">
            <EmptyState message="No native profile yet. Native profiles cover verified parliamentarians in the public record." />
            <OpaxWebLink label="Public record on opax.com.au" path={webPath} />
          </Group>
        ) : null}
        {!profile && !error && !noNativeProfile ? (
          Platform.OS === 'android' ? (
            <Group testID="person-loading">
              <Portrait size="profile" testID="person-cold-portrait" />
              <LoadingState
                shape="text"
                count={2}
                label="Loading the public record"
              />
            </Group>
          ) : (
            <LoadingState
              shape="people"
              count={1}
              label="Loading the public record"
              testID="person-loading"
            />
          )
        ) : null}
        {identity && b ? (
          <>
            {/* iPad: identity beside the quick facts, then the money,
                interests and pay blocks in pairs (PadGrid; the phone's
                blocks are unchanged siblings). */}
            <PadGrid {...profileGrid}>
              <Group gap={rhythm.heading}>
                <View style={styles.hero}>
                  <CachedPortrait
                    name={identity.name}
                    slug={slug}
                    size="profile"
                    testID="person-portrait"
                    retryKey={retry}
                    ring={partyDot(identity.party)}
                  />
                  {profile.personId ? (
                    <FollowToggle
                      kind="person"
                      id={profile.personId}
                      title={identity.name}
                      testID="person-follow"
                    />
                  ) : null}
                </View>
                <Group gap={rhythm.line}>
                  <Heading level={1} testID="person-screen-title">
                    {identity.name}
                  </Heading>
                  <PartyLabel
                    party={identity.party}
                    status={identity.partyStatus}
                    formerly={identity.formerly}
                    chip
                    testID="person-party"
                  />
                </Group>
                {identity.seats.length ? (
                  <RowList>
                    {identity.seats.map((seat) => {
                      const named = chamberName(
                        seat.chamber,
                        seat.jurisdiction,
                      );
                      const chamber = named ?? CHAMBER_NOT_RECORDED;
                      const place =
                        jurisdictionName(seat.jurisdiction) ??
                        'Jurisdiction not recorded';
                      // A named chamber already says where it sits ("House of
                      // Representatives", "Victorian Legislative Assembly").
                      const where = named ? chamber : `${chamber} · ${place}`;
                      return (
                        <LinkRow
                          key={seat.electorate_id}
                          icon="map"
                          accent="places"
                          title={seat.name}
                          detail={[
                            where,
                            identity.seats.length > 1 && seat.as_of
                              ? `As at ${formatDate(seat.as_of, 'short')}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join('\n')}
                          accessibilityLabel={`${seat.name} electorate, ${chamber}, ${place}`}
                          titleTestID="person-electorate"
                          detailTestID="person-chamber"
                          onPress={() =>
                            router.push(electorateRoute(seat.electorate_id))
                          }
                        />
                      );
                    })}
                  </RowList>
                ) : (
                  <EmptyState
                    icon="map"
                    message="No current electorate observation is held in this release."
                  />
                )}
                {profile.personId === null ? (
                  <Text wordSafe variant="metadata">
                    The electorate release does not include this person. Only
                    the public directory identity is linked here. Other records
                    may be available on opax.com.au.
                  </Text>
                ) : null}
                <Text wordSafe variant="caption">
                  These are dated public records. Representation may have
                  changed since collection.
                </Text>
                <EvidenceFooter block={b.identity} id="person" />
                <AskAbout kind="person" name={identity.name} />
              </Group>
              <QuickFacts identity={identity} />
            </PadGrid>
            <PadGrid {...profileGrid}>
              <PartyReceiptsBlock
                block={b.partyReceipts}
                retry={refresh}
                id="person-receipts"
                jurisdiction={identity.seats[0]?.jurisdiction}
              />
              <PersonTopics name={identity.name} />
            </PadGrid>
            <RecordBlock
              title="Voting record"
              id="person-votes"
              accent="votes"
              partialMissing={partialMissing}
              block={b.votes}
              missing="No voting summary is held for this person in the release."
              retry={refresh}
              date={false}
              caption={
                b.votes.data ? (
                  <Group gap={rhythm.line}>
                    {(b.votes.data.jurisdictions.length
                      ? b.votes.data.jurisdictions
                      : [undefined]
                    ).map((jur, i) => (
                      <AsAtLine
                        key={i}
                        votes={votingMetaFor(b.votes)}
                        jurisdiction={jur}
                        citation={b.votes.sources
                          .map((s) => s.label)
                          .join('; ')}
                        licence={b.votes.sources
                          .flatMap((s) => (s.licence ? [s.licence] : []))
                          .join('; ')}
                        savedAt={b.votes.stale ? b.votes.savedAt : null}
                        testID="person-votes-as-at"
                      />
                    ))}
                  </Group>
                ) : undefined
              }
              info={(v) =>
                v
                  ? { title: 'About the voting record', notes: [v.method] }
                  : null
              }
            >
              {(v) => (
                <Group>
                  <StatRow
                    accent="votes"
                    stats={[
                      {
                        label: 'Recorded divisions',
                        value: formatCount(v.total),
                      },
                      { label: 'Ayes', value: formatCount(v.ayes) },
                      { label: 'Noes', value: formatCount(v.noes) },
                    ]}
                  />
                  {v.ayePct !== null ? (
                    <Text wordSafe>
                      {formatPercent(v.ayePct, 0)} ayes in the recorded
                      divisions
                      {v.years.length === 2
                        ? `, ${formatYearRange(v.years[0]!, v.years[1]!)}`
                        : ''}
                      .
                    </Text>
                  ) : null}
                  <RowList>
                    <Disclosure
                      label="Bill votes"
                      value={formatCount(v.for.length + v.against.length)}
                      testID="person-bill-votes"
                    >
                      {() => (
                        <Group>
                          {(['for', 'against'] as const).map((side) => (
                            <SubSection
                              key={side}
                              title={
                                side === 'for' ? 'Voted for' : 'Voted against'
                              }
                            >
                              {v[side].length ? (
                                <RowList>
                                  {v[side].map((row, i) =>
                                    row.billKey ? (
                                      <LinkRow
                                        key={i}
                                        title={row.name}
                                        detail={`${row.stage} · ${formatDate(row.date, 'short')}`}
                                        accessibilityLabel={`Bill record: ${row.name}, ${row.stage}, ${formatDate(row.date)}`}
                                        onPress={() =>
                                          router.push(billRoute(row.billKey!))
                                        }
                                        testID={`person-bill-${side}-${i}`}
                                      />
                                    ) : (
                                      <Group key={i} gap={rhythm.line}>
                                        <Text wordSafe variant="strong">
                                          {row.name}
                                        </Text>
                                        <Text wordSafe variant="metadata">
                                          {row.stage} ·{' '}
                                          {formatDate(row.date, 'short')}
                                        </Text>
                                        <Text wordSafe variant="caption">
                                          Not matched to a bill record
                                        </Text>
                                      </Group>
                                    ),
                                  )}
                                </RowList>
                              ) : (
                                <EmptyState message="None of their recorded divisions was a vote on a bill itself." />
                              )}
                            </SubSection>
                          ))}
                        </Group>
                      )}
                    </Disclosure>
                  </RowList>
                </Group>
              )}
            </RecordBlock>
            {b.votes.data === null ? (
              <AsAtLine votes={null} testID="person-votes-as-at" />
            ) : null}
            <PadGrid {...profileGrid}>
              <RecordBlock
                title="Declared interests"
                id="person-interests"
                accent="interests"
                partialMissing={partialMissing}
                block={b.interests}
                missing="No register file is held for this person in the covered registers."
                retry={refresh}
              >
                {(r) => <DeclaredInterests register={r} />}
              </RecordBlock>
              <RecordBlock
                title="Declared ties"
                id="person-ties"
                accent="interests"
                partialMissing={partialMissing}
                block={b.ties}
                missing={
                  b.interests.data
                    ? 'No declared organisation ties are held in this register file.'
                    : 'No linked register file is available for declared organisation ties.'
                }
                retry={refresh}
              >
                {(ties) => (
                  <Group>
                    <Text wordSafe variant="metadata">
                      Declared ties are public disclosures, not findings of
                      wrongdoing.
                    </Text>
                    <RowList>
                      <Disclosure
                        label="Declared organisations"
                        value={formatCount(ties.length)}
                        testID="person-ties-detail"
                      >
                        {() => (
                          <RowList>
                            {ties.map((tie, i) => (
                              <Group key={i} gap={rhythm.line}>
                                <Text wordSafe variant="strong">
                                  {tie.organisation}
                                </Text>
                                <Text wordSafe variant="caption">
                                  {tie.kinds.join('; ')}
                                </Text>
                                {tie.declarations.map((d, j) => (
                                  <Text wordSafe key={j}>
                                    {d.category}: {d.description}
                                  </Text>
                                ))}
                              </Group>
                            ))}
                          </RowList>
                        )}
                      </Disclosure>
                    </RowList>
                  </Group>
                )}
              </RecordBlock>
            </PadGrid>
            <RecordSection name={identity.name} kind="speeches" />
            <PersonDiary identity={identity} />
            <NewsSection name={identity.name} />
            <PadGrid {...profileGrid}>
              <PayBlock block={b.pay} retry={refresh} id="person-pay" />
              <RecordBlock
                title="Claimed expenses"
                id="person-expenses"
                accent="money"
                partialMissing={partialMissing}
                block={b.expenses}
                missing="No expense summary is held for this person. IPEA coverage starts in April 2017."
                retry={refresh}
                info={(e) =>
                  e
                    ? {
                        title: 'About these expenses',
                        notes: [
                          `Coverage: ${e.coverage.from} to ${e.coverage.to}.`,
                          e.note,
                          `Benchmark: ${formatCount(e.benchmarks.count)} members with records through ${e.benchmarks.latestQuarter}, starting in ${e.benchmarks.fromCutoff} or earlier. Partial calendar years can affect the comparison. The recorded annual average is the supplied total divided by its covered calendar years. This comparison is a lead, not a finding.`,
                        ],
                      }
                    : null
                }
              >
                {(e) => (
                  <Group>
                    <BigFigure
                      value={formatMoney(e.person.total)}
                      spoken={moneyAccessibilityLabel(e.person.total)}
                      label={`Recorded expenses, ${formatYearRange(e.person.from, e.person.to)}`}
                      accent="money"
                    />
                    <KeyValueList
                      items={[
                        {
                          label: 'Recorded annual average',
                          value: `about ${formatMoney(e.annual)}`,
                        },
                        {
                          label: 'Benchmark annual median',
                          value: formatMoney(e.benchmarks.totalMedian),
                        },
                      ]}
                    />
                    <Text wordSafe variant="caption">
                      The comparison is a lead, not a finding.
                    </Text>
                    <RowList>
                      <LinkRow
                        title="Expense category glossary"
                        icon="list.bullet"
                        accent="money"
                        testID="person-expense-glossary"
                        onPress={() => router.push(expenseGlossaryRoute)}
                      />
                      <Disclosure
                        label="Expenses by year"
                        value={formatCount(e.person.by_year.length)}
                        testID="person-expense-years"
                      >
                        {() => (
                          <KeyValueList
                            items={e.person.by_year.map(([y, a]) => ({
                              label: String(y),
                              value: formatMoney(a),
                            }))}
                          />
                        )}
                      </Disclosure>
                      <Disclosure
                        label="Expense categories"
                        value={formatCount(e.person.by_category.length)}
                        testID="person-expense-categories"
                      >
                        {() => (
                          <RowList>
                            {e.person.by_category.map(([name, amount]) => {
                              const category = e.categories?.categories.find(
                                (c) => c.name === name,
                              );
                              return (
                                <Group key={name} gap={rhythm.line}>
                                  <View style={styles.category}>
                                    <Text
                                      wordSafe
                                      variant="strong"
                                      style={styles.grow}
                                    >
                                      {name}
                                    </Text>
                                    <Text
                                      variant="figureInline"
                                      tone="moneyInk"
                                    >
                                      {formatMoney(amount)}
                                    </Text>
                                  </View>
                                  {category ? (
                                    <>
                                      <Text wordSafe variant="metadata">
                                        {category.text}
                                      </Text>
                                      {category.note ? (
                                        <Text wordSafe variant="caption">
                                          {category.note}
                                        </Text>
                                      ) : null}
                                    </>
                                  ) : (
                                    <Text wordSafe variant="caption">
                                      Category definition not held.
                                    </Text>
                                  )}
                                </Group>
                              );
                            })}
                            {e.categories ? (
                              <AsAtLine
                                asOf={e.categories.meta.updated}
                                citation={e.categories.meta.source}
                                licence={e.categories.meta.licence}
                              />
                            ) : (
                              <Text wordSafe variant="caption">
                                Category definitions could not be loaded.
                              </Text>
                            )}
                          </RowList>
                        )}
                      </Disclosure>
                    </RowList>
                  </Group>
                )}
              </RecordBlock>
            </PadGrid>
            <RecordSection name={identity.name} kind="mentions" />
            <Section>
              <RowList>
                <OpaxWebLink
                  label="Public record on opax.com.au"
                  path={webPath}
                  testID="person-web"
                />
              </RowList>
              <Text wordSafe variant="caption" testID="person-end">
                End of profile
              </Text>
            </Section>
          </>
        ) : null}
      </Screen>
    </>
  );
}
const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: rhythm.block,
    flexWrap: 'wrap',
  },
  category: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: rhythm.tight,
  },
  grow: { flexGrow: 1, flexShrink: 1 },
});
