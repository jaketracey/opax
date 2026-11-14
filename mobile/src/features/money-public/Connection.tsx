import { RouteOptions } from '../../navigation/preview';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { passageText } from '../../api/passage-text';
import { catalogs } from '../../api/runtime';
import { copy } from '../../design/copy';
import { formatDate } from '../../design/format';
import { Screen, SectionHeader } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { SourceLine } from '../../design/source';
import {
  ContentUnavailable,
  InlineError,
  OfflineLine,
  Skeleton,
} from '../../design/states';
import { symbols } from '../../design/symbols';
import { Heading, Text } from '../../design/text';
import { colors, rhythm } from '../../design/tokens';
import { ApiError } from '../../api/errors';
import { electorateRoute } from '../../navigation/routes/your-mp';
import {
  connectionsRoute,
  grantProgramRoute,
} from '../../navigation/routes/public-money';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import {
  CONNECTIONS_CITATION,
  CONNECTIONS_NOTE,
  connectionDetail,
  displayName,
} from './Connections';
import { money } from './runtime';
import { organisationHref } from './routes';
import { MoneyStatus, moneyBar, readableDates, recordSource } from './parts';
import type { Href } from 'expo-router';

/** The excerpt's publisher in words: "Hansard", "Press release". */
const publisher = (kind: string) =>
  kind === 'Parliamentary record'
    ? 'Hansard'
    : kind === 'Official release'
      ? 'Press release'
      : kind === 'Grant record'
        ? 'Queensland grant'
        : kind;

const lower = (s: string) => s.toLocaleLowerCase('en-AU');

type Destination = {
  kind: 'organisation' | 'electorate' | 'program';
  title: string;
  detail?: string;
  symbol?: (typeof symbols)[keyof typeof symbols];
  href: Href;
};

/**
 * One program, place or organisation (specs/money.md 2.12): its kind and
 * document count, rows named by their destination where OPAX has one (the
 * organisation's page, the electorate, the grant program), then the
 * excerpts that name it.
 */
export default function Connection() {
  const { id = '', name: routeName } = useLocalSearchParams<{
    id: string;
    name?: string;
  }>();
  const loadIndex = useCallback(
    (refresh: boolean, _publish: unknown, signal?: AbortSignal) =>
      money.connections(refresh, signal),
    [],
  );
  const index = useCatalogRecord(loadIndex);
  const loadExcerpts = useCallback(
    (refresh: boolean, _publish: unknown, signal?: AbortSignal) =>
      money.evidence(id, refresh, signal),
    [id],
  );
  const excerpts = useCatalogRecord(loadExcerpts);
  const listed = index.record?.data.entities.find((e) => e.id === id);
  const entry = excerpts.record?.data[id];
  const kind = listed?.kind ?? entry?.kind ?? '';
  const name = displayName(listed?.name ?? entry?.name ?? routeName ?? '');
  const destinations = useDestinations(
    listed?.name ?? entry?.name,
    kind,
    entry?.abn,
  );
  const missing =
    !!index.record &&
    !listed &&
    (!!excerpts.record || excerpts.error instanceof ApiError) &&
    !entry;
  const offline =
    excerpts.error instanceof ApiError &&
    ['offline', 'timeout'].includes(excerpts.error.code);
  const saved = recordSource(excerpts.record);
  const refreshing = index.refreshing || excerpts.refreshing;
  const title = name;
  const path = `/connections?entity=${encodeURIComponent(id)}`;
  // The bar title fades in by scroll with no width at rest, so the back
  // button keeps its label (money-03), and truncates inside the bar items.
  const barTitleRef = useRef<View>(null);
  const barTitle = useTitleOnScroll(barTitleRef, title || undefined);
  return (
    <>
      <RouteOptions
        stableItems
        options={{
          title,
          ...(missing ? {} : moneyBar({ name: title, path })),
        }}
      />
      <Screen
        onScroll={barTitle.onScroll}
        testID="connection-screen"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              index.refresh();
              excerpts.refresh();
            }}
          />
        }
      >
        {missing ? (
          <ContentUnavailable
            symbol="magnifyingglass"
            title="This name isn’t in the latest documents"
            action={{
              label: 'See all programs and places',
              onPress: () => router.push(connectionsRoute),
              testID: 'connection-missing-all',
            }}
            testID="connection-missing"
          />
        ) : !name ? (
          <MoneyStatus
            status={index.record ? excerpts : index}
            name="Programs and places"
            figure={false}
            rows={5}
            testID="connection-status"
          />
        ) : (
          <>
            <View style={{ gap: rhythm.line }}>
              {listed || entry ? (
                <Text wordSafe variant="secondary" testID="connection-meta">
                  {connectionDetail(
                    kind,
                    listed?.count ?? entry?.excerpts.length ?? 0,
                  )}
                </Text>
              ) : null}
              <View
                ref={barTitleRef}
                collapsable={false}
                onLayout={barTitle.onTitleLayout}
              >
                <Heading level={1} kind="page" testID="connection-title">
                  {name}
                </Heading>
              </View>
            </View>
            {destinations.length ? (
              <View>
                {destinations.map((d) => (
                  <LinkRow
                    key={d.kind}
                    title={d.title}
                    detail={d.detail}
                    symbol={d.symbol}
                    href={d.href}
                    testID={`connection-destination-${d.kind}`}
                  />
                ))}
              </View>
            ) : null}
            <View style={{ gap: rhythm.tight }}>
              <SectionHeader title="Excerpts" testID="connection-excerpts" />
              {entry ? (
                <>
                  {excerpts.record?.stale && !excerpts.record.staleReason ? (
                    <OfflineLine savedAt={excerpts.record.savedAt} />
                  ) : null}
                  {entry.excerpts.map((x, i) => (
                    <Excerpt key={i} excerpt={x} index={i} />
                  ))}
                  <SourceLine
                    asOf={index.record?.data.asOf}
                    citation={CONNECTIONS_CITATION}
                    savedAt={saved.savedAt}
                    state={saved.state}
                    notes={[
                      CONNECTIONS_NOTE,
                      index.record?.data.note,
                      ...saved.stateNotes,
                    ].map(readableDates)}
                    testID="connection-source"
                  />
                </>
              ) : offline ? (
                <Text wordSafe variant="secondary" testID="connection-unsaved">
                  {copy.notSaved}
                </Text>
              ) : excerpts.error ? (
                <InlineError
                  subject="Excerpts"
                  message="Excerpts couldn’t be loaded."
                  onRetry={excerpts.retry}
                  testID="connection-excerpts-error"
                />
              ) : (
                <Skeleton
                  shape="rows"
                  count={5}
                  label="Loading the excerpts"
                  testID="connection-excerpts-loading"
                />
              )}
            </View>
          </>
        )}
      </Screen>
    </>
  );
}

type ExcerptData = NonNullable<
  ReturnType<typeof import('./data').decodeEvidence>[string]
>['excerpts'][number];

/** A passage this long may run past three lines at the default text size. */
const LONG_PASSAGE = 140;
/** Grows the "More" line to the 44 pt minimum target. */
const MORE_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };

/**
 * One excerpt: its publisher and date, the passage with the matched name
 * highlighted (three lines, then "More" to read the rest in place), and the
 * original where the record links one. Speeches open no native page yet
 * (the shard carries no document slug).
 */
function Excerpt({ excerpt, index }: { excerpt: ExcerptData; index: number }) {
  const text = passageText(excerpt.text);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(text.length > LONG_PASSAGE);
  const at = excerpt.matched ? lower(text).indexOf(lower(excerpt.matched)) : -1;
  const meta = [
    publisher(excerpt.source),
    excerpt.date ? formatDate(excerpt.date, 'short') : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const body = (
    <Text
      wordSafe
      variant="recordText"
      numberOfLines={open ? undefined : 3}
      onTextLayout={(e) => {
        if (!open && e.nativeEvent.lines.length > 3) setLong(true);
      }}
    >
      {at >= 0 ? (
        <>
          {text.slice(0, at)}
          <Text variant="recordText" style={styles.match}>
            {text.slice(at, at + excerpt.matched.length)}
          </Text>
          {text.slice(at + excerpt.matched.length)}
        </>
      ) : (
        text
      )}
    </Text>
  );
  return (
    <View style={styles.excerpt} testID={`connection-excerpt-${index}`}>
      <Text wordSafe variant="footnote" tone="inkSoft">
        {meta}
      </Text>
      {body}
      {long && !open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More, ${publisher(excerpt.source)} excerpt ${index + 1}`}
          hitSlop={MORE_SLOP}
          onPress={() => setOpen(true)}
          style={styles.more}
          testID={`connection-excerpt-${index}-more`}
        >
          <Text wordSafe tone="link">
            {copy.more}
          </Text>
        </Pressable>
      ) : null}
      {excerpt.url ? (
        <LinkRow
          title={`${publisher(excerpt.source)} original`}
          external={{ url: excerpt.url, label: publisher(excerpt.source) }}
          testID={`connection-excerpt-${index}-original`}
        />
      ) : null}
    </View>
  );
}

/**
 * Where OPAX has a page for this name: the organisation's money record (by
 * ABN), the federal electorate, the grant program of the same name. Each
 * read is optional and fails quietly.
 */
function useDestinations(
  name: string | undefined,
  kind: string,
  abn: string | undefined,
): Destination[] {
  const [found, setFound] = useState<Destination[]>([]);
  useEffect(() => {
    if (!name) return;
    let active = true;
    const add = (d: Destination) =>
      active && setFound((old) => [...old.filter((o) => o.kind !== d.kind), d]);
    if (kind === 'organisation' && abn)
      add({
        kind: 'organisation',
        title: displayName(name),
        symbol: symbols.money,
        href: organisationHref(`abn:${abn}`, displayName(name)),
      });
    if (kind === 'electorate' || kind === 'place')
      void Promise.resolve()
        .then(() => catalogs.directory())
        .then((directory) => {
          const seat = directory.electorates.data.electorates.find(
            (e) =>
              e.jurisdiction === 'federal' &&
              e.chamber === 'representatives' &&
              e.status !== 'historical' &&
              lower(e.name) === lower(name),
          );
          if (seat)
            add({
              kind: 'electorate',
              title: seat.name,
              symbol: symbols.electorate,
              href: electorateRoute(seat.electorate_id, undefined, seat.name),
            });
        })
        .catch(() => undefined);
    if (kind === 'program')
      void money
        .grants('federal')
        .then((grants) => {
          const program = grants.data.programs.find(
            (p) => lower(p.listedAs) === lower(name),
          );
          if (program)
            add({
              kind: 'program',
              title: program.name,
              symbol: symbols.money,
              href: grantProgramRoute(program.id, 'federal', program.name),
            });
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [name, kind, abn]);
  return found;
}

const styles = StyleSheet.create({
  excerpt: { gap: rhythm.line, paddingVertical: rhythm.tight },
  match: { backgroundColor: colors.navyWash },
  more: { alignSelf: 'flex-start' },
});
