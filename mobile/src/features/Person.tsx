import {
  formatCount,
  formatDate,
  formatFinancialYear,
  formatMoney,
  formatPercent,
  formatYearRange,
} from '../design/format';
import { useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../api/runtime';
import { CachedPortrait } from './CachedPortrait';
import type { PortraitInfo } from '../api/portrait-index';
import {
  AsAtLine,
  Button,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  KeyValueList,
  LoadingState,
  OpaxWebLink,
  PartyLabel,
  Screen,
  Section,
  SourceLink,
  StatRow,
  SubSection,
  Text,
  errorMessage,
} from '../design/primitives';
import {
  CHAMBER_NOT_RECORDED,
  chamberName,
  jurisdictionName,
} from '../design/parliament';
import { shareHeaderItem } from '../navigation/share';
import { billRoute, electorateRoute, partyRoute } from '../navigation/routes';
import { InlineLink } from './bills/parts';
import { EvidenceFooter, RecordBlock } from './your-mp/Evidence';
import {
  uncoveredProfile,
  hasParliamentaryMembership,
  votingMetaFor,
  registerCategoryLabel,
  type ProfileView,
} from './your-mp/model';
function Disclosure({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: () => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Group gap={8}>
      <Button
        label={open ? `Hide ${label.toLowerCase()}` : label}
        testID={id}
        onPress={() => setOpen((v) => !v)}
      />
      {open ? children() : null}
    </Group>
  );
}
export default function Person() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <ProfileScreen key={slug} slug={slug} />;
}
function ProfileScreen({ slug }: { slug: string }) {
  const [profile, setProfile] = useState<ProfileView | null>(null),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0),
    [refreshing, setRefreshing] = useState(false),
    [portrait, setPortrait] = useState<PortraitInfo | null>(null),
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
      <Stack.Screen
        options={{
          title: identity?.name ?? '',
          headerTitle: '',
          unstable_headerRightItems: identity
            ? () => [shareHeaderItem({ path: webPath, title: identity.name })]
            : undefined,
        }}
      />
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
            <Group>
              <CachedPortrait
                name={identity.name}
                slug={slug}
                size="profile"
                testID="person-portrait"
                onCredit={setPortrait}
                retryKey={retry}
              />
              <Heading level={1} testID="person-screen-title">
                {identity.name}
              </Heading>
              <PartyLabel
                party={identity.party}
                status={identity.partyStatus}
                formerly={identity.formerly}
                testID="person-party"
              />
              {identity.seats.length ? (
                identity.seats.map((seat) => (
                  <Group key={seat.electorate_id} gap={4}>
                    <Text wordSafe variant="strong" testID="person-electorate">
                      {seat.name}
                    </Text>
                    <Text wordSafe variant="metadata" testID="person-chamber">
                      {chamberName(seat.chamber, seat.jurisdiction) ??
                        CHAMBER_NOT_RECORDED}
                    </Text>
                    <Text wordSafe variant="metadata">
                      {jurisdictionName(seat.jurisdiction) ??
                        'Jurisdiction not recorded'}
                    </Text>
                    <AsAtLine
                      asOf={seat.as_of}
                      citation={b.identity.sources.map((s) => s.label)}
                    />
                    <Button
                      label={`${seat.name} electorate`}
                      onPress={() =>
                        router.push(electorateRoute(seat.electorate_id))
                      }
                    />
                  </Group>
                ))
              ) : (
                <Text wordSafe>
                  No current electorate observation is held in this release.
                </Text>
              )}
              {profile.personId === null ? (
                <Text wordSafe>
                  The electorate release does not include this person. Only the
                  public directory identity is linked here. Other records may be
                  available on opax.com.au.
                </Text>
              ) : null}
              <Text wordSafe variant="fine">
                These are dated public records. Representation may have changed
                since collection.
              </Text>
              <EvidenceFooter block={b.identity} id="person" />
            </Group>
            {portrait ? (
              <Section
                title={
                  /^\d+$/.test(portrait.key) ? 'Official portrait' : 'Photo'
                }
                testID="person-portrait-credit"
              >
                <Group gap={8}>
                  <Text
                    wordSafe
                    variant="fine"
                    testID="person-portrait-attribution"
                  >
                    {portrait.credit} · {portrait.licence}
                    {!/^\d+$/.test(portrait.key)
                      ? ', via Wikimedia Commons'
                      : ''}
                  </Text>
                  {portrait.attribution ? (
                    <Text wordSafe variant="fine">
                      {portrait.attribution}
                    </Text>
                  ) : null}
                  <SourceLink
                    citation="Portrait licence"
                    url={
                      portrait.licenceURL.startsWith('https:')
                        ? portrait.licenceURL
                        : portrait.sourceURL
                    }
                    kind="record"
                    testID="person-portrait-licence"
                  />
                  <SourceLink
                    citation={
                      /^\d+$/.test(portrait.key)
                        ? 'Parliament of Australia, via OpenAustralia'
                        : 'Wikimedia Commons'
                    }
                    url={portrait.sourceURL}
                    kind="record"
                    testID="person-portrait-source"
                  />
                </Group>
              </Section>
            ) : null}
            <RecordBlock
              title="Voting record"
              id="person-votes"
              block={b.votes}
              missing="No voting summary is held for this person in the release."
              retry={refresh}
              date={false}
            >
              {(v) => (
                <Group>
                  <StatRow
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
                  <Text wordSafe>{v.method}</Text>
                  <Disclosure label="Bill votes" id="person-bill-votes">
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
                              v[side].map((row, i) => (
                                <Group key={i} gap={4}>
                                  <Text wordSafe variant="strong">
                                    {row.name}
                                  </Text>
                                  <Text wordSafe variant="metadata">
                                    {row.stage} · {formatDate(row.date)}
                                  </Text>
                                  {row.billKey ? (
                                    <InlineLink
                                      label="Bill record"
                                      accessibilityLabel={`Bill record: ${row.name}`}
                                      onPress={() =>
                                        router.push(billRoute(row.billKey!))
                                      }
                                      testID={`person-bill-${side}-${i}`}
                                    />
                                  ) : (
                                    <Text wordSafe variant="fine">
                                      Not matched to a bill record
                                    </Text>
                                  )}
                                </Group>
                              ))
                            ) : (
                              <EmptyState message="None of their recorded divisions was a vote on a bill itself." />
                            )}
                          </SubSection>
                        ))}
                      </Group>
                    )}
                  </Disclosure>
                  {(v.jurisdictions.length ? v.jurisdictions : [undefined]).map(
                    (jur, i) => (
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
                    ),
                  )}
                </Group>
              )}
            </RecordBlock>
            {b.votes.data === null ? (
              <AsAtLine votes={null} testID="person-votes-as-at" />
            ) : null}
            <RecordBlock
              title="Declared interests"
              id="person-interests"
              block={b.interests}
              missing="No register file is held for this person in the covered registers."
              retry={refresh}
            >
              {(r) => (
                <Group>
                  <Text wordSafe>
                    {formatCount(r.total)} declared entries ·{' '}
                    {formatCount(r.alterations.added)} added ·{' '}
                    {formatCount(r.alterations.deleted)} deleted.
                  </Text>
                  {r.statement_date ? (
                    <Text wordSafe variant="metadata">
                      Statement dated {formatDate(r.statement_date)}
                    </Text>
                  ) : null}
                  {r.ocr_rows > 0 ? (
                    <Text wordSafe testID="person-ocr">
                      {formatCount(r.ocr_rows)} entries were read by OCR from
                      scanned pages. Transcription may contain errors; check the
                      original register.
                    </Text>
                  ) : null}
                  {r.unread_pages ? (
                    <Text wordSafe>
                      {formatCount(r.unread_pages)} pages could not be read. The
                      register may be incomplete.
                    </Text>
                  ) : null}
                  {Object.entries(r.buckets).map(([name, bucket]) => (
                    <Disclosure
                      key={name}
                      label={`${registerCategoryLabel(name)} (${formatCount(bucket.count)})`}
                      id={`interest-bucket-${name}`}
                    >
                      {() => (
                        <Group>
                          {bucket.items.map((row, i) => (
                            <Group key={i} gap={4}>
                              <Text wordSafe variant="strong">
                                {row.holder}
                              </Text>
                              <Text wordSafe>
                                {row.description || 'Description not recorded'}
                              </Text>
                              <Text wordSafe variant="metadata">
                                {row.kind}
                                {row.date ? ` · ${formatDate(row.date)}` : ''}
                                {row.page
                                  ? ` · page ${formatCount(row.page)}`
                                  : ''}
                              </Text>
                              {row.ocr ? (
                                <Text wordSafe variant="fine">
                                  OCR transcription; check the original
                                  register.
                                </Text>
                              ) : null}
                            </Group>
                          ))}
                        </Group>
                      )}
                    </Disclosure>
                  ))}
                </Group>
              )}
            </RecordBlock>
            <RecordBlock
              title="Declared ties"
              id="person-ties"
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
                  <Text wordSafe>
                    Declared ties are public disclosures, not findings of
                    wrongdoing.
                  </Text>
                  <Disclosure
                    label="Declared organisations"
                    id="person-ties-detail"
                  >
                    {() => (
                      <Group>
                        {ties.map((tie, i) => (
                          <Group key={i} gap={4}>
                            <Text wordSafe variant="strong">
                              {tie.organisation}
                            </Text>
                            <Text wordSafe>{tie.kinds.join('; ')}</Text>
                            {tie.declarations.map((d, j) => (
                              <Text wordSafe key={j}>
                                {d.category}: {d.description}
                              </Text>
                            ))}
                          </Group>
                        ))}
                      </Group>
                    )}
                  </Disclosure>
                </Group>
              )}
            </RecordBlock>
            <RecordBlock
              title="Pay for the posts held"
              id="person-pay"
              block={b.pay}
              unlinked="This release does not link this person's salary entitlements. See the record on opax.com.au."
              missing="No covered federal salary entitlement is held for this person. State pay and service before 7 December 1999 are outside this series."
              retry={refresh}
            >
              {(p) => (
                <Group>
                  {p.person.now ? (
                    <>
                      <Text wordSafe variant="figureInline">
                        {formatMoney(p.person.now.salary)} a year
                      </Text>
                      <Text wordSafe>
                        {p.person.now.post}
                        {p.person.now.assumed
                          ? ' (if named in the Opposition Leader’s notice)'
                          : ''}
                      </Text>
                      <Text wordSafe>
                        Base salary {formatMoney(p.base.amount)}
                        {p.person.now.pct
                          ? ` plus a ${formatPercent(p.person.now.pct, Number.isInteger(p.person.now.pct) ? 0 : 1)} loading`
                          : ''}
                        .
                      </Text>
                      <Text wordSafe variant="metadata">
                        Post held since {formatDate(p.person.now.since)}
                      </Text>
                    </>
                  ) : (
                    <Text wordSafe>
                      No current pay rate is held. Historical entitlements are
                      listed below.
                    </Text>
                  )}
                  <Text wordSafe>
                    These are entitlements set by instrument, not payslips.
                  </Text>
                  <Text wordSafe>{p.method}</Text>
                  <Disclosure
                    label="Salary by financial year"
                    id="person-pay-years"
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
                  <Disclosure label="Posts held" id="person-pay-posts">
                    {() => (
                      <Group>
                        {[...p.person.spells]
                          .reverse()
                          .map(([from, to, post, pct, salary], i) => (
                            <Group key={i} gap={4}>
                              <Text wordSafe variant="strong">
                                {post}
                              </Text>
                              <Text wordSafe variant="metadata">
                                {formatDate(from)} to{' '}
                                {to ? formatDate(to) : 'present'}
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
                      </Group>
                    )}
                  </Disclosure>
                  <Disclosure label="Pay coverage" id="person-pay-coverage">
                    {() => (
                      <Group>
                        {p.notCovered.map((note) => (
                          <Text wordSafe key={note.id}>
                            {note.text}
                          </Text>
                        ))}
                      </Group>
                    )}
                  </Disclosure>
                </Group>
              )}
            </RecordBlock>
            <RecordBlock
              title="Claimed expenses"
              id="person-expenses"
              block={b.expenses}
              missing="No expense summary is held for this person. IPEA coverage starts in April 2017."
              retry={refresh}
            >
              {(e) => (
                <Group>
                  <Text wordSafe variant="figureInline">
                    {formatMoney(e.person.total)}
                  </Text>
                  <Text wordSafe>
                    Recorded expenses,{' '}
                    {formatYearRange(e.person.from, e.person.to)}
                  </Text>
                  <Text wordSafe>
                    Coverage: {e.coverage.from} to {e.coverage.to}
                  </Text>
                  <Text wordSafe>{e.note}</Text>
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
                  <Text wordSafe>
                    Benchmark: {formatCount(e.benchmarks.count)} members with
                    records through {e.benchmarks.latestQuarter}, starting in{' '}
                    {e.benchmarks.fromCutoff} or earlier. Partial calendar years
                    can affect the comparison. The recorded annual average is
                    the supplied total divided by its covered calendar years.
                    This comparison is a lead, not a finding.
                  </Text>
                  <Disclosure
                    label="Expenses by year"
                    id="person-expense-years"
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
                    id="person-expense-categories"
                  >
                    {() => (
                      <Group>
                        {e.person.by_category.map(([name, amount]) => {
                          const category = e.categories?.categories.find(
                            (c) => c.name === name,
                          );
                          return (
                            <Group key={name} gap={4}>
                              <Text wordSafe variant="strong">
                                {name}
                              </Text>
                              <Text wordSafe variant="figureInline">
                                {formatMoney(amount)}
                              </Text>
                              {category ? (
                                <>
                                  <Text wordSafe>{category.text}</Text>
                                  {category.note ? (
                                    <Text wordSafe variant="fine">
                                      {category.note}
                                    </Text>
                                  ) : null}
                                </>
                              ) : (
                                <Text wordSafe>
                                  Category definition not held.
                                </Text>
                              )}
                            </Group>
                          );
                        })}
                      </Group>
                    )}
                  </Disclosure>
                  {e.categories ? (
                    <>
                      <Text wordSafe variant="fine">
                        {e.categories.meta.licence_note}
                      </Text>
                      <AsAtLine
                        asOf={e.categories.meta.updated}
                        citation={e.categories.meta.source}
                        licence={e.categories.meta.licence}
                      />
                      <SourceLink
                        citation="Expense category licence"
                        url={e.categories.meta.licence_url}
                        kind="record"
                      />
                    </>
                  ) : (
                    <Text wordSafe>
                      Category definitions and their licence notes could not be
                      loaded.
                    </Text>
                  )}
                </Group>
              )}
            </RecordBlock>
            <RecordBlock
              title="Party receipts"
              id="person-receipts"
              block={b.partyReceipts}
              missing="No receipts projection is linked for this person's party."
              unlinked="This release does not link party receipts for this person's party. See the record on opax.com.au."
              retry={refresh}
            >
              {(p) => (
                <Group>
                  <Text wordSafe>{p.caption}</Text>
                  {p.party ? (
                    <Button
                      label="Party receipts"
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
                </Group>
              )}
            </RecordBlock>
            <Section>
              <OpaxWebLink
                label="Speeches, topics and mentions"
                path={webPath}
                testID="person-web"
              />
              <Text wordSafe variant="fine" testID="person-end">
                End of profile
              </Text>
            </Section>
          </>
        ) : null}
      </Screen>
    </>
  );
}
