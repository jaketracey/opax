import { useCallback, useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../api/runtime';
import type { PartyPageRecord } from '../api/catalogs';
import { partyPageCopy, type PartyMember } from '../api/party-page';
import { billSentenceCase } from '../api/bill-transforms';
import {
  formatCount,
  formatDate,
  formatFinancialYear,
  formatMoney,
} from '../design/format';
import { chamberName, jurisdictionName } from '../design/parliament';
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
  PersonRow,
  RowList,
  Screen,
  Section,
  SourceLink,
  SubSection,
  Text,
  errorMessage,
} from '../design/primitives';
import { openOnWeb } from '../navigation/external';
import { billRoute, personRoute } from '../navigation/routes';
import { shareHeaderItem } from '../navigation/share';
import { CatalogState } from './CatalogState';
import { InlineLink } from './bills/parts';
import { useCatalogRecord } from './bills/useCatalogRecord';
import { MoneyMapLink } from './party/MoneyMapLink';
import { chamberLabel } from './bills/filters';

function Members({
  rows,
  recorded = false,
}: {
  rows: PartyMember[];
  recorded?: boolean;
}) {
  const groups = new Map<string, PartyMember[]>();
  for (const row of rows) {
    const key = `${row.jurisdiction}|${row.chamber}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return (
    <Group>
      {[...groups].map(([key, members]) => (
        <SubSection
          key={key}
          title={
            recorded
              ? 'Recorded affiliations'
              : `${jurisdictionName(members[0]!.jurisdiction) ?? 'Jurisdiction not recorded'} · ${chamberName(members[0]!.chamber, members[0]!.jurisdiction) ?? 'Chamber not recorded'}`
          }
        >
          <RowList>
            {members.map((member) => (
              <PersonRow
                key={member.slug}
                name={member.name}
                place={member.place || undefined}
                detail={
                  recorded
                    ? `Recorded affiliation; current membership not established${member.asAt ? `. Directory as at ${formatDate(member.asAt)}` : ''}`
                    : member.asAt
                      ? `Current evidence as at ${formatDate(member.asAt)}`
                      : 'Date not published'
                }
                onPress={() => router.push(personRoute(member.slug))}
                testID={`party-member-${member.slug}`}
                testDrawnName
              />
            ))}
          </RowList>
        </SubSection>
      ))}
    </Group>
  );
}
export default function Party() {
  const { slug, name } = useLocalSearchParams<{
    slug: string;
    name?: string;
  }>();
  return <PartyPage key={slug} input={name ?? slug} />;
}
export function PartyPage({ input }: { input: string }) {
  const load = useCallback(
    (refresh: boolean, publish: (record: PartyPageRecord) => void) =>
      catalogs.partyPage(input, refresh, publish),
    [input],
  );
  const { record, error, refresh, retry, refreshing } = useCatalogRecord(load);
  const [membersOpen, setMembersOpen] = useState(false);
  const [recordedOpen, setRecordedOpen] = useState(false);
  const [yearsOpen, setYearsOpen] = useState(false);
  const [allDivisions, setAllDivisions] = useState(false);
  const view = record?.data;
  const webPath = `/subject/party/${encodeURIComponent(view?.label ?? input)}`;
  // A resolved catalog absence is different from a failed read. Only the
  // former automatically follows the existing web fallback.
  useEffect(() => {
    if (record && record.data === null) void openOnWeb(webPath, input);
  }, [record, webPath, input]);
  return (
    <>
      <Stack.Screen
        options={{
          title: view?.label ?? '',
          headerTitle: '',
          unstable_headerRightItems: view
            ? () => [shareHeaderItem({ path: webPath, title: view.label })]
            : undefined,
        }}
      />
      <Screen
        testID="party-screen"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {error ? (
          <ErrorState
            message={errorMessage(error)}
            onRetry={retry}
            testID="party-error"
          />
        ) : null}
        {!record && !error ? (
          <LoadingState label="Loading the party record" />
        ) : null}
        {record && !view ? (
          <Group>
            <EmptyState message="This party could not be resolved from the published catalogs." />
            <OpaxWebLink
              label={input}
              path={webPath}
              testID="party-web-fallback"
            />
          </Group>
        ) : null}
        {view ? (
          <>
            <Group>
              <Text variant="metadata">Political party</Text>
              <Heading level={1} testID="party-title">
                {view.label}
              </Heading>
              <PartyLabel party={view.label} status="unknown" linked={false} />
            </Group>
            <Section title="Members">
              <CatalogState
                block={view.members}
                empty="No member observations held."
                onRetry={retry}
                testID="party-members"
              >
                {(data) => (
                  <>
                    <AsAtLine
                      asOf={view.rosterAsAt}
                      citation="OPAX parliamentary roster"
                    />
                    <Text
                      wordSafe
                      variant="strong"
                      testID="party-current-count"
                    >
                      {formatCount(data.currentCount)} current members with
                      current evidence
                    </Text>
                    <Text wordSafe variant="fine">
                      Current members use their current party. A directory
                      snapshot is not a live roster. Undated affiliations appear
                      separately as recorded; former members are excluded.
                    </Text>
                    <Button
                      label={`${membersOpen ? 'Hide' : 'Show'} current members`}
                      expanded={membersOpen}
                      onPress={() => setMembersOpen((v) => !v)}
                      testID="party-current-toggle"
                    />
                    {membersOpen ? (
                      data.current.length ? (
                        <Members rows={data.current} />
                      ) : (
                        <EmptyState message="No current member evidence is held for this party." />
                      )
                    ) : null}
                    {data.recorded.length ? (
                      <>
                        <Button
                          label={`${recordedOpen ? 'Hide' : 'Show'} recorded affiliations (${formatCount(data.recorded.length)})`}
                          expanded={recordedOpen}
                          onPress={() => setRecordedOpen((v) => !v)}
                          testID="party-recorded-toggle"
                        />
                        {recordedOpen ? (
                          <Group>
                            <Heading level={3}>Recorded</Heading>
                            <Members rows={data.recorded} recorded />
                          </Group>
                        ) : null}
                      </>
                    ) : null}
                  </>
                )}
              </CatalogState>
            </Section>
            <Section title="Party receipts">
              <CatalogState
                block={view.receipts}
                empty="No receipts total is recorded for this party in the money graph."
                onRetry={retry}
                testID="party-receipts"
              >
                {(data) => (
                  <>
                    <KeyValueList
                      items={[
                        {
                          label: partyPageCopy.caption,
                          value: formatMoney(data.node.total),
                          testID: 'party-receipts-total',
                        },
                        {
                          label: 'Rank',
                          value: `#${data.rank} of ${data.parties} parties`,
                        },
                        {
                          label: 'Donations counted',
                          value: formatCount(data.node.count),
                        },
                        ...(data.node.firstYear !== undefined &&
                        data.node.lastYear !== undefined
                          ? [
                              {
                                label: 'Active years',
                                value: `${data.node.firstYear}–${data.node.lastYear}`,
                              },
                            ]
                          : []),
                      ]}
                    />
                    <Heading level={3}>Where it came from</Heading>
                    <RowList>
                      {data.donors.map((donor) => (
                        <Group key={donor.id} gap={4}>
                          <Text wordSafe variant="strong">
                            {donor.name}
                          </Text>
                          <Text variant="figureInline">
                            {formatMoney(donor.amount)}
                          </Text>
                        </Group>
                      ))}
                    </RowList>
                    <Button
                      label={`${yearsOpen ? 'Hide' : 'Show'} top donors by year`}
                      expanded={yearsOpen}
                      onPress={() => setYearsOpen((v) => !v)}
                      testID="party-donor-years-toggle"
                    />
                    {yearsOpen ? (
                      <Group>
                        {data.byYear.map((row) => (
                          <SubSection
                            key={row.year}
                            title={
                              row.year === 'undated'
                                ? 'Undated'
                                : formatFinancialYear(Number(row.year))
                            }
                          >
                            <RowList>
                              {row.donors.map((donor) => (
                                <Text wordSafe key={donor.id}>
                                  {donor.name}: {formatMoney(donor.amount)}
                                </Text>
                              ))}
                            </RowList>
                          </SubSection>
                        ))}
                      </Group>
                    ) : null}
                  </>
                )}
              </CatalogState>
              <Text wordSafe variant="fine" testID="party-money-caveat">
                {partyPageCopy.aec}
              </Text>
              {view.moneyMeta ? (
                <Group>
                  <Text wordSafe variant="fine">
                    Top donors are the displayed donor-to-party flows, not all
                    party receipts. Year keys use the first year of each
                    financial year; election returns use polling year. No
                    sequence or causal link is inferred.
                  </Text>
                </Group>
              ) : null}
              <SourceLink
                citation="AEC disclosure returns, CC BY 4.0"
                url="https://transparency.aec.gov.au/"
                kind="register"
              />
              <MoneyMapLink />
            </Section>
            <Section title="Associated entities">
              <CatalogState
                block={view.associated}
                empty="No associated-entity return is held for this party."
                onRetry={retry}
                testID="party-associated"
              >
                {(data) => (
                  <>
                    {!data.rows.length ? (
                      <EmptyState message="No associated-entity return is held for this party." />
                    ) : null}
                    <RowList>
                      {data.rows.map((entity) => (
                        <Group key={entity.name} gap={4}>
                          <OpaxWebLink
                            label={entity.name}
                            path={`/subject/campaigner/${encodeURIComponent(entity.name)}`}
                          />
                          <Text wordSafe variant="metadata">
                            {entity.year}
                            {entity.receipts !== null
                              ? ` · receipts ${formatMoney(entity.receipts)}`
                              : ''}
                            {entity.payments !== null
                              ? ` · payments ${formatMoney(entity.payments)}`
                              : ''}
                            {entity.debts
                              ? ` · debts ${formatMoney(entity.debts)}`
                              : ''}
                          </Text>
                        </Group>
                      ))}
                    </RowList>
                    {data.total > data.rows.length ? (
                      <Text wordSafe variant="fine">
                        {data.total} entities have named {view.label} on an
                        associated-entity return; the {data.rows.length} with
                        the largest receipts on their latest return are shown,
                        each with that return&apos;s year.
                      </Text>
                    ) : null}
                    <Text wordSafe variant="fine">
                      These are the entities&apos; own annual returns. They are
                      not added to the party&apos;s receipts. Names are matched
                      on case, punctuation and company suffixes only; the same
                      body under two spellings appears twice. Debts are the
                      balances owed at 30 June, not new borrowing. Creditors
                      under the disclosure threshold are not itemised.
                    </Text>
                  </>
                )}
              </CatalogState>
              <SourceLink
                citation="AEC Transparency Register, CC BY 4.0"
                url="https://transparency.aec.gov.au/"
                kind="register"
              />
            </Section>
            <Section title="Bills they divided on">
              <CatalogState
                block={view.divisions}
                empty="Bill divisions could not be read."
                onRetry={retry}
                testID="party-divisions"
              >
                {(data) => (
                  <>
                    {data.rows.length ? (
                      <RowList>
                        {(allDivisions
                          ? data.rows
                          : data.rows.slice(0, 10)
                        ).map((row) => (
                          <Group
                            key={`${row.billKey}:${row.division.key}`}
                            gap={8}
                          >
                            <InlineLink
                              label={row.title}
                              onPress={() =>
                                router.push(billRoute(row.billKey, 'divisions'))
                              }
                              testID={`party-bill-${row.billKey}`}
                            />
                            <Text wordSafe>
                              {row.question || row.division.stage || 'Division'}
                            </Text>
                            <Text wordSafe variant="metadata">
                              {formatDate(row.division.date)} ·{' '}
                              {chamberLabel(row.division.house)} ·{' '}
                              {row.division.outcome === 'affirmative'
                                ? 'Agreed to'
                                : row.division.outcome === 'negative'
                                  ? 'Negatived'
                                  : billSentenceCase(row.division.outcome) ||
                                    'Outcome not recorded'}
                            </Text>
                            <Text wordSafe variant="strong">
                              {row.ayes} for, {row.noes} against
                            </Text>
                            <AsAtLine
                              asOf={row.division.date}
                              citation="They Vote For You"
                              licence="ODbL"
                            />
                            <SourceLink
                              citation="They Vote For You"
                              record={`division, ${formatDate(row.division.date)}`}
                              url={row.division.url}
                              kind="record"
                            />
                          </Group>
                        ))}
                      </RowList>
                    ) : (
                      <EmptyState
                        message={`No division in the ${data.scanned} most recent bills the register could open records a vote by this party.`}
                      />
                    )}
                    {!allDivisions && data.rows.length > 10 ? (
                      <Button
                        label={`Show more (${data.rows.length - 10} more)`}
                        onPress={() => setAllDivisions(true)}
                      />
                    ) : null}
                    <Text wordSafe variant="fine">
                      This party&apos;s own ayes and noes, newest first, read
                      from the {data.scanned} most recently decided bills the
                      register could open — not the party&apos;s whole voting
                      history, and not every bill it divided on. Party is each
                      member&apos;s recorded affiliation, not a reconstruction
                      of who they sat with on the day. A division on an
                      amendment is not a vote on the bill itself.
                    </Text>
                    <Text wordSafe variant="fine">
                      {data.basisNote}
                    </Text>
                    {data.failed ? (
                      <Text wordSafe variant="fine">
                        {data.failed} bill files could not be read. This block
                        is partial.
                      </Text>
                    ) : null}
                  </>
                )}
              </CatalogState>
            </Section>
            <Text variant="fine" testID="party-end">
              End of party page
            </Text>
          </>
        ) : null}
      </Screen>
    </>
  );
}
