import { AskAbout } from './ask/AskAbout';
import { OutlineMap } from './electorate-map/OutlineMap';
import {
  formatCount,
  formatDate,
  formatMoney,
  formatPercent,
} from '../design/format';
import { useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../api/runtime';
import { ApiError } from '../api/errors';
import {
  Disclosure,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  PartyChip,
  KeyValueList,
  LinkRow,
  LoadingState,
  RowList,
  Screen,
  Section,
  Text,
  errorMessage,
} from '../design/primitives';
import { rhythm } from '../design/tokens';
import {
  CHAMBER_NOT_RECORDED,
  chamberName,
  jurisdictionName,
} from '../design/parliament';
import { electorateRoute } from '../navigation/routes';
import { shareHeaderItem } from '../navigation/share';
import { EvidenceFooter, RecordBlock } from './your-mp/Evidence';
import { FollowToggle } from './follows/FollowToggle';
import { RepresentativeRows } from './your-mp/RepresentativeRows';
import type { Directory, ElectorateView } from './your-mp/model';
const indicators: Record<string, [string, 'count' | 'money' | 'percent']> = {
  population: ['Population', 'count'],
  median_age: ['Median age', 'count'],
  average_household_size: ['Average household size', 'count'],
  born_overseas_pct: ['Born overseas', 'percent'],
  homeownership_pct: ['Home ownership', 'percent'],
  indigenous_pct: ['Aboriginal and Torres Strait Islander people', 'percent'],
  labour_force_participation: ['Labour force participation', 'percent'],
  median_household_income_weekly: ['Median weekly household income', 'money'],
  median_income: ['Median weekly personal income', 'money'],
  median_mortgage_monthly: ['Median monthly mortgage repayment', 'money'],
  median_rent_weekly: ['Median weekly rent', 'money'],
  rental_pct: ['Renting', 'percent'],
  unemployment_rate: ['Unemployment rate', 'percent'],
  university_pct: ['University qualification', 'percent'],
};
export default function Electorate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ElectorateScreen key={id} id={id} />;
}
export function ElectorateScreen({
  id,
  embedded = false,
}: {
  id: string;
  embedded?: boolean;
}) {
  const [view, setView] = useState<ElectorateView | null>(null),
    [directory, setDirectory] = useState<Directory | null>(null),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0),
    [refreshing, setRefreshing] = useState(false),
    [expanded, setExpanded] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      const d = await catalogs.directory();
      const seat = d.electorates.data.electorates.find(
        (s) => s.electorate_id === id,
      );
      if (!seat)
        throw new ApiError(
          'not-found',
          'This electorate is not in the release.',
        );
      const v = await catalogs.electorateFor(seat.detail_url);
      if (v.data.identity.data?.id !== id)
        throw new ApiError(
          'invalid-data',
          'The electorate record does not match the selected seat. Try again.',
        );
      return { d, v: v.data };
    })()
      .then(({ d, v }) => {
        if (active) {
          setDirectory(d);
          setView(v);
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
  }, [id, retry]);
  const refresh = () => {
      setRefreshing(true);
      setError(null);
      setRetry((v) => v + 1);
    },
    identity = view?.identity.data,
    seat = directory?.electorates.data.electorates.find(
      (s) => s.electorate_id === id,
    );
  return (
    <>
      {embedded ? null : (
        <Stack.Screen
          options={{
            title: identity?.name ?? '',
            headerTitle: '',
            unstable_headerRightItems:
              identity && seat
                ? () => [
                    shareHeaderItem({ path: seat.url, title: identity.name }),
                  ]
                : undefined,
          }}
        />
      )}
      <Screen
        testID="electorate-screen"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {error ? (
          <ErrorState
            message={error}
            onRetry={refresh}
            testID="electorate-error"
          />
        ) : null}
        {!view && !error ? (
          <LoadingState label="Loading the electorate record" />
        ) : null}
        {view && identity && directory ? (
          <>
            <Group gap={rhythm.tight}>
              <Text variant="kicker" tone="navy">
                Electorate
              </Text>
              <Heading level={1} testID="electorate-name">
                {identity.name}
              </Heading>
              {identity.status === 'historical' ? (
                <Text wordSafe testID="electorate-abolished">
                  Abolished; not a current seat. This record describes a
                  historical electorate.
                </Text>
              ) : null}
              <Text wordSafe variant="metadata">
                {chamberName(identity.chamber, identity.jurisdiction) ??
                  CHAMBER_NOT_RECORDED}{' '}
                ·{' '}
                {jurisdictionName(identity.state) ??
                  jurisdictionName(identity.jurisdiction) ??
                  'Jurisdiction not recorded'}
              </Text>
              <FollowToggle
                kind="electorate"
                id={identity.id}
                title={identity.name}
                testID="electorate-follow"
              />
            </Group>
            <AskAbout kind="electorate" name={identity.name} />
            <View testID="electorate-map">
              <OutlineMap
                boundaries={view.boundaries}
                name={identity.name}
                state={identity.state}
              />
            </View>
            <RecordBlock
              title="Latest verified representation"
              icon="person.fill"
              accent="people"
              info={() => ({
                title: 'About representation',
                notes: [
                  'Election winners and present-day representation can differ.',
                  'Representation is shown only as recorded in the dated release.',
                ],
              })}
              id="electorate-representatives"
              block={view.representatives}
              retry={refresh}
              missing={
                identity.status === 'historical'
                  ? 'Abolished; not a current seat. Past winners are listed under Elections.'
                  : 'No verified representative is recorded for this date. This does not establish a vacancy.'
              }
            >
              {(rows) => (
                <RepresentativeRows
                  rows={rows}
                  directory={directory}
                  asAt={view.representatives.asAt}
                  id="electorate-member"
                />
              )}
            </RecordBlock>
            <Section
              title="Elections"
              icon="checkmark.seal"
              accent="votes"
              testID="electorate-elections"
            >
              {view.elections.length ? (
                view.elections.map((b, i) => (
                  <RecordBlock
                    key={i}
                    sub={i ? 'ruled' : 'first'}
                    title={b.data?.election.name ?? 'Election'}
                    id={`electorate-election-${i}`}
                    block={b}
                    missing="No election record is held."
                    retry={refresh}
                  >
                    {(e) => (
                      <Group gap={rhythm.tight}>
                        <Text wordSafe variant="metadata">
                          {formatDate(e.election.poll_date)} · {e.election.kind}
                        </Text>
                        <RowList>
                          <Disclosure
                            label="Candidates and recorded votes"
                            value={String(e.candidates.length)}
                            open={expanded.includes(e.election_id)}
                            testID={`election-expand-${i}`}
                            onToggle={() =>
                              setExpanded((v) =>
                                v.includes(e.election_id)
                                  ? v.filter((x) => x !== e.election_id)
                                  : [...v, e.election_id],
                              )
                            }
                          >
                            {() => (
                              <RowList>
                                {e.candidates.map((c, j) => (
                                  <Group key={j} gap={rhythm.line}>
                                    <Text wordSafe variant="strong">
                                      {c.name}
                                      {c.elected ? (
                                        <Text variant="strong" tone="votesInk">
                                          {'  ·  Elected'}
                                        </Text>
                                      ) : null}
                                    </Text>
                                    <PartyChip
                                      party={c.party}
                                      status="unknown"
                                    />
                                    <KeyValueList
                                      items={c.votes.map((v) => ({
                                        label:
                                          v.kind === 'primary'
                                            ? 'Primary votes'
                                            : v.kind === 'tcp'
                                              ? 'Two-candidate votes'
                                              : v.kind.replaceAll('_', ' '),
                                        value: formatCount(v.votes),
                                      }))}
                                    />
                                  </Group>
                                ))}
                              </RowList>
                            )}
                          </Disclosure>
                        </RowList>
                      </Group>
                    )}
                  </RecordBlock>
                ))
              ) : (
                <EmptyState message="No election records are held for this electorate." />
              )}
            </Section>
            <Section
              title="Local context"
              icon="person.3"
              accent="places"
              testID="electorate-census"
            >
              {view.census.length ? (
                view.census.map((b, i) => (
                  <RecordBlock
                    key={i}
                    sub={i ? 'ruled' : 'first'}
                    title={`Census ${b.data?.year ?? ''}`}
                    id={`electorate-census-${i}`}
                    block={b}
                    missing="No Census indicators are held."
                    retry={refresh}
                  >
                    {(d) => (
                      <Group gap={rhythm.tight}>
                        <Text wordSafe variant="strong">
                          {d.vintage}
                        </Text>
                        <Text wordSafe variant="metadata">
                          {d.note}
                        </Text>
                        <KeyValueList
                          items={Object.entries(d.indicators).map(
                            ([key, value]) => {
                              const [label, kind] = indicators[key] ?? [
                                key.replaceAll('_', ' '),
                                'count',
                              ];
                              return {
                                label,
                                value:
                                  value === null
                                    ? 'Not recorded'
                                    : kind === 'money'
                                      ? formatMoney(value)
                                      : kind === 'percent'
                                        ? formatPercent(value)
                                        : formatCount(value),
                              };
                            },
                          )}
                        />
                      </Group>
                    )}
                  </RecordBlock>
                ))
              ) : (
                <EmptyState message="No Census context is held for this electorate." />
              )}
            </Section>
            <Section
              title="Related constituencies"
              icon="square.on.square"
              accent="places"
            >
              {view.related.length ? (
                <RowList>
                  {view.related.map((r, i) => (
                    <LinkRow
                      key={i}
                      title={r.related.name}
                      detail={`${
                        (
                          {
                            within_upper_house:
                              'Upper-house region covering this electorate',
                            within_lower_house:
                              'Lower-house district covering this electorate',
                            overlaps: 'Overlapping electorate',
                          } as Record<string, string>
                        )[r.kind] ?? 'Related electorate'
                      } · ${r.vintage}`}
                      onPress={() =>
                        router.push(electorateRoute(r.related.electorate_id))
                      }
                    />
                  ))}
                </RowList>
              ) : (
                <EmptyState message="No related constituencies are recorded." />
              )}
            </Section>
            <Group gap={rhythm.line} testID="electorate-coverage">
              <Text wordSafe variant="caption">
                {view.coverageNote} Representation is shown only as recorded in
                the dated release.
              </Text>
              <EvidenceFooter block={view.identity} id="electorate-coverage" />
            </Group>
            <Text wordSafe variant="caption" testID="electorate-end">
              End of electorate record
            </Text>
          </>
        ) : null}
      </Screen>
    </>
  );
}
