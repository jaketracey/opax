import {
  formatCount,
  formatDate,
  formatFinancialYear,
  formatMoney,
  formatPercent,
  formatYearRange,
} from '../design/format';
import { useEffect, useState } from 'react';
import { Image, RefreshControl } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../api/runtime';
import { ApiError } from '../api/errors';
import { remoteImageURI } from '../api/image-policy';
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
  Portrait,
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
import { electorateRoute } from '../navigation/routes';
import { EvidenceFooter, RecordBlock } from './your-mp/Evidence';
import {
  uncoveredProfile,
  hasParliamentaryMembership,
  votingMetaFor,
  type ProfileView,
} from './your-mp/model';
function Disclosure({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Group gap={8}>
      <Button
        label={open ? `Hide ${label.toLowerCase()}` : label}
        testID={id}
        onPress={() => setOpen((v) => !v)}
      />
      {open ? children : null}
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
    [busy, setBusy] = useState(true),
    [portraitFailed, setPortraitFailed] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      const person = await catalogs.person(slug);
      if (
        !person.data.canonicalPersonId &&
        !hasParliamentaryMembership(person.data, await catalogs.directory())
      )
        throw new ApiError(
          'not-found',
          'Native profiles cover parliamentarians in the public record. This person is outside the covered parliamentary roster.',
        );
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
        if (active) setProfile(p);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [slug, retry]);
  const refresh = () => {
      setBusy(true);
      setError(null);
      setPortraitFailed(false);
      setRetry((v) => v + 1);
    },
    identity = profile?.blocks.identity.data,
    b = profile?.blocks;
  const portrait = b?.portrait.data;
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
          <RefreshControl refreshing={busy} onRefresh={refresh} />
        }
      >
        {error ? (
          <ErrorState message={error} onRetry={refresh} testID="person-error" />
        ) : null}
        {!profile && !error ? (
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
              {portrait?.display === 'permitted' && !portraitFailed ? (
                <Image
                  source={{ uri: remoteImageURI(portrait.path) }}
                  style={{ width: 88, height: 88, borderRadius: 44 }}
                  resizeMode="contain"
                  accessibilityElementsHidden
                  accessibilityIgnoresInvertColors
                  onError={() => setPortraitFailed(true)}
                  testID="person-portrait"
                />
              ) : (
                <Portrait size="profile" testID="person-blank-portrait" />
              )}
              <Heading level={1} testID="person-screen-title">
                {identity.name}
              </Heading>
              <PartyLabel
                party={identity.party}
                current={identity.partyCurrent}
                formerly={identity.formerly}
                testID="person-party"
              />
              {identity.seats.length ? (
                identity.seats.map((seat) => (
                  <Group key={seat.electorate_id} gap={4}>
                    <Text variant="strong" testID="person-electorate">
                      {seat.name}
                    </Text>
                    <Text variant="metadata" testID="person-chamber">
                      {chamberName(seat.chamber, seat.jurisdiction) ??
                        CHAMBER_NOT_RECORDED}
                    </Text>
                    <Text variant="metadata">
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
                <Text>
                  No current electorate observation is held in this release.
                </Text>
              )}
              {profile.personId === null ? (
                <Text>
                  The electorate release does not include this person. Only the
                  public directory identity is available here.
                </Text>
              ) : null}
              <Text variant="fine">
                These are dated public records. Representation may have changed
                since collection.
              </Text>
              <EvidenceFooter block={b.identity} id="person" />
            </Group>
            <RecordBlock
              title="Portrait credit"
              id="person-portrait-credit"
              block={b.portrait}
              missing="No portrait with display permission is available."
              retry={refresh}
            >
              {(p) => (
                <Group gap={8}>
                  <Text variant="fine">
                    {p.credit} · {p.licence}
                  </Text>
                  <Text variant="fine">{p.attribution}</Text>
                  <Text variant="fine">{p.notice}</Text>
                  {p.display !== 'permitted' ? (
                    <Text variant="fine">
                      Portrait display permission needs review. A blank circle
                      is shown.
                    </Text>
                  ) : portraitFailed ? (
                    <Text variant="fine">
                      The permitted portrait could not be loaded. A blank circle
                      is shown.
                    </Text>
                  ) : null}
                  <SourceLink
                    citation="Portrait licence"
                    url={
                      p.licenceURL.startsWith('https:')
                        ? p.licenceURL
                        : p.sourceURL
                    }
                    kind="record"
                  />
                </Group>
              )}
            </RecordBlock>
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
                    <Text>
                      {formatPercent(v.ayePct)} ayes in the recorded divisions
                      {v.years.length === 2
                        ? `, ${formatYearRange(v.years[0]!, v.years[1]!)}`
                        : ''}
                      .
                    </Text>
                  ) : null}
                  <Text>{v.method}</Text>
                  <Disclosure label="Bill votes" id="person-bill-votes">
                    <Group>
                      {(['for', 'against'] as const).map((side) => (
                        <SubSection
                          key={side}
                          title={side === 'for' ? 'Voted for' : 'Voted against'}
                        >
                          {v[side].length ? (
                            v[side].map((row, i) => (
                              <Group key={i} gap={4}>
                                <Text variant="strong">{row.name}</Text>
                                <Text variant="metadata">
                                  {row.stage} · {formatDate(row.date)}
                                </Text>
                                <Text variant="fine">
                                  {row.billKey
                                    ? 'Bill record on opax.com.au'
                                    : 'Not matched to a bill record'}
                                </Text>
                                {row.billKey ? (
                                  <OpaxWebLink
                                    label="Bill record"
                                    path={`/bill/${row.billKey}`}
                                  />
                                ) : null}
                              </Group>
                            ))
                          ) : (
                            <EmptyState message="None of their recorded divisions was a vote on a bill itself." />
                          )}
                        </SubSection>
                      ))}
                    </Group>
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
                  <Text>
                    {formatCount(r.total)} declared entries ·{' '}
                    {formatCount(r.alterations.added)} added ·{' '}
                    {formatCount(r.alterations.deleted)} deleted.
                  </Text>
                  {r.statement_date ? (
                    <Text variant="metadata">
                      Statement dated {formatDate(r.statement_date)}
                    </Text>
                  ) : null}
                  {r.ocr_rows > 0 ? (
                    <Text testID="person-ocr">
                      {formatCount(r.ocr_rows)} entries were read by OCR from
                      scanned pages. Transcription may contain errors; check the
                      original register.
                    </Text>
                  ) : null}
                  {r.unread_pages ? (
                    <Text>
                      {formatCount(r.unread_pages)} pages could not be read. The
                      register may be incomplete.
                    </Text>
                  ) : null}
                  {Object.entries(r.buckets).map(([name, bucket]) => (
                    <Disclosure
                      key={name}
                      label={`${name.charAt(0).toUpperCase()}${name.slice(1).replaceAll('_', ' ')} (${formatCount(bucket.count)})`}
                      id={`interest-bucket-${name}`}
                    >
                      <Group>
                        {bucket.items.map((row, i) => (
                          <Group key={i} gap={4}>
                            <Text variant="strong">{row.holder}</Text>
                            <Text>
                              {row.description || 'Description not recorded'}
                            </Text>
                            <Text variant="metadata">
                              {row.kind}
                              {row.date ? ` · ${formatDate(row.date)}` : ''}
                              {row.page
                                ? ` · page ${formatCount(row.page)}`
                                : ''}
                            </Text>
                            {row.ocr ? (
                              <Text variant="fine">
                                OCR transcription; check the original register.
                              </Text>
                            ) : null}
                          </Group>
                        ))}
                      </Group>
                    </Disclosure>
                  ))}
                </Group>
              )}
            </RecordBlock>
            <RecordBlock
              title="Declared ties"
              id="person-ties"
              block={b.ties}
              missing="No declared organisation ties are held in this register file."
              retry={refresh}
            >
              {(ties) => (
                <Group>
                  <Text>
                    Declared ties are public disclosures, not findings of
                    wrongdoing.
                  </Text>
                  <Disclosure
                    label="Declared organisations"
                    id="person-ties-detail"
                  >
                    <Group>
                      {ties.map((tie, i) => (
                        <Group key={i} gap={4}>
                          <Text variant="strong">{tie.organisation}</Text>
                          <Text>{tie.kinds.join('; ')}</Text>
                          {tie.declarations.map((d, j) => (
                            <Text key={j}>
                              {d.category}: {d.description}
                            </Text>
                          ))}
                        </Group>
                      ))}
                    </Group>
                  </Disclosure>
                </Group>
              )}
            </RecordBlock>
            <RecordBlock
              title="Pay for the posts held"
              id="person-pay"
              block={b.pay}
              missing="No covered federal salary entitlement is held for this person. State pay and service before 7 December 1999 are outside this series."
              retry={refresh}
            >
              {(p) => (
                <Group>
                  {p.person.now ? (
                    <>
                      <Text variant="figureInline">
                        {formatMoney(p.person.now.salary)} a year
                      </Text>
                      <Text>
                        {p.person.now.post}
                        {p.person.now.assumed
                          ? ' (if named in the Opposition Leader’s notice)'
                          : ''}
                      </Text>
                      <Text>
                        Base salary {formatMoney(p.base.amount)}
                        {p.person.now.pct
                          ? ` plus a ${formatPercent(p.person.now.pct)} loading`
                          : ''}
                        .
                      </Text>
                      <Text variant="metadata">
                        Post held since {formatDate(p.person.now.since)}
                      </Text>
                    </>
                  ) : (
                    <Text>
                      No current pay rate is held. Historical entitlements are
                      listed below.
                    </Text>
                  )}
                  <Text>
                    These are entitlements set by instrument, not payslips.
                  </Text>
                  <Text>{p.method}</Text>
                  <Disclosure
                    label="Salary by financial year"
                    id="person-pay-years"
                  >
                    <KeyValueList
                      items={p.person.by_year.map(([year, amount]) => ({
                        label: formatFinancialYear(year),
                        value: formatMoney(amount),
                      }))}
                    />
                  </Disclosure>
                  <Disclosure label="Posts held" id="person-pay-posts">
                    <Group>
                      {[...p.person.spells]
                        .reverse()
                        .map(([from, to, post, pct, salary], i) => (
                          <Group key={i} gap={4}>
                            <Text variant="strong">{post}</Text>
                            <Text variant="metadata">
                              {formatDate(from)} to{' '}
                              {to ? formatDate(to) : 'present'}
                            </Text>
                            <Text>
                              {formatMoney(salary)} a year ·{' '}
                              {formatPercent(pct)} loading at the end of this
                              spell
                            </Text>
                          </Group>
                        ))}
                    </Group>
                  </Disclosure>
                  <Disclosure label="Pay coverage" id="person-pay-coverage">
                    <Group>
                      {p.notCovered.map((note) => (
                        <Text key={note.id}>{note.text}</Text>
                      ))}
                    </Group>
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
                  <Text variant="figureInline">
                    {formatMoney(e.person.total)}
                  </Text>
                  <Text>
                    Recorded expenses,{' '}
                    {formatYearRange(e.person.from, e.person.to)}
                  </Text>
                  <Text>
                    Coverage: {e.coverage.from} to {e.coverage.to}
                  </Text>
                  <Text>{e.note}</Text>
                  <KeyValueList
                    items={[
                      {
                        label: 'Recorded annual average',
                        value: formatMoney(e.annual),
                      },
                      {
                        label: 'Benchmark annual median',
                        value: formatMoney(e.benchmarks.totalMedian),
                      },
                    ]}
                  />
                  <Text>
                    Benchmark: {formatCount(e.benchmarks.count)} members with
                    records through {e.benchmarks.latestQuarter}, starting in{' '}
                    {e.benchmarks.fromCutoff} or earlier. Partial calendar years
                    can affect the comparison. A bar past its tick is a fact,
                    not a finding.
                  </Text>
                  <Disclosure
                    label="Expenses by year"
                    id="person-expense-years"
                  >
                    <KeyValueList
                      items={e.person.by_year.map(([y, a]) => ({
                        label: String(y),
                        value: formatMoney(a),
                      }))}
                    />
                  </Disclosure>
                  <Disclosure
                    label="Expense categories"
                    id="person-expense-categories"
                  >
                    <Group>
                      {e.person.by_category.map(([name, amount]) => {
                        const category = e.categories?.categories.find(
                          (c) => c.name === name,
                        );
                        return (
                          <Group key={name} gap={4}>
                            <Text variant="strong">{name}</Text>
                            <Text variant="figureInline">
                              {formatMoney(amount)}
                            </Text>
                            {category ? (
                              <>
                                <Text>{category.text}</Text>
                                {category.note ? (
                                  <Text variant="fine">{category.note}</Text>
                                ) : null}
                              </>
                            ) : (
                              <Text>Category definition not held.</Text>
                            )}
                          </Group>
                        );
                      })}
                    </Group>
                  </Disclosure>
                  {e.categories ? (
                    <>
                      <Text variant="fine">
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
                    <Text>
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
              missing="No party receipts projection is held for this person."
              retry={refresh}
            >
              {(p) => (
                <Group>
                  <Text>{p.caption}</Text>
                  <OpaxWebLink
                    label="Party receipts"
                    path={p.url}
                    testID="person-party-receipts"
                  />
                </Group>
              )}
            </RecordBlock>
            <Section>
              <OpaxWebLink
                label="Speeches, topics and mentions"
                path={webPath}
                testID="person-web"
              />
              <Text variant="fine" testID="person-end">
                End of profile
              </Text>
            </Section>
          </>
        ) : null}
      </Screen>
    </>
  );
}
