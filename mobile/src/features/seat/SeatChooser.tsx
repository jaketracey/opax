import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, Stack, useNavigation } from 'expo-router';
import type { NativeStackHeaderItem } from 'expo-router';
import type { Electorate } from '../../api/catalogs';
import { catalogs } from '../../api/runtime';
import { Button } from '../../design/controls';
import { copy } from '../../design/copy';
import { InsetGroup, Screen } from '../../design/layout';
import { confirmAction } from '../../design/menu';
import { LinkRow } from '../../design/rows';
import { useListSearchBar } from '../../design/search-bar';
import { ContentUnavailable, Skeleton } from '../../design/states';
import { Text } from '../../design/text';
import { colors, isAccessibilityCategory, rhythm } from '../../design/tokens';
import { formatCount } from '../../design/format';
import { openSource } from '../../navigation/external';
import { headerItems } from '../../navigation/chrome';
import { seatStateRoute, welcomeSeatStateRoute } from '../../navigation/routes';
import { closeWelcome, markWelcomeSeen } from '../../onboarding/state';
import { saveChoice } from '../your-mp/choice-store';
import type { Directory } from '../your-mp/model';
import { useSeat } from '../your-mp/useSeat';
import { LocationRow } from './LocationRow';
import {
  abolishedLine,
  browseStates,
  isHouseSeat,
  matchLeads,
  matchSeats,
  seatCopy,
  type StateCode,
} from './seat-model';
import { PersonLeadRow, SeatRow } from './SeatRow';

export type SeatPresentation = 'sheet' | 'welcome';
const AEC_URL = 'https://electorate.aec.gov.au/';
/** The chosen row shows its checkmark this long before the host closes. */
export const CHOSEN_MARK_MS = 300;

type DirectoryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; directory: Directory };
/** The directory for the chooser: the app's cached catalogs, no new request. */
export function useSeatDirectory() {
  const [state, setState] = useState<DirectoryState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    catalogs.directory(attempt > 0).then(
      (directory) => active && setState({ status: 'ready', directory }),
      () => active && setState({ status: 'error' }),
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);
  return { state, retry };
}
const offlineOf = (state: DirectoryState) =>
  state.status === 'ready' && state.directory.electorates.stale
    ? { savedAt: state.directory.electorates.savedAt ?? null }
    : null;

/**
 * A choice store write that the saved-seat hooks read as "no seat": a
 * well-formed ID that names no electorate, so `useSeat()` publishes `none`
 * and Today and Your MP return to the invitation. The disk format does not
 * change. Follow-up for wave 6: a `forget()` in useSeat and choice-store.
 */
export const FORGOTTEN_SEAT_ID = `el_${'0'.repeat(24)}`;
export function forgetSeat(): Promise<void> {
  return saveChoice({
    version: 1,
    seatId: FORGOTTEN_SEAT_ID,
    stateSeatIds: [],
  });
}

/**
 * Saving a choice: the tapped row shows an indicator while the seat is
 * written, then a checkmark for 300 ms with the success haptic (useSeat),
 * then the host closes. A failed write keeps the chooser open with a line
 * and Try again.
 */
export function useChoose(onChosen: (seat: Electorate) => void) {
  const seat = useSeat();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [failed, setFailed] = useState<Electorate | null>(null);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  const choose = async (target: Electorate) => {
    if (savingId || chosenId) return;
    setFailed(null);
    setSavingId(target.electorate_id);
    try {
      await seat.choose(target);
    } catch {
      if (live.current) {
        setSavingId(null);
        setFailed(target);
      }
      return;
    }
    if (!live.current) return;
    setSavingId(null);
    setChosenId(target.electorate_id);
    setTimeout(() => onChosen(target), CHOSEN_MARK_MS);
  };
  return { seat, choose, savingId, chosenId, failed };
}

/** The row accessory for a seat while a choice is being written. */
export function accessoryFor(
  id: string,
  savingId: string | null,
  chosenId: string | null,
) {
  return chosenId === id
    ? ('checkmark' as const)
    : savingId === id
      ? ('saving' as const)
      : ('chevron' as const);
}

/**
 * The one seat chooser (specs/your-mp.md 4, journeys/my-mp.md 3.3 and 8.2,
 * journeys/first-launch.md 4.2 and 4.6), in two presentations:
 *
 * - `sheet` (`/seat`): a page sheet with its own stack; "Cancel" leading,
 *   hidden while the search field is active so only one Cancel shows (the
 *   search controller's, which closes the sheet).
 * - `welcome` (`/welcome/seat`): pushed in the welcome; the back chevron
 *   leading and "Not now" trailing, or "Done" on a replay with a seat saved.
 *
 * The title is "Your electorate" in both. The native search field sits in
 * the bar with no label above it; it is focused on arrival except at
 * accessibility sizes and with `locate=1`, where the location row starts at
 * once instead.
 */
export function SeatChooser({
  presentation,
  locate = false,
  onChosen,
}: {
  presentation: SeatPresentation;
  locate?: boolean;
  onChosen?: (seat: Electorate) => void;
}) {
  const navigation = useNavigation();
  const { fontScale } = useWindowDimensions();
  const welcome = presentation === 'welcome';
  const { state, retry } = useSeatDirectory();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(false);
  const [stopKey, setStopKey] = useState(0);
  const close = useCallback(
    (declined: boolean) => {
      if (welcome) void markWelcomeSeen({ declined }).catch(() => undefined);
      // Pops the whole sheet or welcome from the root stack, from the
      // chooser or a Browse list inside it.
      closeWelcome(navigation as Parameters<typeof closeWelcome>[0]);
    },
    [welcome, navigation],
  );
  const { seat, choose, savingId, chosenId, failed } = useChoose((chosen) => {
    onChosen?.(chosen);
    close(false);
  });
  const saved =
    seat.status === 'chosen' && state.status === 'ready'
      ? (state.directory.electorates.data.electorates.find(
          (s) => s.electorate_id === seat.choice.seatId,
        ) ?? null)
      : null;
  const autoFocus = !locate && !isAccessibilityCategory(fontScale);
  const typed = (text: string) => {
    setQuery(text);
    if (text.trim()) setStopKey((n) => n + 1);
  };
  const search = useListSearchBar({
    placeholder: seatCopy.placeholder,
    onChangeText: typed,
    onSearchButtonPress: typed,
    onCancelButtonPress: () => {
      setQuery('');
      // One Cancel at a time: in the sheet, the search controller's Cancel
      // is the sheet's Cancel (first-launch 4.6).
      if (!welcome) close(false);
    },
    autoFocus,
  });
  const trailing: NativeStackHeaderItem[] = welcome
    ? [
        {
          type: 'button',
          label: saved ? copy.done : copy.notNow,
          variant: 'plain',
          tintColor: colors.navy,
          accessibilityLabel: saved ? copy.done : copy.notNow,
          // A replay with a seat saved changes nothing; "Not now" records
          // the decline (today.md 4.2).
          onPress: () => close(!saved),
        },
      ]
    : [];
  const browse = (code: StateCode) => {
    setStopKey((n) => n + 1);
    router.push(welcome ? welcomeSeatStateRoute(code) : seatStateRoute(code));
  };
  const remove = () =>
    confirmAction('', [
      {
        title: seatCopy.remove,
        destructive: true,
        onPress: () => {
          void forgetSeat().then(
            () => close(false),
            () => undefined,
          );
        },
      },
    ]);

  const electorates =
    state.status === 'ready'
      ? state.directory.electorates.data.electorates
      : [];
  const typing = query.trim().length > 0;
  const seats = typing ? matchSeats(electorates, query) : [];
  const leads = typing ? matchLeads(electorates, query) : [];
  const busy = savingId !== null || chosenId !== null;
  const row = (s: Electorate) => (
    <SeatRow
      key={s.electorate_id}
      seat={s}
      onPress={() => void choose(s)}
      disabled={
        busy && savingId !== s.electorate_id && chosenId !== s.electorate_id
      }
      accessory={accessoryFor(s.electorate_id, savingId, chosenId)}
      testID={`seat-row-${s.slug}`}
    />
  );
  const browseGroup =
    state.status === 'ready' ? (
      <InsetGroup header={seatCopy.browse} testID="seat-browse">
        {browseStates(electorates).map((s) => (
          <LinkRow
            key={s.code}
            title={s.name}
            value={formatCount(s.count)}
            onPress={() => browse(s.code)}
            disabled={busy}
            testID={`seat-browse-${s.code}`}
          />
        ))}
      </InsetGroup>
    ) : (
      <InsetGroup header={seatCopy.browse}>
        <Skeleton shape="rows" count={3} label="Loading electorates" />
      </InsetGroup>
    );
  const aec = (
    <InsetGroup>
      <LinkRow
        title={seatCopy.aec}
        external
        onPress={() => void openSource(AEC_URL, 'AEC electorate finder')}
        testID="seat-aec"
      />
    </InsetGroup>
  );
  const saveError = failed ? (
    <View style={styles.error} testID="seat-save-error">
      <Text wordSafe variant="body">
        {seatCopy.saveFailed()}
      </Text>
      <Button
        label={copy.tryAgain}
        variant="plain"
        size="compact"
        onPress={() => void choose(failed)}
      />
    </View>
  ) : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: seatCopy.title,
          headerSearchBarOptions: {
            ...search,
            hideNavigationBar: false,
            obscureBackground: false,
            hideWhenScrolling: false,
            onFocus: () => setActive(true),
            onBlur: () => setActive(false),
            onClose: () => setActive(false),
          },
          ...(welcome
            ? headerItems(() => trailing)
            : {
                unstable_headerLeftItems: () =>
                  active
                    ? []
                    : [
                        {
                          type: 'button',
                          label: copy.cancel,
                          variant: 'plain',
                          tintColor: colors.navy,
                          accessibilityLabel: copy.cancel,
                          onPress: () => close(false),
                        },
                      ],
              }),
        }}
      />
      <Screen
        grouped
        testID={welcome ? 'welcome-seat' : 'seat-sheet'}
        offline={offlineOf(state)}
      >
        {saveError}
        {state.status === 'error' ? (
          <ContentUnavailable
            symbol="exclamationmark.triangle"
            title={seatCopy.loadFailed}
            action={{
              label: copy.tryAgain,
              onPress: retry,
              testID: 'seat-retry',
            }}
            testID="seat-load-failed"
          />
        ) : typing ? (
          state.status === 'loading' ? (
            <InsetGroup>
              <Skeleton shape="people" count={3} label="Loading electorates" />
            </InsetGroup>
          ) : seats.length || leads.length ? (
            <>
              {state.directory.electorates.partial ? (
                <Text wordSafe variant="footnote">
                  {seatCopy.partial}
                </Text>
              ) : null}
              {seats.length ? (
                <InsetGroup testID="seat-results">{seats.map(row)}</InsetGroup>
              ) : null}
              {leads.length ? (
                <InsetGroup testID="seat-person-leads">
                  {leads.map((lead) => (
                    <PersonLeadRow
                      key={lead.key}
                      lead={lead}
                      disabled={busy}
                      onPress={() => browse(lead.state)}
                    />
                  ))}
                </InsetGroup>
              ) : null}
            </>
          ) : (
            <>
              <Text
                wordSafe
                variant="body"
                tone="inkSoft"
                testID="seat-no-results"
              >
                {seatCopy.noMatch}
              </Text>
              {browseGroup}
              {aec}
            </>
          )
        ) : (
          <>
            {saved ? (
              <InsetGroup testID="seat-saved">
                <SeatRow
                  seat={saved}
                  detail={
                    isHouseSeat(saved)
                      ? seatCopy.saved
                      : abolishedLine(saved.name)
                  }
                  accessory="checkmark"
                  testID="seat-saved-row"
                />
                {welcome ? null : (
                  <LinkRow
                    title={seatCopy.remove}
                    destructive
                    accessory="none"
                    onPress={remove}
                    disabled={busy}
                    testID="seat-remove"
                  />
                )}
              </InsetGroup>
            ) : null}
            <LocationRow
              seats={async () =>
                state.status === 'ready'
                  ? electorates
                  : (await catalogs.directory()).electorates.data.electorates
              }
              onChoose={(s) => void choose(s)}
              accessory={(id) => accessoryFor(id, savingId, chosenId)}
              disabled={busy}
              autoStart={locate}
              stopKey={stopKey}
            />
            {browseGroup}
            {aec}
          </>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  error: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.tight,
  },
});
