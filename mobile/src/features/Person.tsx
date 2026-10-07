import { AskAbout } from './ask/AskAbout';
import {
  formatCount,
  formatDate,
  formatFinancialYear,
  formatMoney,
  formatPercent,
  formatYearRange,
  moneyAccessibilityLabel,
} from '../design/format';
import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
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
  PartyLabel,
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
  moneyRoute,
  partyRoute,
} from '../navigation/routes';
import { FollowToggle } from './follows/FollowToggle';
import { EvidenceFooter, RecordBlock } from './your-mp/Evidence';
import {
  uncoveredProfile,
  hasParliamentaryMembership,
  votingMetaFor,
  registerCategoryLabel,
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
            unstable_headerRightItems: identity
              ? () => [shareHeaderItem({ path: webPath, title: identity.name })]
              : undefined,
          }}
        />
      )}
      <Screen
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
          <LoadingState
            shape="people"
            count={1}
            label="Loading the public record"
            testID="person-loading"
          />
        ) : null}
        {identity && b ? (
          <>
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
                    const named = chamberName(seat.chamber, seat.jurisdiction);
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
                  The electorate release does not include this person. Only the
                  public directory identity is linked here. Other records may be
                  available on opax.com.au.
                </Text>
              ) : null}
              <Text wordSafe variant="caption">
                These are dated public records. Representation may have changed
                since collection.
              </Text>
              <EvidenceFooter block={b.identity} id="person" />
              <AskAbout kind="person" name={identity.name} />
            </Group>
            <RecordBlock
              title="Voting record"
              id="person-votes"
              icon="checkmark.square"
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
            <RecordBlock
              title="Declared interests"
              id="person-interests"
              icon="list.clipboard"
              accent="interests"
              partialMissing={partialMissing}
              block={b.interests}
              missing="No register file is held for this person in the covered registers."
              retry={refresh}
            >
              {(r) => (
                <Group>
                  <BigFigure
                    value={formatCount(r.total)}
                    label="Declared entries"
                    detail={`${formatCount(r.alterations.added)} added · ${formatCount(r.alterations.deleted)} deleted${r.statement_date ? ` · statement dated ${formatDate(r.statement_date, 'short')}` : ''}`}
                    accent="interests"
                  />
                  {r.ocr_rows > 0 ? (
                    <Text wordSafe variant="caption" testID="person-ocr">
                      {formatCount(r.ocr_rows)} entries were read by OCR from
                      scanned pages. Transcription may contain errors; check the
                      original register.
                    </Text>
                  ) : null}
                  {r.unread_pages ? (
                    <Text wordSafe variant="caption">
                      {formatCount(r.unread_pages)} pages could not be read. The
                      register may be incomplete.
                    </Text>
                  ) : null}
                  <RowList>
                    {Object.entries(r.buckets).map(([name, bucket]) => (
                      <Disclosure
                        key={name}
                        label={registerCategoryLabel(name)}
                        value={formatCount(bucket.count)}
                        testID={`interest-bucket-${name}`}
                      >
                        {() => (
                          <RowList>
                            {bucket.items.map((row, i) => (
                              <Group key={i} gap={rhythm.line}>
                                <Text wordSafe variant="strong">
                                  {row.holder}
                                </Text>
                                <Text wordSafe>
                                  {row.description ||
                                    'Description not recorded'}
                                </Text>
                                <Text wordSafe variant="caption">
                                  {row.kind}
                                  {row.date
                                    ? ` · ${formatDate(row.date, 'short')}`
                                    : ''}
                                  {row.page
                                    ? ` · page ${formatCount(row.page)}`
                                    : ''}
                                  {row.ocr ? ' · OCR transcription' : ''}
                                </Text>
                              </Group>
                            ))}
                          </RowList>
                        )}
                      </Disclosure>
                    ))}
                  </RowList>
                </Group>
              )}
            </RecordBlock>
            <RecordBlock
              title="Declared ties"
              id="person-ties"
              icon="link"
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
            <RecordBlock
              title="Pay for the posts held"
              id="person-pay"
              icon="dollarsign.circle"
              accent="money"
              partialMissing={partialMissing}
              block={b.pay}
              unlinked="This release does not link this person's salary entitlements. See the record on opax.com.au."
              missing="No covered federal salary entitlement is held for this person. State pay and service before 7 December 1999 are outside this series."
              retry={refresh}
              info={(p) =>
                p
                  ? {
                      title: 'About pay',
                      notes: [p.method, ...p.notCovered.map((n) => n.text)],
                    }
                  : null
              }
            >
              {(p) => (
                <Group>
                  {p.person.now ? (
                    <Group gap={rhythm.tight}>
                      <BigFigure
                        value={formatMoney(p.person.now.salary)}
                        spoken={`${moneyAccessibilityLabel(p.person.now.salary)} a year`}
                        label={`a year · ${p.person.now.post}${
                          p.person.now.assumed
                            ? ' (if named in the Opposition Leader’s notice)'
                            : ''
                        }`}
                        accent="money"
                      />
                      <Text wordSafe variant="metadata">
                        Base salary {formatMoney(p.base.amount)}
                        {p.person.now.pct
                          ? ` plus a ${formatPercent(p.person.now.pct, Number.isInteger(p.person.now.pct) ? 0 : 1)} loading`
                          : ''}
                        . Post held since {formatDate(p.person.now.since)}.
                      </Text>
                    </Group>
                  ) : (
                    <Text wordSafe>
                      No current pay rate is held. Historical entitlements are
                      listed below.
                    </Text>
                  )}
                  <Text wordSafe variant="caption">
                    These are entitlements set by instrument, not payslips.
                  </Text>
                  <RowList>
                    <Disclosure
                      label="Salary by financial year"
                      value={formatCount(p.person.by_year.length)}
                      testID="person-pay-years"
                    >
                      {() => (
                        <KeyValueList
                          items={p.person.by_year.map(([year, amount]) => ({
                            label: formatFinancialYear(year),
                            value: formatMoney(amount),
                          }))}
                        />
                      )}
                    </Disclosure>
                    <Disclosure
                      label="Posts held"
                      value={formatCount(p.person.spells.length)}
                      testID="person-pay-posts"
                    >
                      {() => (
                        <RowList>
                          {[...p.person.spells]
                            .reverse()
                            .map(([from, to, post, pct, salary], i) => (
                              <Group key={i} gap={rhythm.line}>
                                <Text wordSafe variant="strong">
                                  {post}
                                </Text>
                                <Text wordSafe variant="metadata">
                                  {formatDate(from, 'short')} to{' '}
                                  {to ? formatDate(to, 'short') : 'present'}
                                </Text>
                                <Text wordSafe>
                                  {formatMoney(salary)} a year ·{' '}
                                  {formatPercent(
                                    pct,
                                    Number.isInteger(pct) ? 0 : 1,
                                  )}{' '}
                                  loading at the end of this spell
                                </Text>
                              </Group>
                            ))}
                        </RowList>
                      )}
                    </Disclosure>
                  </RowList>
                </Group>
              )}
            </RecordBlock>
            <RecordBlock
              title="Claimed expenses"
              id="person-expenses"
              icon="creditcard"
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
                                  <Text variant="figureInline" tone="moneyInk">
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
            <RecordBlock
              title="Party receipts"
              id="person-receipts"
              icon="building.columns"
              accent="money"
              partialMissing={partialMissing}
              block={b.partyReceipts}
              missing="No receipts projection is linked for this person's party."
              unlinked="This release does not link party receipts for this person's party. See the record on opax.com.au."
              retry={refresh}
            >
              {(p) => (
                <Group gap={rhythm.tight}>
                  <Text wordSafe variant="metadata">
                    {p.caption}
                  </Text>
                  <RowList>
                    {p.party ? (
                      <LinkRow
                        title="Party receipts"
                        detail={p.party}
                        icon="banknote"
                        accent="money"
                        onPress={() => router.push(partyRoute(p.party!))}
                        testID="person-party-receipts"
                      />
                    ) : (
                      <OpaxWebLink
                        label="Party receipts"
                        path={p.url}
                        testID="person-party-receipts"
                      />
                    )}
                    <LinkRow
                      title="Money map"
                      icon="point.3.connected.trianglepath.dotted"
                      accent="money"
                      onPress={() =>
                        router.push(
                          moneyRoute(
                            identity.party ?? p.party,
                            identity.seats[0]?.jurisdiction,
                          ),
                        )
                      }
                      testID="person-money-map"
                    />
                  </RowList>
                </Group>
              )}
            </RecordBlock>
            <Section>
              <RowList>
                <OpaxWebLink
                  label="Speeches, topics and mentions"
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
