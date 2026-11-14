import { setElectionClock } from '../today/launch-fixture';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, SectionList, View } from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';
import { useAccessibilitySize } from '../../design/accessibility';
import { FigureBlock } from '../../design/record';
import { Skeleton, OfflineLine } from '../../design/states';
import { Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { useListSearchBar } from '../../design/search-bar';
import { restOffset, scrollToTop } from '../../design/scroll-to-top';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { RouteOptions } from '../../navigation/preview';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { useOffline } from '../../api/useOffline';
import { savedSeatDirectory, useSeat } from '../your-mp/useSeat';
import { vicCopy as c } from './copy';
import { useElectionNow } from './clock';
import { dayCount, dateWords, electionCopy, savedDistrict } from './model';
import { VIC_ELECTION_INSTANTS } from './state';
import { ElectionStatus } from './Status';
import { ElectionResults } from './Results';
import { useOverview } from './reads';
import { KeyDates } from './KeyDates';
import { Finder } from './Finder';
import { useContentArrival } from './useContentArrival';
import { SeatRow, RegionRow } from './rows';
import {
  About,
  Block,
  ElectionFoot,
  ElectionList,
  ExternalRow,
  OverviewSource,
  Unavailable,
  item,
  pageOptions,
  type ElectionSection,
} from './shared';

export default function Hub() {
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    q?: string;
    place?: string;
    fixture?: string;
  }>();
  useEffect(() => {
    if (params.fixture) setElectionClock(params.fixture);
  }, [params.fixture]);
  const routeQuery = (params.q ?? params.place ?? '').slice(0, 60);
  const [search, setSearch] = useState({
    routeQuery,
    q: routeQuery,
    submit: routeQuery ? 1 : 0,
  });
  // Reset before committing children, so an incoming place never draws old hits.
  // The hub and finder stay mounted, retaining focus and list position.
  if (search.routeQuery !== routeQuery)
    setSearch({ routeQuery, q: routeQuery, submit: routeQuery ? 1 : 0 });
  const { q, submit } = search;
  const read = useOverview();
  const o = read.record?.data;
  const arrivalOpacity = useContentArrival(!o && !read.error, !!o);
  const now = useElectionNow(
    o
      ? [
          ...VIC_ELECTION_INSTANTS,
          o.polls_close,
          ...o.key_dates.flatMap((d) => (d.passes_at ? [d.passes_at] : [])),
        ]
      : [],
  );
  const offline = useOffline();
  const seat = useSeat();
  const directory = savedSeatDirectory();
  const saved = o
    ? savedDistrict(
        seat.status === 'chosen' ? seat.choice.stateSeatIds : [],
        directory?.electorates.data.electorates ?? [],
        o,
      )
    : null;
  const titleRef = useRef<View>(null);
  const accessible = useAccessibilitySize();
  const title = useTitleOnScroll(
    titleRef,
    Platform.OS === 'android' && accessible ? c.barShort : c.bar,
    { routeTitle: c.bar },
  );
  const listRef =
    useRef<SectionList<{ key: string; element: ReactNode }, ElectionSection>>(
      null,
    );
  const scroll = useRef(0);
  // The live offset, finder included; `scroll` keeps the hub's for clearing.
  const offset = useRef<number | null>(null);
  const headerBottom = useHeaderBottom();
  const writeQuery = (text: string) =>
    navigation.setParams({
      q: text.slice(0, 60).trim() || undefined,
      place: undefined,
    } as never);
  const change = (text: string): void => {
    setSearch((prev) => ({ ...prev, q: text.slice(0, 60), submit: 0 }));
    if (text.length > 60)
      (searchBar.ref as { current: SearchBarCommands | null }).current?.setText(
        text.slice(0, 60),
      );
    if (!text.trim()) {
      writeQuery('');
      requestAnimationFrame(() =>
        listRef.current
          ?.getScrollResponder()
          ?.scrollTo({ y: scroll.current, animated: false }),
      );
    }
  };
  const searchBar = useListSearchBar({
    placeholder: c.placeholder,
    onChangeText: change,
    onSearchButtonPress: (text) => {
      setSearch((prev) => ({
        ...prev,
        q: text.slice(0, 60),
        submit: prev.submit + 1,
      }));
      writeQuery(text);
    },
    onCancelButtonPress: () => change(''),
  });
  useEffect(() => {
    (searchBar.ref as { current: SearchBarCommands | null }).current?.setText(
      routeQuery,
    );
  }, [routeQuery, searchBar.ref]);
  const finding = q.trim().length >= 3 || (submit > 0 && !!q.trim());
  // Results replace the hub inside the same list, which keeps its offset.
  // From far down the districts, that offset lies past the end of the shorter
  // results, leaving the first match under the search field. Each new query
  // starts at the page's top, below the native header. A list that hasn't
  // moved since it mounted is already there.
  useEffect(() => {
    // The rest is the list's own: 0 below the pushed opaque bar, where
    // -headerBottom scheduled a reset that moved nothing.
    const list = () => listRef.current?.getScrollResponder() ?? null;
    if (
      !finding ||
      offset.current === null ||
      offset.current <= restOffset(list(), headerBottom) + 1
    )
      return;
    requestAnimationFrame(() => scrollToTop(list(), headerBottom));
    // Only a new query moves the page; a settling header height doesn't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finding, q]);
  const copy = o ? electionCopy(o, now) : null;
  const header = (
    <>
      <View ref={titleRef} onLayout={title.onTitleLayout}>
        <Text wordSafe variant="pageTitle" accessibilityRole="header">
          {copy?.title ?? c.title}
        </Text>
      </View>
      {offline && read.record ? (
        <OfflineLine savedAt={read.record.savedAt} />
      ) : null}
      {o && !finding ? (
        <Animated.View style={{ gap: rhythm.block, opacity: arrivalOpacity }}>
          {o.notice ? (
            <Block testID="vic-election-notice">
              <Text wordSafe variant="body">
                {o.notice.text}
              </Text>
              {o.notice.link ? (
                <ExternalRow
                  title={o.notice.link.label}
                  url={o.notice.link.url}
                />
              ) : null}
            </Block>
          ) : null}
          <View testID="vic-election-status">
            {copy &&
            !copy.closed &&
            copy.state !== 'election_day' &&
            dayCount(o, now) > 0 ? (
              <FigureBlock
                testID="vic-election-days"
                value={String(dayCount(o, now))}
                ink="votes"
                label={c.until(dayCount(o, now), dateWords(o.election_day))}
                accessibilityLabel={`${dayCount(o, now)} ${c.until(dayCount(o, now), dateWords(o.election_day))}`}
              />
            ) : null}
            <ElectionStatus
              context={o}
              now={now}
              electionURL={o.sources.election}
              votingURL={o.sources.voting}
            />
          </View>
          {saved ? (
            <Block title={c.yourDistrict} testID="vic-election-your-seat">
              <SeatRow district={saved} />
            </Block>
          ) : null}
          <ElectionResults o={o} now={now} />
          <KeyDates o={o} now={now} />
        </Animated.View>
      ) : null}
    </>
  );
  const sections: ElectionSection[] = o
    ? finding
      ? [
          {
            key: 'finder',
            data: [item('finder', <Finder q={q} submit={submit} o={o} />)],
          },
        ]
      : [
          {
            key: 'districts',
            title: c.districts(o.districts.length),
            note: c.districtNote,
            data: o.districts.map((d) =>
              item(d.slug, <SeatRow district={d} />),
            ),
          },
          {
            key: 'regions',
            title: c.regions(o.regions.length),
            note: c.regionNote,
            data: o.regions.map((r) => item(r.slug, <RegionRow region={r} />)),
          },
        ]
    : [
        {
          key: 'state',
          data: [
            item(
              'state',
              read.error ? (
                <Unavailable error={read.error} retry={read.retry} />
              ) : (
                <Skeleton shape="rows" count={14} label={c.loading} />
              ),
            ),
          ],
        },
      ];
  return (
    <>
      <RouteOptions
        options={{
          ...pageOptions(c.bar, o?.web_url),
          headerSearchBarOptions: { ...searchBar, obscureBackground: false },
        }}
      />
      <ElectionList
        sections={sections}
        arrivalOpacity={arrivalOpacity}
        header={header}
        footer={
          o && read.record && !finding ? (
            <>
              <About o={o} />
              <OverviewSource record={read.record} />
              <ElectionFoot o={o} testID="vic-election-foot" />
            </>
          ) : undefined
        }
        testID="vic-election-screen"
        listRef={listRef}
        scrollToOverflowEnabled={finding}
        onScroll={(y) => {
          title.onScroll(y);
          offset.current = y;
          if (!finding) scroll.current = y;
        }}
      />
    </>
  );
}
