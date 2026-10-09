import { PayBlock, PartyReceiptsBlock } from './people/FinancialBlocks';
import {
  PersonTopics,
  RecordSection,
  NewsSection,
  PersonDiary,
} from './people/Sections';
import { PageActions } from './people/PageActions';
import { headerItems } from '../navigation/chrome';
import {
  formatCount,
  formatDate,
  formatMoney,
  formatPercent,
  formatYearRange,
  moneyAccessibilityLabel,
} from '../design/format';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ScrollView,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../api/runtime';
import type { PersonProfile } from '../api/person-identity';
import { CachedPortrait } from './CachedPortrait';
import {
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
  SubSection,
  Text,
  errorMessage,
  useAccessibilitySize,
  useReduceMotion,
} from '../design/primitives';
import { partyDot } from '../design/party';
import { colors, layout, radii, rhythm } from '../design/tokens';
import { useHeaderBottom } from '../design/useHeaderBottom';
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
import { profileGrid } from './split/grid';
import { EvidenceFooter, RecordBlock, votesSource } from './your-mp/Evidence';
import { DeclaredInterests, registerNotes } from './people/DeclaredInterests';
import {
  hasParliamentaryMembership,
  type ProfileView,
} from './your-mp/model';
const partialMissing =
  'No readable record was found for this person. Some rows in the latest public export were unreadable.';
type Jump = 'votes' | 'interests' | 'pay';
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
  // The figure strip is the page's index: each figure scrolls to its block.
  const scroll = useRef<ScrollView>(null),
    blockY = useRef<Partial<Record<Jump, number>>>({}),
    headerBottom = useHeaderBottom(),
    reduceMotion = useReduceMotion();
  const jump = (to: Jump) => {
    const y = blockY.current[to];
    if (y === undefined) return;
    // The scroll view runs under the native header on iOS.
    const top = Platform.OS === 'ios' ? headerBottom : 0;
    scroll.current?.scrollTo({
      y: y - top - rhythm.heading,
      animated: !reduceMotion,
    });
  };
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
      // A former member outside the dated release still has the records
      // held by their roster ID and names: votes, party receipts, pay.
      const p: ProfileView = person.data.canonicalPersonId
        ? await catalogs.profileFor(person.data.canonicalPersonId)
        : await catalogs.rosterProfileFor(person.data);
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
        scrollRef={scroll}
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
            {/* Identity once: portrait, Follow and ⋯; the name; the party;
                where they sit; the figures the page is about, each opening
                its block; and the one line for where this comes from. */}
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
                <PageActions
                  kind="person"
                  id={profile.personId}
                  name={identity.name}
                  webPath={webPath}
                  testID="person"
                />
              </View>
              <Group gap={rhythm.line}>
                <Heading level={1} testID="person-screen-title">
                  {identity.name}
                </Heading>
                <PartyLabel
                  party={identity.party}
                  status={identity.partyStatus}
                  formerly={identity.formerly}
                  testID="person-party"
                />
                <SeatLines identity={identity} />
              </Group>
              {profile.personId === null ? (
                // The one caveat the page needs: how its records are linked.
                <Group gap={rhythm.tight}>
                  <Text wordSafe variant="metadata">
                    The dated electorate release does not include this person,
                    so records here are linked by the parliamentary roster’s ID
                    and name. Others may be on opax.com.au.
                  </Text>
                  <RowList>
                    <OpaxWebLink
                      label="Public record on opax.com.au"
                      path={webPath}
                      testID="person-web"
                    />
                  </RowList>
                </Group>
              ) : null}
              <FigureStrip profile={profile} onJump={jump} />
              <EvidenceFooter
                block={b.identity}
                id="person"
                about={{
                  title: 'About this profile',
                  notes: [
                    'These are dated public records. Representation may have changed since collection.',
                  ],
                }}
              />
            </Group>
            <PadGrid {...profileGrid}>
              <PartyReceiptsBlock
                block={b.partyReceipts}
                retry={refresh}
                id="person-receipts"
                jurisdiction={identity.seats[0]?.jurisdiction}
              />
              <PersonTopics name={identity.name} />
            </PadGrid>
            <View
              onLayout={(e) => {
                blockY.current.votes = e.nativeEvent.layout.y;
              }}
            >
              <RecordBlock
                title="Voting record"
                id="person-votes"
                accent="votes"
                partialMissing={partialMissing}
                block={b.votes}
                missing="No voting summary is held for this person in the release."
                retry={refresh}
                line={() => votesSource(b.votes)}
                about={(v) =>
                  v
                    ? { title: 'About the voting record', notes: [v.method] }
                    : null
                }
              >
                {(v) => (
                  <Group>
                    <Group gap={rhythm.line}>
                      <Text wordSafe variant="strong" tabular>
                        {formatCount(v.ayes)} ayes · {formatCount(v.noes)} noes
                      </Text>
                      <Text wordSafe>
                        {v.ayePct !== null
                          ? `${formatPercent(v.ayePct, 0)} ayes in the ${formatCount(v.total)} recorded divisions`
                          : `${formatCount(v.total)} recorded divisions`}
                        {v.years.length === 2
                          ? `, ${formatYearRange(v.years[0]!, v.years[1]!)}`
                          : ''}
                        .
                      </Text>
                    </Group>
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
                                            {formatDate(row.date, 'short')} ·
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
            </View>
            <View
              onLayout={(e) => {
                blockY.current.interests = e.nativeEvent.layout.y;
              }}
              style={styles.blocks}
            >
              <PadGrid {...profileGrid}>
                <RecordBlock
                  title="Declared interests"
                  id="person-interests"
                  accent="interests"
                  partialMissing={partialMissing}
                  block={b.interests}
                  missing="No register file is held for this person in the covered registers."
                  retry={refresh}
                  about={(r) =>
                    r
                      ? {
                          title: 'About the register',
                          notes: registerNotes(r),
                        }
                      : null
                  }
                  line={(r) => ({ partial: !!r?.unread_pages })}
                >
                  {(r) => <DeclaredInterests register={r} figure={false} />}
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
                                  <Text wordSafe variant="fine">
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
            </View>
            <RecordSection name={identity.name} kind="speeches" />
            <PersonDiary identity={identity} />
            <NewsSection name={identity.name} />
            <View
              onLayout={(e) => {
                blockY.current.pay = e.nativeEvent.layout.y;
              }}
              style={styles.blocks}
            >
              <PadGrid {...profileGrid}>
                <PayBlock
                  block={b.pay}
                  retry={refresh}
                  id="person-pay"
                  figure={false}
                />
                <RecordBlock
                  title="Claimed expenses"
                  id="person-expenses"
                  accent="money"
                  partialMissing={partialMissing}
                  block={b.expenses}
                  missing="No expense summary is held for this person. IPEA coverage starts in April 2017."
                  retry={refresh}
                  about={(e) =>
                    e
                      ? {
                          title: 'About these expenses',
                          notes: [
                            `Coverage: ${e.coverage.from} to ${e.coverage.to}.`,
                            e.note,
                            `Benchmark: ${formatCount(e.benchmarks.count)} members with records through ${e.benchmarks.latestQuarter}, starting in ${e.benchmarks.fromCutoff} or earlier. Partial calendar years can affect the comparison. The recorded annual average is the supplied total divided by its covered calendar years. This comparison is a lead, not a finding.`,
                            e.categories
                              ? `Category definitions: ${[
                                  e.categories.meta.source,
                                  e.categories.meta.updated
                                    ? `as at ${formatDate(e.categories.meta.updated)}`
                                    : null,
                                  e.categories.meta.licence,
                                ]
                                  .filter(Boolean)
                                  .join(', ')}.`
                              : null,
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
                      <Text wordSafe variant="fine">
                        The comparison is a lead, not a finding.
                      </Text>
                      <RowList>
                        <LinkRow
                          title="Expense category glossary"
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
                                      <Text variant="strong" tabular>
                                        {formatMoney(amount)}
                                      </Text>
                                    </View>
                                    {category ? (
                                      <>
                                        <Text wordSafe variant="metadata">
                                          {category.text}
                                        </Text>
                                        {category.note ? (
                                          <Text wordSafe variant="fine">
                                            {category.note}
                                          </Text>
                                        ) : null}
                                      </>
                                    ) : (
                                      <Text wordSafe variant="fine">
                                        Category definition not held.
                                      </Text>
                                    )}
                                  </Group>
                                );
                              })}
                              {e.categories ? null : (
                                <Text wordSafe variant="fine">
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
            </View>
            <RecordSection name={identity.name} kind="mentions" />
            {/* The page's end, for journeys that scroll to it; nothing drawn. */}
            <View testID="person-end" collapsable={false} style={styles.end} />
          </>
        ) : null}
      </Screen>
    </>
  );
}

/**
 * Where they sit, one line a seat: "Member for Grayndler · House of
 * Representatives", "Senator for South Australia". The line opens the
 * electorate record. Several seats each carry their as-at date.
 */
function SeatLines({ identity }: { identity: PersonProfile }) {
  // A hugging line's width follows its text, so word-safe sizing could chase
  // its own frame: at accessibility sizes the line takes the column's width.
  const fixed = useAccessibilitySize();
  if (!identity.seats.length)
    return (
      <Text wordSafe variant="metadata">
        No current electorate observation is held in this release.
      </Text>
    );
  return (
    <>
      {identity.seats.map((seat) => {
        const named = chamberName(seat.chamber, seat.jurisdiction);
        const chamber = named ?? CHAMBER_NOT_RECORDED;
        const place =
          jurisdictionName(seat.jurisdiction) ?? 'Jurisdiction not recorded';
        const senator = seat.chamber === 'senate';
        // A named chamber already says where it sits ("House of
        // Representatives", "Victorian Legislative Assembly").
        const where = senator ? [] : named ? [chamber] : [chamber, place];
        const asAt =
          identity.seats.length > 1 && seat.as_of
            ? `as at ${formatDate(seat.as_of, 'short')}`
            : null;
        const rest = [...where, asAt].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={seat.electorate_id}
            accessibilityRole="link"
            accessibilityLabel={`${senator ? 'Senator' : 'Member'} for ${seat.name}, ${chamber}, ${place}`}
            accessibilityHint="Opens the electorate record"
            testID="person-electorate"
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => router.push(electorateRoute(seat.electorate_id))}
            style={({ pressed }) => [
              styles.seat,
              fixed ? styles.seatFixed : null,
              pressed ? styles.pressed : null,
            ]}
          >
            {({ pressed }) => (
              <Text wordSafe variant="metadata" testID="person-chamber">
                {senator ? 'Senator for ' : 'Member for '}
                <Text
                  variant="metadata"
                  tone="navy"
                  style={pressed ? styles.underline : null}
                >
                  {seat.name}
                </Text>
                {rest ? ` · ${rest}` : ''}
              </Text>
            )}
          </Pressable>
        );
      })}
    </>
  );
}

/**
 * Up to three figures the page is about, under the identity: divisions,
 * declared interests and pay. Each opens its block, where the figure is
 * dated and sourced, so the strip is the page's index too. One per line at
 * accessibility sizes.
 */
function FigureStrip({
  profile,
  onJump,
}: {
  profile: ProfileView;
  onJump: (to: Jump) => void;
}) {
  const stacked = useAccessibilitySize();
  const { votes, interests, pay } = profile.blocks;
  const salary = pay.data?.person.now?.salary;
  const figures: {
    to: Jump;
    value: string;
    spoken?: string;
    label: string;
    section: string;
  }[] = [
    ...(votes.data
      ? [
          {
            to: 'votes' as const,
            value: formatCount(votes.data.total),
            label: 'divisions',
            section: 'Voting record',
          },
        ]
      : []),
    ...(interests.data
      ? [
          {
            to: 'interests' as const,
            value: formatCount(interests.data.total),
            label: 'declared interests',
            section: 'Declared interests',
          },
        ]
      : []),
    ...(salary !== undefined
      ? [
          {
            to: 'pay' as const,
            value: formatMoney(salary),
            spoken: moneyAccessibilityLabel(salary),
            label: 'a year in pay',
            section: 'Pay for the posts held',
          },
        ]
      : []),
  ];
  if (!figures.length) return null;
  return (
    <View
      style={[styles.strip, stacked ? styles.stripStacked : null]}
      testID="person-figures"
    >
      {figures.map((f) => (
        <Pressable
          key={f.to}
          accessibilityRole="button"
          accessibilityLabel={`${f.spoken ?? f.value} ${f.label}`}
          accessibilityHint={`Goes to ${f.section}`}
          testID={`person-figure-${f.to}`}
          onPress={() => onJump(f.to)}
          style={({ pressed }) => [
            styles.figure,
            stacked ? null : styles.figureInline,
            pressed ? styles.pressed : null,
          ]}
        >
          <StripFigure value={f.value} label={f.label} />
        </Pressable>
      ))}
    </View>
  );
}
function StripFigure({
  value,
  label,
}: {
  value: string;
  label: string;
}): ReactNode {
  return (
    <>
      <Text wordSafe variant="heading" tabular>
        {value}
      </Text>
      <Text wordSafe variant="metadata">
        {label}
      </Text>
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
  seat: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: radii.sm,
    paddingHorizontal: rhythm.line,
    marginHorizontal: -rhythm.line,
  },
  seatFixed: { alignSelf: 'stretch' },
  underline: { textDecorationLine: 'underline' },
  pressed: { backgroundColor: colors.sunken },
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: rhythm.block,
    rowGap: rhythm.tight,
    paddingTop: rhythm.tight,
  },
  stripStacked: { flexDirection: 'column' },
  figure: {
    gap: 2,
    borderRadius: radii.sm,
    paddingHorizontal: rhythm.line,
    marginHorizontal: -rhythm.line,
    paddingVertical: rhythm.line,
  },
  figureInline: { minWidth: 88, flexGrow: 1, flexBasis: 88 },
  // Two blocks a figure opens, drawn as the screen's own sections.
  blocks: { gap: layout.sectionGap },
  category: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: rhythm.tight,
  },
  grow: { flexGrow: 1, flexShrink: 1 },
  // One point, at the foot of the last section rather than a section below.
  end: { height: 1, marginTop: -layout.sectionGap },
});
