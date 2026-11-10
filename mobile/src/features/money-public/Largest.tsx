import { RouteOptions } from '../../navigation/preview';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Animated, type FlatList, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useReduceMotion } from '../../design/accessibility';
import { PopUpButton } from '../../design/controls';
import { formatDate } from '../../design/format';
import { haptic } from '../../design/haptics';
import { MoneyRow } from '../../design/rows';
import { SourceLine } from '../../design/source';
import { ContentUnavailable } from '../../design/states';
import { Heading, Text } from '../../design/text';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { combine } from './catalog';
import { largestFor } from './data';
import { money } from './runtime';
import { moneyItemHref } from './routes';
import {
  MoneyList,
  MoneyStatus,
  moneyBar,
  moneyCitation,
  readableDates,
  recordSource,
} from './parts';

export const LARGEST_RULE = 'The largest new agreement for each recipient';

/**
 * Largest grants (specs/money.md 2.5): one name everywhere, the month only
 * in the pop-up under the title and the share title, the rule line, then
 * the month's grant rows, each pushing its money item. One SourceLine after
 * the list.
 */
export default function Largest() {
  const { month: requested } = useLocalSearchParams<{ month?: string }>();
  const load = useCallback(
    async (refresh: boolean, _publish: unknown, signal?: AbortSignal) => {
      const [largest, index] = await Promise.all([
        money.largest(refresh, signal),
        money.grants('federal', refresh, signal),
      ]);
      return combine([largest, index], {
        largest: largest.data,
        index: index.data,
      });
    },
    [],
  );
  const status = useCatalogRecord(load),
    data = status.record?.data;
  const months = Object.keys(data?.largest.months ?? {})
    .sort()
    .reverse();
  const known = !!requested && months.includes(requested);
  const month = known ? requested : (data?.largest.latest ?? requested ?? '');
  const rows = data ? largestFor(data.largest, data.index, month) : [];
  const titleRef = useRef<View>(null);
  const title = useTitleOnScroll(titleRef, 'Largest grants');
  const saved = recordSource(status.record);
  const label = monthName(month);
  const listRef = useRef<FlatList<(typeof rows)[number]>>(null);
  const fade = useMonthChange(listRef, data ? month : null);
  return (
    <>
      <RouteOptions
        options={{
          title: 'Largest grants',
          ...moneyBar({
            name: 'Largest grants',
            shareTitle: label ? `Largest grants, ${label}` : undefined,
            path: data ? `/money/grants?jur=federal&largest=${month}` : null,
          }),
        }}
      />
      <MoneyList
        loaded={!!data}
        id="largest-list"
        listRef={listRef}
        rows={rows}
        rowKey={(r) => r.id}
        refreshing={status.refreshing}
        refresh={status.refresh}
        onScroll={title.onScroll}
        header={
          <>
            <View ref={titleRef} onLayout={title.onTitleLayout}>
              <Heading level={1} kind="page" testID="largest-title">
                Largest grants
              </Heading>
            </View>
            {month || months.length ? (
              <View style={{ alignSelf: 'flex-start' }}>
                <PopUpButton
                  label="Month"
                  disabled={!data}
                  value={month}
                  options={(months.length ? months : [month]).map((m) => ({
                    value: m,
                    label: monthName(m),
                    shortLabel: monthName(m, true),
                    testID: `largest-month-${m}`,
                  }))}
                  onChange={(next) => {
                    haptic('selection');
                    router.setParams({ month: next });
                  }}
                  testID="largest-month"
                />
              </View>
            ) : null}
            <MoneyStatus
              status={status}
              name="Largest grants"
              figure={false}
              rows={8}
              testID="largest-status"
            />
            {data ? (
              <Text wordSafe variant="secondary" testID="largest-rule">
                {requested && !known
                  ? `${monthName(requested) || 'That month'} has no records. Showing ${label}.`
                  : LARGEST_RULE}
              </Text>
            ) : null}
          </>
        }
        empty={
          <ContentUnavailable
            symbol="calendar"
            title={`No grant agreements started in ${label}.`}
            testID="largest-empty"
          />
        }
        sourceLine={
          data ? (
            <SourceLine
              asOf={data.largest.asOf}
              citation={[moneyCitation('GrantConnect')]}
              savedAt={saved.savedAt}
              state={saved.state}
              originals={[
                { label: 'GrantConnect', url: 'https://www.grants.gov.au/' },
              ]}
              notes={[...data.largest.basis, ...saved.stateNotes].map(
                readableDates,
              )}
              testID="largest-source"
            />
          ) : null
        }
        render={(r, i) => (
          <Animated.View style={{ opacity: fade }}>
            <MoneyRow
              name={r.recipient}
              detail={[
                r.program,
                `from ${formatDate(r.start, 'short').replace(/ \d{4}$/, '')}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              amount={r.value}
              href={moneyItemHref(
                { kind: 'largest', month, id: r.id },
                { name: r.recipient },
              )}
              testID={`largest-recipient-${i}`}
            />
          </Animated.View>
        )}
      />
    </>
  );
}

/** How long a new month's rows take to fade in. */
export const MONTH_FADE_MS = 150;

/**
 * A new month starts at the top of the list, its rows fading in over
 * 150 ms; with Reduce Motion they appear at once. The first month shown
 * (`month` goes from null to a value once the data loads) does neither.
 * Content y 0 sits behind the native header, so the top is minus the
 * header's bottom (useHeaderBottom).
 */
function useMonthChange<T>(
  listRef: React.RefObject<FlatList<T> | null>,
  month: string | null,
) {
  const [fade] = useState(() => new Animated.Value(1));
  const shown = useRef<string | null>(null);
  const fading = useRef(false);
  const reduceMotion = useReduceMotion();
  const headerBottom = useHeaderBottom();
  // Before paint: back to the top, and the new rows start clear so they
  // never show at full opacity first.
  useLayoutEffect(() => {
    if (month === null || month === shown.current) return;
    const first = shown.current === null;
    shown.current = month;
    if (first) return;
    listRef.current?.scrollToOffset({ offset: -headerBottom, animated: false });
    if (reduceMotion) return;
    fade.setValue(0);
    fading.current = true;
  }, [month, listRef, fade, reduceMotion, headerBottom]);
  // After the old rows have let go of the value: fade the new ones in.
  useEffect(() => {
    if (!fading.current) return;
    fading.current = false;
    Animated.timing(fade, {
      toValue: 1,
      duration: MONTH_FADE_MS,
      useNativeDriver: true,
    }).start();
  }, [month, fade]);
  return fade;
}

const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;
/** "August 2026", or "Aug 2026" where space is short. */
export function monthName(month: string, short = false) {
  return MONTH.test(month)
    ? new Intl.DateTimeFormat('en-AU', {
        month: short ? 'short' : 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${month}-01`))
    : '';
}
/** "2026-08" one month on is "2026-09"; back from January is December. */
export function shiftMonth(month: string, by: number): string | undefined {
  if (!MONTH.test(month)) return undefined;
  const index =
    Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}
