import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AccessibilityInfo, View } from 'react-native';
import type { Electorate } from '../../api/catalogs';
import type { RecordResult } from '../../api/client';
import { catalogs } from '../../api/runtime';
import {
  Screen,
  Section,
  Group,
  Text,
  Button,
  Field,
  LinkRow,
  RowList,
  LoadingState,
  ErrorState,
  AsAtLine,
  IconButton,
  OfflineBanner,
  StaleNotice,
  EmptyState,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { loadChoice } from '../your-mp/choice-store';
import { shareTextFile } from '../records/actions';
import { isOffline } from '../CatalogState';
import {
  PRACTICE_NOTE,
  BALLOT_NOTES,
  ballotPlan,
  changePreference,
  validPreferences,
  type Ballot as BallotData,
} from './model';
import { explore } from './runtime';
import { ExploreHeader } from './parts';

export default function Ballot() {
  const [seats, setSeats] = useState<Electorate[]>([]),
    [seat, setSeat] = useState<Electorate | null>(null),
    [ballot, setBallot] = useState<RecordResult<BallotData> | null>(null),
    [order, setOrder] = useState<string[]>([]),
    [query, setQuery] = useState(''),
    [choosing, setChoosing] = useState(false),
    [error, setError] = useState<string | null>(null),
    [offline, setOffline] = useState(false),
    [directoryRevision, setDirectoryRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [validated, setValidated] = useState(false),
    [view, setView] = useState<'candidates' | 'order'>('candidates');
  const generation = useRef(0),
    mounted = useRef(true);
  const loadSeat = useCallback(async (next: Electorate) => {
    const id = ++generation.current;
    setSeat(next);
    setChoosing(false);
    setLoading(true);
    setError(null);
    setOffline(false);
    setBallot(null);
    setOrder([]);
    setValidated(false);
    setView('candidates');
    try {
      const record = await explore.ballot(next.detail_url);
      if (mounted.current && generation.current === id) setBallot(record);
    } catch (e) {
      if (mounted.current && generation.current === id) {
        setOffline(isOffline(e));
        setError(
          e instanceof Error
            ? e.message
            : 'The 2025 candidates could not be loaded.',
        );
      }
    } finally {
      if (mounted.current && generation.current === id) setLoading(false);
    }
  }, []);
  function choose(next: Electorate) {
    if (order.length && seat?.electorate_id !== next.electorate_id)
      Alert.alert(
        'Start a new practice ballot for this electorate?',
        'Your current order will be cleared.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Start again', onPress: () => void loadSeat(next) },
        ],
      );
    else void loadSeat(next);
  }
  useEffect(() => {
    mounted.current = true;
    void Promise.all([catalogs.directory(), loadChoice()])
      .then(([directory, saved]) => {
        if (!mounted.current) return;
        const choices = directory.electorates.data.electorates
          .filter(
            (s) =>
              s.jurisdiction === 'federal' &&
              s.chamber === 'representatives' &&
              !!s.latest_election &&
              s.latest_election >= '2025-05-03' &&
              (s.election_count ?? 0) > 0,
          )
          .sort((a, b) => a.name.localeCompare(b.name));
        setSeats(choices);
        const selected = choices.find((s) => s.electorate_id === saved?.seatId);
        if (selected) void loadSeat(selected);
        else {
          setChoosing(true);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (mounted.current) {
          setOffline(isOffline(e));
          setError('The 2025 electorates could not be loaded.');
          setLoading(false);
        }
      });
    return () => {
      mounted.current = false;
    };
  }, [loadSeat, directoryRevision]); // Saved seat is read on open or an explicit retry.
  const candidates = ballot?.data.candidates ?? [],
    complete = validPreferences(order, candidates, true);
  const change = (action: 'add' | 'remove' | 'up' | 'down', id: string) => {
    const next = changePreference(order, candidates, action, id);
    setOrder(next);
    setValidated(false);
    AccessibilityInfo.announceForAccessibility(
      `${next.length} of ${candidates.length} choices made.`,
    );
  };
  return (
    <>
      <ExploreHeader title="Ballot" game="ballot" />
      <Screen column="wide" testID="explore-ballot-screen">
        <Section
          title="Build your ballot"
          info={{ title: 'How the practice ballot works', notes: BALLOT_NOTES }}
        >
          <Text variant="body" wordSafe>
            2025 practice ballot
          </Text>
          <Text wordSafe variant="metadata">
            Federal House of Representatives · 3 May 2025
          </Text>
          <Text wordSafe testID="ballot-disclaimer">
            {PRACTICE_NOTE}
          </Text>
          <LinkRow
            title={
              seat
                ? `${seat.name}, ${seat.state_code.toUpperCase()}`
                : 'Choose an electorate'
            }
            detail="Change"
            testID="ballot-change-seat"
            onPress={() => setChoosing((v) => !v)}
          />
          {choosing ? (
            <Group>
              <Field
                label="Find an electorate"
                value={query}
                onChangeText={setQuery}
                testID="ballot-seat-search"
              />
              <RowList>
                {seats
                  .filter((s) =>
                    `${s.name} ${s.state_code}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((s) => (
                    <LinkRow
                      key={s.electorate_id}
                      title={s.name}
                      detail={s.state_code.toUpperCase()}
                      onPress={() => choose(s)}
                      testID={`ballot-seat-${s.slug}`}
                    />
                  ))}
              </RowList>
            </Group>
          ) : null}
        </Section>
        {offline ? <OfflineBanner cached={false} /> : null}
        {error ? (
          <ErrorState
            message={error}
            onRetry={() => {
              if (seat) choose(seat);
              else {
                setLoading(true);
                setError(null);
                setOffline(false);
                setDirectoryRevision((v) => v + 1);
              }
            }}
          />
        ) : null}
        {loading ? (
          <LoadingState
            label="Loading the 2025 candidates"
            shape="rows"
            count={6}
          />
        ) : null}
        {ballot && !choosing ? (
          <Section
            title={view === 'candidates' ? 'The candidates' : 'Your order'}
            info={{
              title: 'About your order',
              notes: [
                'Your first choice is at the top.',
                'Your preference numbers, beside candidates in the original AEC ballot order:',
                'You chose this order. Opax does not recommend candidates or preferences.',
              ],
            }}
          >
            {ballot.stale ? (
              <Group>
                <OfflineBanner cached />
                <StaleNotice savedAt={ballot.savedAt} />
              </Group>
            ) : null}
            <Text wordSafe testID="ballot-progress">
              {order.length} of {candidates.length} choices made
            </Text>
            <Text wordSafe variant="metadata">
              {view === 'candidates'
                ? 'In their original order on the 2025 ballot.'
                : 'Your first choice is at the top.'}
            </Text>
            <View style={{ flexDirection: 'row', gap: rhythm.tight }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Candidates"
                  onPress={() => setView('candidates')}
                  variant={view === 'candidates' ? 'primary' : 'default'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Your order"
                  onPress={() => setView('order')}
                  variant={view === 'order' ? 'primary' : 'default'}
                  testID="ballot-review"
                />
              </View>
            </View>
            <RowList>
              {view === 'order' && !order.length ? (
                <EmptyState message="Add a candidate to begin. You decide the order." />
              ) : null}
              {(view === 'order'
                ? order.map(
                    (id) => candidates.find((c) => c.candidate_id === id)!,
                  )
                : candidates
              ).map((c, i) => (
                <Group key={c.candidate_id} gap={rhythm.tight}>
                  <Text variant="strong" wordSafe>
                    {order.includes(c.candidate_id)
                      ? `${order.indexOf(c.candidate_id) + 1}. `
                      : ''}
                    {c.name}
                  </Text>
                  <Text wordSafe variant="metadata">
                    {c.party || 'No party recorded'}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: rhythm.tight,
                    }}
                  >
                    {view === 'order' ? (
                      <>
                        <IconButton
                          symbol="arrow.up"
                          accessibilityLabel={`Move ${c.name} up`}
                          disabled={i === 0}
                          onPress={() => change('up', c.candidate_id)}
                        />
                        <IconButton
                          symbol="arrow.down"
                          accessibilityLabel={`Move ${c.name} down`}
                          disabled={i === order.length - 1}
                          onPress={() => change('down', c.candidate_id)}
                        />
                      </>
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <Button
                        label={
                          order.includes(c.candidate_id)
                            ? `Remove ${c.name}`
                            : `Add ${c.name}`
                        }
                        size="compact"
                        onPress={() =>
                          change(
                            order.includes(c.candidate_id) ? 'remove' : 'add',
                            c.candidate_id,
                          )
                        }
                        testID={`ballot-add-${i}`}
                      />
                    </View>
                  </View>
                </Group>
              ))}
            </RowList>
            <Button
              label="Validate preferences"
              variant="primary"
              onPress={() => {
                setValidated(true);
                AccessibilityInfo.announceForAccessibility(
                  complete
                    ? 'Every candidate has a number. Your practice plan is ready.'
                    : 'Number every candidate before downloading your practice plan.',
                );
              }}
              testID="ballot-validate"
            />
            {validated ? (
              <Text wordSafe testID="ballot-validation">
                {complete
                  ? 'Every candidate has a number. Your practice plan is ready.'
                  : 'Number every candidate before downloading your practice plan.'}
              </Text>
            ) : null}
            <Button
              label="Export practice plan"
              disabled={!complete}
              onPress={() =>
                void shareTextFile(
                  ballotPlan(ballot.data, order),
                  `opax-2025-practice-${ballot.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`,
                )
              }
              testID="ballot-export"
            />
            <Button
              label="Start again"
              disabled={!order.length}
              variant="quiet"
              onPress={() =>
                Alert.alert('Clear your order and start again?', '', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Start again',
                    onPress: () => {
                      setOrder([]);
                      setValidated(false);
                    },
                  },
                ])
              }
            />
            <AsAtLine
              asOf={ballot.asOf}
              citation={ballot.data.citation.label}
              savedAt={ballot.stale ? ballot.savedAt : null}
            />
          </Section>
        ) : null}
      </Screen>
    </>
  );
}
