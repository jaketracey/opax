import { RouteOptions } from '../../navigation/preview';
import type {
  NativeStackHeaderItem,
  NativeStackNavigationProp,
} from 'expo-router';
import type { ParamListBase } from 'expo-router/react-navigation';
import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Electorate } from '../../api/catalogs';
import { catalogs } from '../../api/runtime';
import { Button } from '../../design/controls';
import { copy } from '../../design/copy';
import { formatCount } from '../../design/format';
import { InsetGroup, Screen } from '../../design/layout';
import { confirmAction } from '../../design/menu';
import { LinkRow } from '../../design/rows';
import { useListSearchBar } from '../../design/search-bar';
import { ContentUnavailable, Skeleton } from '../../design/states';
import { Text } from '../../design/text';
import { colors, rhythm } from '../../design/tokens';
import { headerItems } from '../../navigation/chrome';
import { openSource } from '../../navigation/external';
import { seatStateRoute, welcomeSeatStateRoute } from '../../navigation/routes';
import { newcomerOption } from '../newcomer/option';
import { TermTip } from '../newcomer/TermTip';
import { newcomerSeatHelp, newcomerSeatWhy } from '../newcomer/terms';
import {
  firstRunChosen,
  firstRunSkipped,
  type FirstRunMethod,
} from '../../onboarding/measure';
import { closeWelcome, markWelcomeSeen } from '../../onboarding/state';
import type { Directory } from '../your-mp/model';
import { migratedSeat, useSeat } from '../your-mp/useSeat';
import { FieldClearance } from './FieldClearance';
import { LocationRow } from './LocationRow';
import {
  abolishedLine,
  browseStates,
  isHouseSeat,
  isStateCode,
  matchIn,
  matchLeads,
  matchSeats,
  noMatchCopy,
  regionOf,
  seatCopy,
  vicCopy,
  vicDistricts,
  vicRegions,
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
 * Saving a choice: the tapped row shows an indicator while the seat is
 * written, then a checkmark for 300 ms with the success haptic (useSeat),
 * then the host closes. A failed write keeps the chooser open with a line
 * and Try again.
 */
export function useChoose(
  onChosen: (seat: Electorate) => void,
  /** The write; the federal seat (`useSeat().choose`) by default. */
  write?: (
    target: Electorate,
    seat: ReturnType<typeof useSeat>,
  ) => Promise<void>,
) {
  const seat = useSeat();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [failed, setFailed] = useState<Electorate | null>(null);
  const live = useRef(true);
  const choosing = useRef(false);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (closing.current) clearTimeout(closing.current);
    };
  }, []);
  const choose = async (target: Electorate) => {
    // React batches row updates. A ref also blocks another tap before the
    // saving state has rendered, including taps on a different row.
    if (choosing.current) return;
    choosing.current = true;
    setFailed(null);
    setSavingId(target.electorate_id);
    try {
      await (write ? write(target, seat) : seat.choose(target));
    } catch {
      if (live.current) {
        choosing.current = false;
        setSavingId(null);
        setFailed(target);
      }
      return;
    }
    if (!live.current) return;
    setSavingId(null);
    setChosenId(target.electorate_id);
    closing.current = setTimeout(() => onChosen(target), CHOSEN_MARK_MS);
  };
  return { seat, choose, savingId, chosenId, failed };
}

/**
 * The Victorian write: a district also sets its Council region (one trip,
 * specs/your-mp.md 4.5), read from the district's own record. If that
 * record can't be read, the district is set alone and Your MP offers the
 * region as usual. A region sets the region only.
 */
async function chooseVictorian(
  target: Electorate,
  seat: ReturnType<typeof useSeat>,
  electorates: readonly Electorate[],
): Promise<void> {
  if (target.chamber !== 'vic_la') return seat.chooseState(target);
  const region = await catalogs.electorate(target.detail_url).then(
    (result) => regionOf(result.data, electorates),
    () => null,
  );
  return seat.chooseState(target, region ?? undefined);
}

/** A failed write: the line and Try again, above the seats (chooser and Browse by state). */
export function SeatSaveError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.error} testID="seat-save-error">
      <Text wordSafe variant="body">
        {seatCopy.saveFailed()}
      </Text>
      <Button
        label={copy.tryAgain}
        variant="plain"
        size="compact"
        onPress={onRetry}
      />
    </View>
  );
}

/** The AEC's own finder, for a reader who knows their address, not their seat. */
export function AecRow() {
  return (
    <InsetGroup>
      <LinkRow
        title={seatCopy.aec}
        external
        onPress={() => void openSource(AEC_URL, 'AEC electorate finder')}
        testID="seat-aec"
      />
    </InsetGroup>
  );
}

/**
 * Why the welcome asks. The newcomer design pass (prototype) says what an
 * electorate is first; options B and C add the term's tip beside it.
 */
function SeatWhy() {
  const option = newcomerOption();
  if (!option)
    return (
      <Text wordSafe variant="body" testID="welcome-seat-why">
        {seatCopy.why}
      </Text>
    );
  return (
    <View style={{ gap: rhythm.line }}>
      <Text wordSafe variant="body" testID="welcome-seat-why">
        {newcomerSeatWhy}
      </Text>
      <Text wordSafe variant="secondary" tone="inkSoft">
        {newcomerSeatHelp}
      </Text>
      {option === 'a' ? null : <TermTip term="electorate" variant="link" />}
    </View>
  );
}

/**
 * The welcome's way on without a seat, in the list itself (first-run
 * drop-off, 12 Nov): the bar's "Not now" is small, fixed-size text a reader
 * can miss, and it never says the choice can be made later. This is a full
 * button at the reader's text size, with where to find the choice again. It
 * does what "Not now" does: records the decline and closes onto Today.
 */
export function ChooseLater({
  onPress,
  disabled = false,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.later} testID="seat-later">
      <Button
        label={seatCopy.later}
        variant="secondary"
        fullWidth
        onPress={onPress}
        disabled={disabled}
        testID="seat-choose-later"
      />
      <Text
        wordSafe
        variant="footnote"
        tone="inkSoft"
        style={styles.centred}
        testID="seat-later-note"
      >
        {seatCopy.laterNote}
      </Text>
    </View>
  );
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
 * the bar with no label above it; the sheet focuses it on arrival at every
 * text size except with `locate=1`, where the location row starts at once.
 * The welcome leaves it unfocused (your-mp.md 4.10).
 */
export function SeatChooser({
  presentation,
  scope = 'federal',
  locate = false,
  onChosen,
}: {
  presentation: SeatPresentation;
  /** `vic`: Victorian districts and regions (the sheet only). */
  scope?: 'federal' | 'vic';
  locate?: boolean;
  onChosen?: (seat: Electorate) => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const welcome = presentation === 'welcome';
  const vic = scope === 'vic' && !welcome;
  const { state, retry } = useSeatDirectory();
  const electorates =
    state.status === 'ready'
      ? state.directory.electorates.data.electorates
      : [];
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(false);
  const [stopKey, setStopKey] = useState(0);
  // Which control chose, for the first-run funnel: a category, never a seat.
  const method = useRef<FirstRunMethod>('search');
  const close = useCallback(
    (declined: boolean) => {
      if (welcome) void markWelcomeSeen({ declined }).catch(() => undefined);
      if (welcome && declined) firstRunSkipped('seat');
      // Pops the whole sheet or welcome from the root stack, from the
      // chooser or a Browse list inside it.
      closeWelcome(navigation as Parameters<typeof closeWelcome>[0]);
    },
    [welcome, navigation],
  );
  const { seat, choose, savingId, chosenId, failed } = useChoose(
    (chosen) => {
      onChosen?.(chosen);
      if (welcome) firstRunChosen('seat', method.current);
      close(false);
    },
    vic
      ? (target, actions) => chooseVictorian(target, actions, electorates)
      : undefined,
  );
  const saved =
    seat.status === 'chosen' && state.status === 'ready'
      ? (state.directory.electorates.data.electorates.find(
          (s) => s.electorate_id === seat.choice.seatId,
        ) ?? null)
      : null;
  const openedMigration = useRef(false);
  useEffect(() => {
    if (
      openedMigration.current ||
      welcome ||
      vic ||
      state.status !== 'ready' ||
      seat.status === 'loading'
    )
      return;
    const old = migratedSeat();
    if (
      !old ||
      (seat.status === 'chosen' && seat.choice.seatId === old.electorate_id)
    )
      return;
    const code = old.state_code.toLowerCase();
    if (!isStateCode(code)) return;
    openedMigration.current = true;
    router.push(seatStateRoute(code));
  }, [seat, state, welcome, vic]);
  const autoFocus = !welcome && !locate;
  const typed = (text: string) => {
    setQuery(text);
    if (text.trim()) setStopKey((n) => n + 1);
  };
  const search = useListSearchBar({
    placeholder: vic ? vicCopy.placeholder : seatCopy.placeholder,
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
  useEffect(() => {
    if (!autoFocus) return;
    // iOS ignores SearchBar's Android-only autoFocus prop. The search ref
    // can attach after useListSearchBar's mount effect, and UIKit cannot
    // become first responder until the sheet has finished arriving.
    const arrived = ({ data }: { data: { closing: boolean } }) => {
      if (!data.closing && navigation.isFocused()) search.ref?.current?.focus();
    };
    const remove = navigation.addListener('transitionEnd', arrived);
    // /seat owns a nested stack: the modal transition belongs to its parent.
    const parent = navigation.getParent<
      NativeStackNavigationProp<ParamListBase> | undefined
    >();
    const removeParent = parent?.addListener('transitionEnd', arrived);
    return () => {
      remove();
      removeParent?.();
    };
  }, [autoFocus, navigation, search.ref]);
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
          // Through the seat's write queue, so a save still in flight
          // cannot land after the forget and bring the choice back.
          void seat.forget().then(
            () => close(false),
            () => undefined,
          );
        },
      },
    ]);

  const typing = query.trim().length > 0;
  const seats = typing && !vic ? matchSeats(electorates, query) : [];
  const leads = typing && !vic ? matchLeads(electorates, query) : [];
  const districts = vic ? vicDistricts(electorates) : [];
  const regions = vic ? vicRegions(electorates) : [];
  const savedState = new Set(
    seat.status === 'chosen' ? seat.choice.stateSeatIds : [],
  );
  const busy = savingId !== null || chosenId !== null;
  const row = (s: Electorate) => {
    const accessory = accessoryFor(s.electorate_id, savingId, chosenId);
    return (
      <SeatRow
        key={s.electorate_id}
        seat={s}
        onPress={() => {
          method.current = 'search';
          void choose(s);
        }}
        disabled={
          busy && savingId !== s.electorate_id && chosenId !== s.electorate_id
        }
        accessory={
          accessory === 'chevron' && !busy && savedState.has(s.electorate_id)
            ? 'checkmark'
            : accessory
        }
        testID={`seat-row-${s.slug}`}
      />
    );
  };
  const vicGroups = (d: Electorate[], r: Electorate[]) => (
    <>
      {d.length ? (
        <InsetGroup header={vicCopy.districts} testID="seat-vic-districts">
          {d.map(row)}
        </InsetGroup>
      ) : null}
      {r.length ? (
        <InsetGroup header={vicCopy.regions} testID="seat-vic-regions">
          {r.map(row)}
        </InsetGroup>
      ) : null}
    </>
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
  const aec = <AecRow />;
  // "Use my location", in the idle list and again under a miss, so a reader
  // who typed a suburb or postcode has one tap on from "no match".
  const location = (autoStart: boolean) => (
    <LocationRow
      seats={async () =>
        state.status === 'ready'
          ? electorates
          : (await catalogs.directory()).electorates.data.electorates
      }
      onChoose={(s) => {
        method.current = 'location';
        void choose(s);
      }}
      accessory={(id) => accessoryFor(id, savingId, chosenId)}
      disabled={busy}
      autoStart={autoStart}
      stopKey={stopKey}
      scope={vic ? 'vic' : 'federal'}
    />
  );
  // The welcome with no seat saved: why it asks, and the way on without one.
  const asking = welcome && !saved && seat.status !== 'chosen';
  const later = asking ? (
    <ChooseLater onPress={() => close(true)} disabled={busy} />
  ) : null;
  const miss = noMatchCopy(query);
  const saveError = failed ? (
    <SeatSaveError onRetry={() => void choose(failed)} />
  ) : null;

  return (
    <>
      <RouteOptions
        options={{
          title: vic ? vicCopy.title : seatCopy.title,
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
      <FieldClearance>
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
                <Skeleton
                  shape="people"
                  count={3}
                  label="Loading electorates"
                />
              </InsetGroup>
            ) : vic ? (
              (() => {
                const d = matchIn(districts, query);
                const r = matchIn(regions, query);
                return d.length || r.length ? (
                  vicGroups(d, r)
                ) : (
                  <Text
                    wordSafe
                    variant="body"
                    tone="inkSoft"
                    testID="seat-no-results"
                  >
                    {seatCopy.noMatch}
                  </Text>
                );
              })()
            ) : seats.length || leads.length ? (
              <>
                {state.directory.electorates.partial ? (
                  <Text wordSafe variant="footnote">
                    {seatCopy.partial}
                  </Text>
                ) : null}
                {seats.length ? (
                  <InsetGroup testID="seat-results">
                    {seats.map(row)}
                  </InsetGroup>
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
                {location(false)}
                {browseGroup}
                {aec}
                {later}
              </>
            )
          ) : (
            <>
              {asking ? <SeatWhy /> : null}
              {saved && !vic ? (
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
              {location(locate)}
              {vic ? (
                state.status === 'ready' ? (
                  vicGroups(districts, regions)
                ) : (
                  <InsetGroup header={vicCopy.districts}>
                    <Skeleton
                      shape="rows"
                      count={3}
                      label="Loading electorates"
                    />
                  </InsetGroup>
                )
              ) : (
                <>
                  {browseGroup}
                  {aec}
                  {later}
                </>
              )}
            </>
          )}
        </Screen>
      </FieldClearance>
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
  miss: { gap: rhythm.line },
  later: { gap: rhythm.tight, alignItems: 'center' },
  centred: { textAlign: 'center' },
});
