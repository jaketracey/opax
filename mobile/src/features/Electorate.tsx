import {
  formatCount,
  formatDate,
  formatMoney,
  formatPercent,
} from '../design/format';
import { useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../api/runtime';
import { ApiError } from '../api/errors';
import {
  Button,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  KeyValueList,
  LoadingState,
  Screen,
  Section,
  Text,
  errorMessage,
} from '../design/primitives';
import {
  CHAMBER_NOT_RECORDED,
  chamberName,
  jurisdictionName,
} from '../design/parliament';
import { electorateRoute } from '../navigation/routes';
import { shareHeaderItem } from '../navigation/share';
import { RecordBlock } from './your-mp/Evidence';
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
            <RecordBlock
              title="Latest verified representation"
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
                <Group>
                  <RepresentativeRows
                    rows={rows}
                    directory={directory}
                    asAt={view.representatives.asAt}
                    id="electorate-member"
                  />
                  <Text wordSafe>
                    Election winners and present-day representation can differ.
                  </Text>
                </Group>
              )}
            </RecordBlock>
            <Section title="Elections" testID="electorate-elections">
              {view.elections.length ? (
                view.elections.map((b, i) => (
                  <RecordBlock
                    key={i}
                    title={b.data?.election.name ?? 'Election'}
                    id={`electorate-election-${i}`}
                    block={b}
                    missing="No election record is held."
                    retry={refresh}
                  >
                    {(e) => (
                      <Group>
                        <Text wordSafe variant="metadata">
                          {formatDate(e.election.poll_date)} · {e.election.kind}
                        </Text>
                        <Button
                          label={
                            expanded.includes(e.election_id)
                              ? 'Hide candidates'
                              : 'Candidates and recorded votes'
                          }
                          testID={`election-expand-${i}`}
                          onPress={() =>
                            setExpanded((v) =>
                              v.includes(e.election_id)
                                ? v.filter((x) => x !== e.election_id)
                                : [...v, e.election_id],
                            )
                          }
                        />
                        {expanded.includes(e.election_id)
                          ? e.candidates.map((c, j) => (
                              <Group key={j} gap={4}>
                                <Text wordSafe variant="strong">
                                  {c.name}
                                </Text>
                                <Text wordSafe variant="metadata">
                                  {c.party ?? 'Party not recorded'}
                                  {c.elected ? ' · Elected' : ''}
                                </Text>
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
                            ))
                          : null}
                      </Group>
                    )}
                  </RecordBlock>
                ))
              ) : (
                <EmptyState message="No election records are held for this electorate." />
              )}
            </Section>
            <Section title="Local context" testID="electorate-census">
              {view.census.length ? (
                view.census.map((b, i) => (
                  <RecordBlock
                    key={i}
                    title={`Census ${b.data?.year ?? ''}`}
                    id={`electorate-census-${i}`}
                    block={b}
                    missing="No Census indicators are held."
                    retry={refresh}
                  >
                    {(d) => (
                      <Group>
                        <Text wordSafe variant="strong">
                          {d.vintage}
                        </Text>
                        <Text wordSafe>{d.note}</Text>
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
            <Section title="Related constituencies">
              {view.related.length ? (
                view.related.map((r, i) => (
                  <Group key={i}>
                    <Text wordSafe>
                      {(
                        {
                          within_upper_house:
                            'Upper-house region covering this electorate',
                          within_lower_house:
                            'Lower-house district covering this electorate',
                          overlaps: 'Overlapping electorate',
                        } as Record<string, string>
                      )[r.kind] ?? 'Related electorate'}{' '}
                      · {r.vintage}
                    </Text>
                    <Button
                      label={r.related.name}
                      onPress={() =>
                        router.push(electorateRoute(r.related.electorate_id))
                      }
                    />
                  </Group>
                ))
              ) : (
                <EmptyState message="No related constituencies are recorded." />
              )}
            </Section>
            <RecordBlock
              title="Sources and coverage"
              id="electorate-coverage"
              block={view.identity}
              missing="No source information is held."
              retry={refresh}
            >
              {() => (
                <Group>
                  <Text wordSafe>{view.coverageNote}</Text>
                  <Text wordSafe>
                    Representation is shown only as recorded in the dated
                    release.
                  </Text>
                </Group>
              )}
            </RecordBlock>
            <Text wordSafe variant="fine" testID="electorate-end">
              End of electorate record
            </Text>
          </>
        ) : null}
      </Screen>
    </>
  );
}
