import { LoadingStatus } from '../../design/states';
import { isAbortError } from '../../api/abort';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NavigationContext } from 'expo-router/react-navigation';
import { RefreshControl, StyleSheet, View } from 'react-native';
import {
  ContentUnavailable,
  Heading,
  InsetGroup,
  InlineError,
  RecordRow,
  Screen,
  SourceLine,
  copy,
  rowMenus,
  thisDevice,
  type RowMenuAction,
} from '../../design/primitives';
import { calendarDate, formatDate } from '../../design/format';
import { colors, rhythm } from '../../design/tokens';
import { docRoute } from '../../navigation/routes';
import { useSpeechSpeakers } from './speaker';
import { records } from './runtime';
import { useRead } from './useRead';
import { citeItems } from './RecordActions';
import { isOffline } from './RecordLoadError';
import {
  metaLine,
  recentRecord,
  recordHeadline,
  type RecentFeed,
  type RecentItem,
} from './model';
import type { RecordResult } from '../../api/client';

/**
 * The reader's own calendar day for a date added: a UTC timestamp such as
 * 20:00Z is the next morning in Australia, as every other date here reads.
 */
function localDay(indexed: string | null | undefined): string | null {
  const date = indexed ? calendarDate(indexed) : null;
  if (!date) return null;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.year}-${two(date.month + 1)}-${two(date.day)}`;
}

/**
 * Rows grouped by the day OPAX added them, newest first (the feed's order).
 * Rows without a date added follow in a final group with no header.
 */
function byDayAdded(rows: readonly RecentItem[]) {
  const groups: { day: string | null; rows: RecentItem[] }[] = [];
  const undated: RecentItem[] = [];
  for (const row of rows) {
    const day = localDay(row.indexed);
    if (!day) {
      undated.push(row);
      continue;
    }
    const last = groups.at(-1);
    if (last && last.day === day) last.rows.push(row);
    else groups.push({ day, rows: [row] });
  }
  if (undated.length) groups.push({ day: null, rows: undated });
  return groups;
}

/**
 * Just added (records.md 5): the newest records in OPAX as record rows,
 * grouped by the day they were added, with pull to refresh. A failed
 * refresh keeps the list and says it is saved.
 */
export default function RecentRecords() {
  const speakerFor = useSpeechSpeakers();
  const load = useCallback(
    (signal?: AbortSignal) => records.recent(undefined, signal),
    [],
  );
  const first = useRead(load);
  const [fresh, setFresh] = useState<RecordResult<RecentFeed> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<unknown>(null);
  const refreshGeneration = useRef(0);
  const refreshController = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      refreshGeneration.current += 1;
      refreshController.current?.abort();
    },
    [],
  );
  const value = fresh ?? first.value;
  const refresh = useCallback(() => {
    const generation = ++refreshGeneration.current;
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    setRefreshing(true);
    void Promise.resolve()
      .then(() => records.recent({ fresh: true }, controller.signal))
      .then((next) => {
        if (
          generation !== refreshGeneration.current ||
          controller.signal.aborted
        )
          return;
        setFresh(next);
        setRefreshError(null);
      })
      .catch((error: unknown) => {
        if (
          generation === refreshGeneration.current &&
          !controller.signal.aborted &&
          !isAbortError(error)
        )
          setRefreshError(error);
      })
      .finally(() => {
        if (generation === refreshGeneration.current) setRefreshing(false);
      });
  }, []);
  const rows = value?.data ?? [];
  const newest =
    rows
      .map((row) => row.indexed ?? '')
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  // A read that could not reach OPAX returns the saved copy marked stale
  // rather than failing: say so, as a failed refresh does.
  const saved = !!refreshError || !!value?.stale;
  const offline =
    (!!refreshError && isOffline(refreshError)) ||
    (!!value?.stale && !value.staleReason);
  let body;
  if (!value && first.error)
    body = isOffline(first.error) ? (
      <ContentUnavailable
        symbol="wifi.slash"
        title={`Not saved on this ${thisDevice()} yet`}
        body="Connect to the internet, then try again."
        action={{ label: copy.tryAgain, onPress: first.retry }}
        testID="recent-error"
      />
    ) : (
      <ContentUnavailable
        symbol="exclamationmark.triangle"
        title="New records couldn't be loaded"
        action={{ label: copy.tryAgain, onPress: first.retry }}
        testID="recent-error"
      />
    );
  else if (!value) body = <RecentSkeleton />;
  else if (!rows.length)
    body = (
      <ContentUnavailable
        symbol="tray"
        title="No new records yet"
        testID="recent-empty"
      />
    );
  else {
    let index = 0;
    body = (
      <View style={styles.groups}>
        {byDayAdded(rows).map((group) => (
          <InsetGroup
            key={group.day ?? 'undated'}
            header={
              group.day ? `Added ${formatDate(group.day, 'long')}` : undefined
            }
          >
            {group.rows.map((row) => {
              const record = recentRecord(row);
              const title = recordHeadline(record);
              const menu: RowMenuAction[] = [
                {
                  title: 'Cite',
                  symbol: 'quote.opening',
                  items: citeItems({ slug: row.slug, title }),
                },
                ...rowMenus.record({ title, slug: row.slug }),
              ];
              return (
                <RecordRow
                  key={row.slug}
                  meta={metaLine(record)}
                  title={title}
                  speaker={speakerFor({
                    speaker: record.speakerName,
                    party: record.party,
                  })}
                  href={docRoute(row.slug)}
                  menu={menu}
                  testID={`recent-record-${index++}`}
                />
              );
            })}
          </InsetGroup>
        ))}
        <SourceLine
          title="About dates added"
          asOf={saved ? null : newest}
          savedAt={saved ? value.savedAt : null}
          citation="OPAX"
          state={value.data.partial ? 'partial' : saved ? 'saved' : null}
          notes={[
            'Records added recently. The date is when the record was added to OPAX, not when it was published.',
            value.data.partial ? 'Some records could not be read.' : null,
          ]}
          testID="recent-source"
        />
      </View>
    );
  }
  // Opened as the first page of its stack (a link opened into a sheet, with
  // no back button), the page has no title to scroll away from: the bar
  // shows "Just added" from the first frame and the page drops its own
  // heading, which would say it twice (records-07). Pushed, the heading
  // leads and the bar takes it by scroll (records.md 5.2).
  const navigation = useContext(NavigationContext);
  const opensStack = navigation?.getState()?.index === 0;
  return (
    <Screen
      testID="recent-records"
      barTitle={opensStack ? undefined : 'Just added'}
      offline={offline ? { savedAt: value?.savedAt ?? null } : null}
      refreshControl={
        value ? (
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        ) : undefined
      }
    >
      {opensStack ? null : (
        <Heading level={1} kind="page" testID="recent-title">
          Just added
        </Heading>
      )}
      {/* Offline, the screen's banner already says the copy is saved. */}
      {value && refreshError && !offline ? (
        <InlineError
          subject="New records"
          message="New records couldn't be refreshed. Showing the saved copy."
          onRetry={refresh}
          testID="recent-refresh-error"
        />
      ) : null}
      {body}
    </Screen>
  );
}

/** One header bar and six record rows (records.md 5.3). */
function RecentSkeleton() {
  const bar = (width: `${number}%`, height: number) => (
    <View style={[styles.bar, { width, height }]} />
  );
  return (
    <LoadingStatus
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading new records"
      accessibilityState={{ busy: true }}
      testID="recent-loading"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.groups}
      >
        {bar('45%', 16)}
        {Array.from({ length: 6 }, (_, index) => (
          <View key={index} style={styles.row}>
            {bar('40%', 14)}
            {bar('100%', 18)}
            {bar('70%', 18)}
          </View>
        ))}
      </View>
    </LoadingStatus>
  );
}

const styles = StyleSheet.create({
  groups: { gap: rhythm.group },
  row: { gap: rhythm.line },
  bar: {
    borderRadius: 4,
    borderCurve: 'continuous',
    backgroundColor: colors.sunken,
  },
});
