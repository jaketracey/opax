import { RouteOptions } from '../../navigation/preview';
import { useState } from 'react';
import type { NativeStackHeaderItem } from 'expo-router';
import { useNavigation } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { copy } from '../../design/copy';
import { InsetGroup, Screen } from '../../design/layout';
import { useListSearchBar } from '../../design/search-bar';
import { ContentUnavailable, Skeleton } from '../../design/states';
import { Text } from '../../design/text';
import { colors, rhythm } from '../../design/tokens';
import { headerItems } from '../../navigation/chrome';
import { firstRunChosen, firstRunSkipped } from '../../onboarding/measure';
import { closeWelcome, markWelcomeSeen } from '../../onboarding/state';
import {
  accessoryFor,
  AecRow,
  ChooseLater,
  SeatSaveError,
  useChoose,
  useSeatDirectory,
  type SeatPresentation,
} from './SeatChooser';
import {
  isStateCode,
  matchSeats,
  noMatchCopy,
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
 *
 * In the welcome the list is as far as a reader can go, so it carries the
 * same ways out as the seat step: "Not now" in the bar ("Done" on a replay
 * with a seat saved), and after the seats the AEC's finder and "Choose
 * later". A long list of names a reader may not know is never a dead end.
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
  const close = (declined: boolean) => {
    if (welcome) void markWelcomeSeen({ declined }).catch(() => undefined);
    if (welcome && declined) firstRunSkipped('state');
    closeWelcome(navigation as Parameters<typeof closeWelcome>[0]);
  };
  const { seat, choose, savingId, chosenId, failed } = useChoose(() => {
    if (welcome) firstRunChosen('state', 'browse');
    close(false);
  });
  // A replay with a seat saved changes nothing: "Done", and no "Choose later".
  const asking = welcome && seat.status !== 'chosen';
  const trailing: NativeStackHeaderItem[] = welcome
    ? [
        {
          type: 'button',
          label: asking ? copy.notNow : copy.done,
          variant: 'plain',
          tintColor: colors.navy,
          accessibilityLabel: asking ? copy.notNow : copy.done,
          onPress: () => close(asking),
        },
      ]
    : [];
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
  const later = asking ? (
    <ChooseLater onPress={() => close(true)} disabled={busy} />
  ) : null;
  const miss = noMatchCopy(query, { location: false });
  return (
    <>
      <RouteOptions
        options={{
          title,
          headerSearchBarOptions: {
            ...search,
            hideNavigationBar: false,
            obscureBackground: false,
            hideWhenScrolling: false,
          },
          ...(welcome ? headerItems(() => trailing) : {}),
        }}
      />
      <FieldClearance>
        <Screen grouped testID={`seat-state-${code.toLowerCase()}`}>
          {/* A failed write says so, as in the chooser, with Try again. */}
          {failed ? (
            <SeatSaveError onRetry={() => void choose(failed)} />
          ) : null}
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
            <>
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
                    accessory={accessoryFor(
                      s.electorate_id,
                      savingId,
                      chosenId,
                    )}
                    testID={`seat-row-${s.slug}`}
                  />
                ))}
              </InsetGroup>
              <AecRow />
              {later}
            </>
          ) : (
            <>
              <View style={styles.miss}>
                <Text
                  wordSafe
                  variant="body"
                  tone="inkSoft"
                  testID="seat-no-results"
                >
                  {miss.title}
                </Text>
                <Text
                  wordSafe
                  variant="body"
                  tone="inkSoft"
                  testID="seat-no-results-help"
                >
                  {miss.help}
                </Text>
              </View>
              <AecRow />
              {later}
            </>
          )}
        </Screen>
      </FieldClearance>
    </>
  );
}

const styles = StyleSheet.create({ miss: { gap: rhythm.line } });
