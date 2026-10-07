import { AskAbout } from './ask/AskAbout';
import { headerItems } from '../navigation/chrome';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../api/runtime';
import type { PartyPageRecord } from '../api/catalogs';
import { partyPageCopy, type PartyMember } from '../api/party-page';
import { billSentenceCase } from '../api/bill-transforms';
import {
  formatCount,
  formatDate,
  formatDisclosureYear,
  disclosureYearNote,
  formatMoney,
} from '../design/format';
import { chamberName, jurisdictionName } from '../design/parliament';
import {
  AsAtLine,
  BigFigure,
  Button,
  Disclosure,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  KeyValueList,
  LinkRow,
  LoadingState,
  OpaxWebLink,
  PersonRow,
  RowList,
  Screen,
  Section,
  SourceLink,
  SubSection,
  Text,
  errorMessage,
} from '../design/primitives';
import { partyDot, partyWash } from '../design/party';
import { colors, radius, rhythm } from '../design/tokens';
import { openOnWeb } from '../navigation/external';
import { billRoute, personRoute } from '../navigation/routes';
import { shareHeaderItem } from '../navigation/share';
import { CatalogState } from './CatalogState';
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
                    ? `Recorded affiliation; current membership not established${member.asAt ? `. Directory as at ${formatDate(member.asAt, 'short')}` : ''}`
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
          ...headerItems(
            view
              ? () => [shareHeaderItem({ path: webPath, title: view.label })]
              : undefined,
          ),
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
            <View
              style={[styles.hero, { backgroundColor: partyWash(view.label) }]}
            >
              <View style={styles.kicker}>
                {partyDot(view.label) ? (
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={[
                      styles.dot,
                      { backgroundColor: partyDot(view.label)! },
                    ]}
                  />
                ) : null}
                <Text variant="kicker">Political party</Text>
              </View>
              <Heading level={1} testID="party-title">
                {view.label}
              </Heading>
            </View>
            <AskAbout kind="party" name={view.label} />
            <Section
              title="Members"
              icon="person.3.fill"
              accent="people"
              info={{
                title: 'About the member count',
                notes: [
                  'Current members use their current party. A directory snapshot is not a live roster. Undated affiliations appear separately as recorded; former members are excluded.',
                ],
                testID: 'party-members-info',
              }}
            >
              <CatalogState
                block={view.members}
                empty="No member observations held."
                onRetry={retry}
                testID="party-members"
              >
                {(data) => (
                  <>
                    <BigFigure
                      value={formatCount(data.currentCount)}
                      label="current members with current evidence"
                      detail={
                        view.rosterAsAt
                          ? `Roster as at ${formatDate(view.rosterAsAt, 'short')}`
                          : undefined
                      }
                      accessibilityLabel={`${formatCount(data.currentCount)} current members with current evidence`}
                      accent="people"
                      testID="party-current-count"
                    />
                    <RowList>
                      <Disclosure
                        label="Current members"
                        value={formatCount(data.current.length)}
                        open={membersOpen}
                        onToggle={setMembersOpen}
                        testID="party-current-toggle"
                      >
                        {() =>
                          data.current.length ? (
                            <Members rows={data.current} />
                          ) : (
                            <EmptyState message="No current member evidence is held for this party." />
                          )
                        }
                      </Disclosure>
                      {data.recorded.length ? (
                        <Disclosure
                          label="Recorded affiliations"
                          value={formatCount(data.recorded.length)}
                          open={recordedOpen}
                          onToggle={setRecordedOpen}
                          testID="party-recorded-toggle"
                        >
                          {() => <Members rows={data.recorded} recorded />}
                        </Disclosure>
                      ) : null}
                    </RowList>
                  </>
                )}
              </CatalogState>
            </Section>
            <Section
              title="Party receipts"
              icon="banknote"
              accent="money"
              info={
                view.moneyMeta
                  ? {
                      title: 'About party receipts',
                      notes: [
                        'Top donors are the displayed donor-to-party flows, not all party receipts. No sequence or causal link is inferred.',
                        disclosureYearNote,
                      ],
                      testID: 'party-receipts-info',
                    }
                  : undefined
              }
            >
              <CatalogState
                block={view.receipts}
                empty="No receipts total is recorded for this party in the money graph."
                onRetry={retry}
                testID="party-receipts"
              >
                {(data) => (
                  <>
                    <BigFigure
                      value={formatMoney(data.node.total)}
                      label={partyPageCopy.caption}
                      accessibilityLabel={`${partyPageCopy.caption}, ${formatMoney(data.node.total)}`}
                      accent="money"
                      testID="party-receipts-total"
                    />
                    <KeyValueList
                      items={[
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
                    <SubSection title="Where it came from">
                      <RowList>
                        {data.donors.map((donor) => (
                          <View
                            key={donor.id}
                            accessible
                            accessibilityLabel={`${donor.name}, ${formatMoney(donor.amount)}`}
                            style={styles.donor}
                          >
                            <Text wordSafe variant="body" style={styles.grow}>
                              {donor.name}
                            </Text>
                            <Text variant="figureInline" tone="moneyInk">
                              {formatMoney(donor.amount)}
                            </Text>
                          </View>
                        ))}
                      </RowList>
                    </SubSection>
                    <RowList>
                      <Disclosure
                        label="Top donors by year"
                        value={formatCount(data.byYear.length)}
                        open={yearsOpen}
                        onToggle={setYearsOpen}
                        testID="party-donor-years-toggle"
                      >
                        {() => (
                          <Group>
                            {data.byYear.map((row) => (
                              <SubSection
                                key={row.year}
                                title={
                                  row.year === 'undated'
                                    ? 'Undated'
                                    : formatDisclosureYear(Number(row.year))
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
                        )}
                      </Disclosure>
                    </RowList>
                  </>
                )}
              </CatalogState>
              <Text wordSafe variant="caption" testID="party-money-caveat">
                {partyPageCopy.aec}
              </Text>
              <RowList>
                <MoneyMapLink party={view.label} />
              </RowList>
            </Section>
            <Section
              title="Associated entities"
              icon="building.2"
              accent="money"
              info={{
                title: 'About associated entities',
                notes: [
                  'These are the entities’ own annual returns. They are not added to the party’s receipts. Names are matched on case, punctuation and company suffixes only; the same body under two spellings appears twice. Debts are the balances owed at 30 June, not new borrowing. Creditors under the disclosure threshold are not itemised.',
                ],
                testID: 'party-associated-info',
              }}
            >
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
                      <Text wordSafe variant="caption">
                        {data.total} entities have named {view.label} on an
                        associated-entity return; the {data.rows.length} with
                        the largest receipts on their latest return are shown,
                        each with that return&apos;s year.
                      </Text>
                    ) : null}
                  </>
                )}
              </CatalogState>
            </Section>
            <Section
              title="Bills they divided on"
              icon="checkmark.square"
              accent="votes"
              info={{
                title: 'About these divisions',
                notes: [
                  view.divisions.data
                    ? `This party’s own ayes and noes, newest first, read from the ${view.divisions.data.scanned} most recently decided bills the register could open — not the party’s whole voting history, and not every bill it divided on. Party is each member’s recorded affiliation, not a reconstruction of who they sat with on the day. A division on an amendment is not a vote on the bill itself.`
                    : null,
                  view.divisions.data?.basisNote,
                ],
                testID: 'party-divisions-info',
              }}
            >
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
                            gap={rhythm.line}
                          >
                            <LinkRow
                              title={row.title}
                              detail={[
                                row.question ||
                                  row.division.stage ||
                                  'Division',
                                `${formatDate(row.division.date, 'short')} · ${chamberLabel(row.division.house)} · ${
                                  row.division.outcome === 'affirmative'
                                    ? 'Agreed to'
                                    : row.division.outcome === 'negative'
                                      ? 'Negatived'
                                      : billSentenceCase(
                                          row.division.outcome,
                                        ) || 'Outcome not recorded'
                                }`,
                              ].join('\n')}
                              leading={
                                <Text variant="chip" tone="votesInk">
                                  {row.ayes} for, {row.noes} against
                                </Text>
                              }
                              onPress={() =>
                                router.push(billRoute(row.billKey, 'divisions'))
                              }
                              testID={`party-bill-${row.billKey}`}
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
                        variant="quiet"
                        icon="chevron.down"
                        onPress={() => setAllDivisions(true)}
                      />
                    ) : null}
                    {data.failed ? (
                      <Text wordSafe variant="caption">
                        {data.failed} bill files could not be read. This block
                        is partial.
                      </Text>
                    ) : null}
                    {data.rows.length ? (
                      <AsAtLine
                        asOf={data.rows[0]!.division.date}
                        citation="They Vote For You"
                        licence="ODbL"
                      />
                    ) : null}
                  </>
                )}
              </CatalogState>
            </Section>
            <Text variant="caption" testID="party-end">
              End of party page
            </Text>
          </>
        ) : null}
      </Screen>
    </>
  );
}
const styles = StyleSheet.create({
  hero: {
    gap: rhythm.tight,
    borderRadius: radius + 10,
    padding: rhythm.block + rhythm.line,
    borderWidth: 1,
    borderColor: colors.line,
  },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  // The raised ring keeps the party colour at 3:1 on its own wash.
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.raised,
    boxSizing: 'content-box',
  },
  donor: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: rhythm.block,
    rowGap: rhythm.line,
  },
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 160 },
});
