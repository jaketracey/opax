import { setElectionClock } from '../today/launch-fixture';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SectionList, View } from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';
import { FigureBlock } from '../../design/record';
import { Skeleton, OfflineLine } from '../../design/states';
import { Text } from '../../design/text';
import { useListSearchBar } from '../../design/search-bar';
import { RouteOptions } from '../../navigation/preview';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { useOffline } from '../../api/useOffline';
import { savedSeatDirectory, useSeat } from '../your-mp/useSeat';
import { vicCopy as c } from './copy';
import { useElectionNow } from './clock';
import { dayCount, dateWords, phase, savedDistrict, timeWords } from './model';
import { useOverview } from './reads';
import { KeyDates } from './KeyDates';
import { Finder } from './Finder';
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
  const params = useLocalSearchParams<{ q?: string; fixture?: string }>();
  useEffect(() => {
    if (params.fixture) setElectionClock(params.fixture);
  }, [params.fixture]);
  const [q, setQ] = useState((params.q ?? '').slice(0, 60));
  const [submit, setSubmit] = useState(params.q ? 1 : 0);
  const read = useOverview();
  const o = read.record?.data;
  const now = useElectionNow(
    o
      ? [
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
  const title = useTitleOnScroll(titleRef, c.bar);
  const listRef =
    useRef<SectionList<{ key: string; element: ReactNode }, ElectionSection>>(
      null,
    );
  const scroll = useRef(0);
  const change = (text: string): void => {
    setQ(text.slice(0, 60));
    if (text.length > 60)
      (searchBar.ref as { current: SearchBarCommands | null }).current?.setText(
        text.slice(0, 60),
      );
    setSubmit(0);
    if (!text.trim())
      requestAnimationFrame(() =>
        listRef.current
          ?.getScrollResponder()
          ?.scrollTo({ y: scroll.current, animated: false }),
      );
  };
  const searchBar = useListSearchBar({
    placeholder: c.placeholder,
    onChangeText: change,
    onSearchButtonPress: (text) => {
      setQ(text.slice(0, 60));
      setSubmit((n) => n + 1);
    },
    onCancelButtonPress: () => change(''),
  });
  useEffect(() => {
    if (params.q)
      (searchBar.ref as { current: SearchBarCommands | null }).current?.setText(
        params.q.slice(0, 60),
      );
  }, [params.q, searchBar.ref]);
  const finding = q.trim().length >= 3 || (submit > 0 && !!q.trim());
  const state = o ? phase(o, now) : null;
  const header = (
    <>
      <View ref={titleRef} onLayout={title.onTitleLayout}>
        <Text wordSafe variant="pageTitle" accessibilityRole="header">
          {o?.title ?? c.title}
        </Text>
      </View>
      {offline && read.record ? (
        <OfflineLine savedAt={read.record.savedAt} />
      ) : null}
      {o && !finding ? (
        <>
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
            {state === 'ahead' ? (
              <FigureBlock
                testID="vic-election-days"
                value={String(dayCount(o, now))}
                ink="votes"
                label={c.until(dayCount(o, now), dateWords(o.election_day))}
                accessibilityLabel={`${dayCount(o, now)} ${c.until(dayCount(o, now), dateWords(o.election_day))}`}
              />
            ) : (
              <Block title={state === 'today' ? c.today : c.closed}>
                <Text wordSafe variant="body">
                  {state === 'today'
                    ? `${c.hours(timeWords(o.polls_open), timeWords(o.polls_close))}.`
                    : c.closedBody(
                        timeWords(o.polls_close),
                        dateWords(o.election_day),
                      )}
                </Text>
                <ExternalRow
                  title={state === 'today' ? c.voting : c.vec}
                  url={
                    state === 'today' ? o.sources.voting : o.sources.election
                  }
                />
              </Block>
            )}
          </View>
          {saved ? (
            <Block title={c.yourDistrict} testID="vic-election-your-seat">
              <SeatRow district={saved} />
            </Block>
          ) : null}
          <KeyDates o={o} now={now} />
        </>
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
        onScroll={(y) => {
          title.onScroll(y);
          if (!finding) scroll.current = y;
        }}
      />
    </>
  );
}
