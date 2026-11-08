import { useState } from 'react';
import { Stack, useNavigation } from 'expo-router';
import { copy } from '../../design/copy';
import { InsetGroup, Screen } from '../../design/layout';
import { useListSearchBar } from '../../design/search-bar';
import { ContentUnavailable, Skeleton } from '../../design/states';
import { Text } from '../../design/text';
import { closeWelcome, markWelcomeSeen } from '../../onboarding/state';
import {
  accessoryFor,
  useChoose,
  useSeatDirectory,
  type SeatPresentation,
} from './SeatChooser';
import {
  isStateCode,
  matchSeats,
  seatCopy,
  seatsInState,
  stateName,
} from './seat-model';
import { SeatRow } from './SeatRow';
import { FieldClearance } from './FieldClearance';

/**
 * Browse by state (`/seat/state/[code]`, `/welcome/seat/state/[code]`): the
 * state's current House seats A to Z, pushed inside the chooser's stack,
 * with its own search field filtering within the state. Choosing closes the
 * whole sheet or welcome, as from the chooser.
 */
export function SeatStateList({
  code,
  presentation,
}: {
  code: string;
  presentation: SeatPresentation;
}) {
  const navigation = useNavigation();
  const welcome = presentation === 'welcome';
  const { state, retry } = useSeatDirectory();
  const [query, setQuery] = useState('');
  const { choose, savingId, chosenId } = useChoose(() => {
    if (welcome) void markWelcomeSeen().catch(() => undefined);
    closeWelcome(navigation as Parameters<typeof closeWelcome>[0]);
  });
  const valid = isStateCode(code);
  const title = valid ? stateName(code) : seatCopy.title;
  const search = useListSearchBar({
    placeholder: seatCopy.placeholder,
    onChangeText: setQuery,
    onSearchButtonPress: setQuery,
    onCancelButtonPress: () => setQuery(''),
  });
  const all =
    state.status === 'ready' && valid
      ? seatsInState(state.directory.electorates.data.electorates, code)
      : [];
  const seats = query.trim() ? matchSeats(all, query) : all;
  const busy = savingId !== null || chosenId !== null;
  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerSearchBarOptions: {
            ...search,
            hideNavigationBar: false,
            obscureBackground: false,
            hideWhenScrolling: false,
          },
        }}
      />
      <FieldClearance>
        <Screen grouped testID={`seat-state-${code.toLowerCase()}`}>
          {!valid ? (
            <ContentUnavailable
              symbol="map"
              title="Nothing to show"
              testID="seat-state-unknown"
            />
          ) : state.status === 'error' ? (
            <ContentUnavailable
              symbol="exclamationmark.triangle"
              title={seatCopy.loadFailed}
              action={{ label: copy.tryAgain, onPress: retry }}
            />
          ) : state.status === 'loading' ? (
            <InsetGroup>
              <Skeleton shape="people" count={6} label="Loading electorates" />
            </InsetGroup>
          ) : seats.length ? (
            <InsetGroup testID="seat-state-list">
              {seats.map((s) => (
                <SeatRow
                  key={s.electorate_id}
                  seat={s}
                  onPress={() => void choose(s)}
                  disabled={
                    busy &&
                    accessoryFor(s.electorate_id, savingId, chosenId) ===
                      'chevron'
                  }
                  accessory={accessoryFor(s.electorate_id, savingId, chosenId)}
                  testID={`seat-row-${s.slug}`}
                />
              ))}
            </InsetGroup>
          ) : (
            <Text
              wordSafe
              variant="body"
              tone="inkSoft"
              testID="seat-no-results"
            >
              {seatCopy.noMatch}
            </Text>
          )}
        </Screen>
      </FieldClearance>
    </>
  );
}
