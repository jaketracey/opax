import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { catalogs } from '../../api/runtime';
import { isOffline } from '../CatalogState';
import {
  ContentUnavailable,
  InlineError,
  Screen,
  SectionHeader,
  Skeleton,
  copy,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { useRead } from '../reports/parts';
import { explore } from './runtime';
import { ExploreHeader } from './parts';
import { readExploreChoices, saveExploreChoice } from './repository';
import { YearBills } from './YearBills';
import { YearBrief } from './YearBrief';
import { YearGallery } from './YearGallery';
import { YearHeader, YearPager } from './YearHeader';
import { FIRST_YEAR, LAST_YEAR, useYearChoice } from './YearMenu';
import { YearVoices, type RosterLookup } from './YearVoices';

/** The latest complete year: 2025 in November 2026. */
export function defaultYear(today = new Date()) {
  const sydney = Number(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      year: 'numeric',
    }).format(today),
  );
  return Math.min(LAST_YEAR, sydney - 1);
}
/** `?year` outside 1998 to 2026 is ignored. */
export function linkedYear(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d{4}$/.test(raw)) return null;
  const year = Number(raw);
  return year >= FIRST_YEAR && year <= LAST_YEAR ? year : null;
}
const loadBills = () => catalogs.bills();
const loadRoster = async () => {
  const [roster, slugs] = await Promise.all([
    catalogs.roster(),
    catalogs.slugs(),
  ]);
  return {
    ...roster,
    data: {
      people: roster.data.people,
      slugs: slugs.data.slugs,
    } satisfies RosterLookup,
  };
};

/**
 * One year of the record at once: its photographs, a machine-written brief,
 * the voices in its debates and its bills. The year is chosen from the
 * title's menu or the bottom pager.
 */
export default function TimeMachine() {
  const params = useLocalSearchParams<{
    year?: string;
    photo?: string;
  }>();
  const linked = linkedYear(params.year);
  const [year, setYearState] = useState<number | null>(linked);
  const [photo, setPhoto] = useState<string | null>(
    linked ? (params.photo ?? null) : null,
  );
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (year !== null) return;
    let active = true;
    void readExploreChoices().then((saved) => {
      if (active)
        setYearState((current) => current ?? saved.year ?? defaultYear());
    });
    return () => {
      active = false;
    };
  }, [year]);
  const setYear = useCallback((next: number) => {
    setYearState(next);
    setPhoto(null);
    saveExploreChoice({ year: next });
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, []);
  useYearChoice(setYear);
  const shown = year ?? defaultYear();
  return (
    <>
      <ExploreHeader title="Time machine" game="tm" />
      <YearPage
        key={shown}
        year={shown}
        photo={photo}
        onYear={setYear}
        scrollRef={scroll}
      />
      <YearPager year={shown} onYear={setYear} />
    </>
  );
}

function YearPage({
  year,
  photo,
  onYear,
  scrollRef,
}: {
  year: number;
  photo: string | null;
  onYear: (year: number) => void;
  scrollRef: React.RefObject<ScrollView | null>;
}) {
  const loadYear = useCallback(() => explore.year(year), [year]);
  const brief = useRead(loadYear),
    pictures = useRead(explore.pictures),
    bills = useRead(loadBills),
    roster = useRead(loadRoster);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    if (brief.error || !brief.record) brief.retry();
    if (pictures.error) pictures.retry();
    if (bills.error) bills.retry();
    if (roster.error) roster.retry();
    setTimeout(() => setRefreshing(false), 300);
  };
  const photos = pictures.record?.data[String(year)] ?? [];
  const offline =
    isOffline(brief.error) || brief.record?.stale
      ? { savedAt: brief.record?.stale ? brief.record.savedAt : null }
      : null;
  const nothing =
    !brief.record &&
    isOffline(brief.error) &&
    !pictures.record &&
    isOffline(pictures.error);
  const meta = brief.record
    ? {
        asOf: brief.record.asOf,
        savedAt: brief.record.stale ? brief.record.savedAt : null,
      }
    : null;
  return (
    <Screen
      testID="explore-tm-screen"
      barTitle="Time machine"
      scrollRef={scrollRef as React.Ref<ScrollView>}
      offline={offline && !nothing ? offline : null}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <YearHeader
        year={year}
        onYear={onYear}
        generatedAt={brief.record?.data.generated_at}
      />
      {nothing ? (
        <ContentUnavailable
          symbol="wifi.slash"
          title={copy.notSaved}
          body={copy.notSavedBody}
          action={{ label: copy.tryAgain, onPress: refresh }}
          testID="tm-unavailable"
        />
      ) : (
        <>
          {pictures.record ? (
            photos.length ? (
              <YearGallery
                key={year}
                year={year}
                photos={photos}
                initial={photo}
              />
            ) : null
          ) : pictures.error ? null : (
            <Skeleton
              shape="text"
              count={3}
              label="Loading photographs"
              testID="tm-photo-manifest"
            />
          )}
          {brief.record && meta ? (
            <>
              <YearBrief data={brief.record.data} meta={meta} />
              <YearVoices
                data={brief.record.data}
                meta={meta}
                roster={roster.record?.data ?? null}
              />
            </>
          ) : brief.error ? (
            <View style={{ gap: rhythm.block }}>
              <SectionHeader title="The year in brief" />
              <InlineError
                subject={String(year)}
                onRetry={brief.retry}
                testID="tm-year-error"
              />
            </View>
          ) : (
            <View style={{ gap: rhythm.block }}>
              <SectionHeader title="The year in brief" />
              <Skeleton
                shape="text"
                count={5}
                label="Loading the year in brief"
                testID="tm-year-loading"
              />
              <Skeleton shape="rows" count={3} label="Loading voices" />
            </View>
          )}
          <YearBills year={year} read={bills} />
        </>
      )}
    </Screen>
  );
}
