import { SavedCopyNotice } from './CatalogNotice';
import { useFocusRequest } from '../design/keyboard';
import { CachedPortrait } from './CachedPortrait';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  Keyboard,
  RefreshControl,
  StyleSheet,
  type ScrollView,
  type TextInput,
  type View,
} from 'react-native';
import {
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';
import { catalogs, recordSearch } from '../api/runtime';
import { RecordSearchForm } from './search/RecordSearchForm';
import { richerSuggestions } from './search/suggestions';
import {
  isMoreKind,
  type SearchFilters,
  type SearchSort,
} from './search/contracts';
import type { SearchKind } from './search/model';
import {
  suggestionsFor,
  rosterIdentityFor,
  searchPersonFor,
} from '../api/catalogs';
import type { CatalogKind } from '../api/policy';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Group,
  LoadingState,
  OfflineBanner,
  LinkRow,
  PersonRow,
  RowList,
  KeyboardStableScreen,
  Section,
  SourceLine,
  Text,
  errorMessage,
  LayoutRegion,
  SidebarSafe,
  SplitLayout,
  isPad,
  useLayout,
} from '../design/primitives';
import { colors, rhythm } from '../design/tokens';
import { CursorRow, useCursorReveal } from './split/cursor';
import {
  decodeEntry,
  encodeEntry,
  entryForWebPath,
  entryLabel,
  type RecordEntry,
} from './split/entry';
import { RecordDetail, RecordShare } from './split/RecordDetail';
import { billStatus } from '../design/parliament';
import { updatedText } from '../design/source';
import { RecordRow } from './RecordRow';
import { Excerpt } from './search/Excerpt';
import { ResultRow } from './search/ResultRow';
import { CountLine } from './search/CountLine';
import { countLabel, resultKindLabel, savedCopy } from './search/present';
import { KindPicker } from './search/KindPicker';
import { isOffline } from './CatalogState';
import {
  groupSuggestions,
  kindLabel,
  searchKinds,
  personRowContext,
} from './search/model';
import {
  openSearchPerson,
  openSuggestedPerson,
  openSearchPath,
} from './search/navigation';
import { billRoute, electorateRoute } from '../navigation/routes';

type Sources = Awaited<ReturnType<typeof catalogs.suggestionSources>>;
/** What a catalog result counts: "1 person", "3 declared interests". */
const catalogNouns: Record<CatalogKind, readonly [string, string]> = {
  person: ['person', 'people'],
  interest: ['declared interest', 'declared interests'],
  pay: ['pay record', 'pay records'],
  expense: ['expense record', 'expense records'],
};
type Results = Awaited<ReturnType<typeof catalogs.search>>;
type SearchProps = {
  initialQuery?: string;
  initialFilters?: SearchFilters;
  initialSort?: SearchSort;
  initialPage?: number;
};
/**
 * Search. On iPad regular width it is a split: the results on the left and
 * the chosen person, bill, party, electorate or record in the detail pane,
 * with the selection kept in the route (`/search?q=…&open=person:…`).
 */
export default function Search(props: SearchProps = {}) {
  // The region a split measures; iPhone keeps the bare screen (no wrapper).
  if (!isPad) return <SearchScreen {...props} />;
  return <SearchSplit {...props} />;
}
function SearchSplit(props: SearchProps) {
  const params = useLocalSearchParams<{ q?: string; open?: string }>();
  return (
    <SidebarSafe style={styles.screen}>
      <LayoutRegion style={styles.screen}>
        <SearchScreen {...props} route={params} />
      </LayoutRegion>
    </SidebarSafe>
  );
}
function SearchScreen({
  initialQuery = '',
  initialFilters,
  initialSort,
  initialPage,
  route = {},
}: SearchProps & {
  /** iPad: the route's query and selection (`/search?q=…&open=…`). */
  route?: { q?: string; open?: string };
}) {
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<SearchKind>(
    initialFilters ? 'records' : 'person',
  );
  const extended = kind === 'records' || isMoreKind(kind);
  const recordSubmit = useRef<(() => void) | null>(null);
  const [extraSources, setExtraSources] = useState<Awaited<
    ReturnType<typeof recordSearch.suggestions>
  > | null>(null);
  const [extraError, setExtraError] = useState<unknown>(null);
  const [sources, setSources] = useState<Sources | null>(null);
  const [sourceError, setSourceError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [result, setResult] = useState<Results | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [openError, setOpenError] = useState<{
    cause: unknown;
    action: () => Promise<void>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submit = useRef<View>(null);
  // Cmd-F on iPad (src/navigation/KeyboardShortcuts.tsx) focuses the field.
  const input = useRef<TextInput>(null);
  useFocusRequest('search', input);
  // iPad regular width: the split, its selection in the route.
  const split = useLayout().regular;
  const params = route;
  const selected = split ? decodeEntry(params.open) : null;
  const selectedKey = selected ? encodeEntry(selected) : null;
  const scroll = useRef<ScrollView>(null);
  const cursor = useCursorReveal(scroll);
  // On iPad the route keeps this screen mounted when `q` changes (the split
  // writes it with the selection), so a new `q` from a link is applied here.
  const wroteQuery = useRef(initialQuery);
  useEffect(() => {
    if (!isPad || params.q === undefined || params.q === wroteQuery.current)
      return;
    wroteQuery.current = params.q;
    change(params.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);
  function select(entry: RecordEntry | null) {
    // Choosing a result puts the search keyboard away, as Mail does.
    Keyboard.dismiss();
    wroteQuery.current = query.trim();
    router.setParams({
      open: entry ? encodeEntry(entry) : '',
      q: query.trim(),
    });
  }
  // The keyboard's rows, in the order they are drawn, and how each opens.
  const openers = new Map<string, () => void>();
  /**
   * A result row. On the phone (and a compact window) it is the row as it
   * always was; in the split it opens in the pane when it is a record the
   * pane draws, shows its selection, and joins the keyboard's order.
   */
  function cursorRow(
    key: string,
    entry: RecordEntry | null,
    push: () => void,
    draw: (
      state: { selected?: boolean; highlighted?: boolean },
      onPress: () => void,
    ) => ReactElement,
  ) {
    if (!split) return draw({}, push);
    const open = entry ? () => select(entry) : push;
    openers.set(key, open);
    return (
      <CursorRow key={key} rowKey={key} rows={cursor.rows}>
        {(highlighted) =>
          draw(
            {
              selected: entry ? selectedKey === key : undefined,
              highlighted,
            },
            open,
          )
        }
      </CursorRow>
    );
  }
  const request = useRef(0);
  const sourceRequest = useRef(0);
  async function loadSources(refresh = false) {
    const token = ++sourceRequest.current;
    setRefreshing(true);
    setSourceError(null);
    try {
      const data = await catalogs.suggestionSources(refresh);
      if (token === sourceRequest.current) setSources(data);
    } catch (e) {
      if (token === sourceRequest.current) setSourceError(e);
    } finally {
      if (token === sourceRequest.current) setRefreshing(false);
    }
    try {
      const data = await recordSearch.suggestions(refresh);
      if (token === sourceRequest.current) {
        setExtraSources(data);
        setExtraError(null);
      }
    } catch (e) {
      if (token === sourceRequest.current) setExtraError(e);
    }
  }
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const token = ++sourceRequest.current;
      void recordSearch
        ?.suggestions()
        .then((data) => {
          if (active && token === sourceRequest.current) {
            setExtraSources(data);
            setExtraError(null);
          }
        })
        .catch((e) => {
          if (active && token === sourceRequest.current) setExtraError(e);
        });
      void catalogs
        .suggestionSourcesOnFocus()
        .then((data) => {
          if (active && token === sourceRequest.current) {
            setSources(data);
            setSourceError(null);
          }
        })
        .catch((e) => {
          if (active && token === sourceRequest.current) setSourceError(e);
        })
        .finally(() => {
          if (active && token === sourceRequest.current) setRefreshing(false);
        });
      return () => {
        active = false;
      };
    }, []),
  );
  function change(nextQuery: string, nextKind: SearchKind = kind) {
    request.current++;
    setQuery(nextQuery);
    setKind(nextKind);
    setSubmitted(false);
    setResult(null);
    setError(null);
    setOpenError(null);
    setBusy(false);
  }
  async function search(page = 1, nextKind: CatalogKind = kind as CatalogKind) {
    if (!query.trim() || busy) return;
    Keyboard.dismiss();
    const token = ++request.current;
    if (nextKind !== kind) {
      setKind(nextKind);
      setResult(null);
    }
    setBusy(true);
    setError(null);
    setOpenError(null);
    setSubmitted(true);
    try {
      const data = await catalogs.search(query.trim(), nextKind, page);
      if (token === request.current) setResult(data);
    } catch (e) {
      if (token === request.current) setError(e);
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  async function open(action: () => Promise<void>) {
    const token = request.current;
    setOpenError(null);
    try {
      await action();
    } catch (cause) {
      if (token === request.current) setOpenError({ cause, action });
    }
  }
  const suggestions = sources
    ? suggestionsFor(query, sources.roster, sources.electorates, sources.bills)
    : null;
  const showSuggestions = query.trim().length >= 2 && !submitted;
  const richer =
    sources && extraSources
      ? richerSuggestions(
          query,
          sources.roster,
          extraSources.manifest.data,
          extraSources.reports.data,
        )
      : null;
  const sourcesStale =
    sources && Object.values(sources.provenance).some((block) => block.stale);
  const sourceReason =
    sources &&
    Object.values(sources.provenance).find((block) => block.staleReason)
      ?.staleReason;
  const noSuggestions =
    showSuggestions &&
    suggestions &&
    groupSuggestions(suggestions).every((group) => group.rows.length === 0) &&
    (!richer || Object.values(richer).every((rows) => !rows.length));
  const resultRows = result?.data.results ?? [];
  const metadata = (group: keyof Sources['provenance']) => {
    if (!sources) return null;
    const block = sources.provenance[group];
    const saved = savedCopy(block.stale, block.staleReason);
    return (
      <SourceLine
        asOf={block.asAt}
        citation={block.sources.map((s) => s.label)}
        originals={block.sources
          .filter((s) => s.url)
          .map((s) => ({ label: s.label, url: s.url }))}
        savedAt={block.stale ? block.savedAt : null}
        state={block.partial ? 'partial' : saved.state}
        notes={[
          block.partial ? 'Some rows in this export could not be read.' : null,
          saved.note,
        ]}
      />
    );
  };
  const screen = (
    <KeyboardStableScreen
      scrollRef={scroll}
      onScroll={split ? cursor.onScroll : undefined}
      testID="search-screen"
      keyboardTarget={submit}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadSources(true)}
        />
      }
    >
      <Group>
        <Field
          label={
            extended ? 'Find source records' : 'Search people, places and bills'
          }
          inputRef={input}
          testID="search-input"
          value={query}
          onChangeText={(text) => change(text)}
          onSubmitEditing={() =>
            extended ? recordSubmit.current?.() : void search()
          }
          returnKeyType="search"
          autoCorrect={false}
        />
        <KindPicker value={kind} onChange={(value) => change(query, value)} />
        {extended ? (
          <RecordSearchForm
            key={kind}
            query={query}
            scope={kind}
            roster={sources?.roster ?? null}
            onSubmitted={() => setSubmitted(true)}
            onQuery={setQuery}
            submitRef={submit}
            submitAction={recordSubmit}
            initialFilters={kind === 'records' ? initialFilters : undefined}
            initialSort={kind === 'records' ? initialSort : undefined}
            initialPage={kind === 'records' ? initialPage : undefined}
            openInPane={
              split
                ? (path, title) => {
                    const entry = entryForWebPath(path, title);
                    if (entry) select(entry);
                    return !!entry;
                  }
                : undefined
            }
            selectedPath={
              split
                ? (path) => {
                    const entry = entryForWebPath(path);
                    return entry
                      ? encodeEntry(entry) === selectedKey
                      : undefined;
                  }
                : undefined
            }
            cursorReveal={split ? cursor : undefined}
          />
        ) : (
          <Button
            label={`Search ${kindLabel(kind).toLowerCase()}`}
            variant="primary"
            ref={submit}
            testID="search-submit"
            onPress={() => void search()}
            loading={busy}
            disabled={!query.trim()}
          />
        )}
      </Group>
      {error ? (
        <Group>
          {isOffline(error) && !result ? (
            <OfflineBanner cached={false} testID="search-offline-uncached" />
          ) : null}
          <ErrorState
            message={errorMessage(error, 'search')}
            onRetry={() => void search()}
            testID="search-error"
          />
        </Group>
      ) : null}
      {openError ? (
        <ErrorState
          message={errorMessage(openError.cause)}
          onRetry={() => void open(openError.action)}
          testID="search-open-error"
        />
      ) : null}
      {!submitted ? (
        <>
          {!showSuggestions ||
          sourceError ||
          !sources ||
          sourcesStale ||
          noSuggestions ? (
            <Section
              title={showSuggestions ? undefined : 'Browse'}
              accent="people"
            >
              {sourceError ? (
                <Group>
                  {isOffline(sourceError) && !sources ? (
                    <OfflineBanner cached={false} />
                  ) : null}
                  <ErrorState
                    message={errorMessage(sourceError)}
                    onRetry={() => void loadSources(true)}
                    testID="search-suggestions-error"
                  />
                </Group>
              ) : null}
              {!sources && !sourceError ? (
                <LoadingState
                  label="Loading suggestions"
                  testID="search-suggestions-loading"
                />
              ) : null}
              {sourcesStale ? (
                <SavedCopyNotice
                  reason={sourceReason ?? undefined}
                  testID={
                    sourceReason
                      ? 'search-suggestions-saved-copy'
                      : 'search-suggestions-offline'
                  }
                />
              ) : null}
              {noSuggestions ? (
                <EmptyState
                  message={`No suggestions for “${query.trim()}”. Search the available catalogs using the selected kind.`}
                  testID="search-suggestions-empty"
                />
              ) : null}
              {!showSuggestions ? (
                <>
                  <RowList>
                    <LinkRow
                      title="Parliamentarians"
                      icon="person.2"
                      accent="people"
                      testID="search-browse-person"
                      onPress={() =>
                        router.push({
                          pathname: '/directory',
                          params: { kind: 'person' },
                        })
                      }
                    />
                    <LinkRow
                      title="Parties"
                      icon="person.3"
                      accent="people"
                      testID="search-browse-party"
                      onPress={() =>
                        router.push({
                          pathname: '/directory',
                          params: { kind: 'party' },
                        })
                      }
                    />
                    <LinkRow
                      title="Electorates"
                      icon="map"
                      accent="people"
                      testID="search-browse-electorate"
                      onPress={() =>
                        router.push({
                          pathname: '/directory',
                          params: { kind: 'electorate' },
                        })
                      }
                    />
                  </RowList>
                  <Button
                    label="Refresh suggestions"
                    variant="quiet"
                    size="compact"
                    icon="arrow.clockwise"
                    testID="search-refresh"
                    onPress={() => void loadSources(true)}
                    loading={refreshing}
                  />
                </>
              ) : null}
            </Section>
          ) : null}
          {showSuggestions && suggestions?.people.length ? (
            <Section
              title="People"
              accent="people"
              testID="search-suggestions-people"
            >
              <RowList>
                {suggestions.people.slice(0, 8).map((p) =>
                  cursorRow(
                    `person-name:${p.name}`,
                    { kind: 'person-name', key: p.name, title: p.name },
                    () => void open(() => openSuggestedPerson(p.name)),
                    (state, onPress) => (
                      <PersonRow
                        key={p.name}
                        {...personRowContext(rosterIdentityFor(p, sources!))}
                        {...state}
                        name={p.name}
                        portrait={<CachedPortrait name={p.name} />}
                        testID={`search-suggestion-person-${p.pid ?? p.name}`}
                        onPress={onPress}
                      />
                    ),
                  ),
                )}
              </RowList>
              {metadata('people')}
            </Section>
          ) : null}
          {showSuggestions && suggestions?.electorates.length ? (
            <Section
              title="Electorates"
              accent="people"
              testID="search-suggestions-electorates"
            >
              <RowList>
                {suggestions.electorates.slice(0, 8).map((s) =>
                  cursorRow(
                    `electorate:${s.electorate_id}`,
                    { kind: 'electorate', key: s.electorate_id, title: s.name },
                    () => router.push(electorateRoute(s.electorate_id)),
                    (state, onPress) => (
                      <RecordRow
                        key={s.electorate_id}
                        {...state}
                        title={s.name}
                        detail={s.representatives
                          .map((r) => r.person.name)
                          .join('; ')}
                        testID={`search-suggestion-electorate-${s.electorate_id}`}
                        onPress={onPress}
                      />
                    ),
                  ),
                )}
              </RowList>
              {metadata('electorates')}
            </Section>
          ) : null}
          {showSuggestions && suggestions?.bills.length ? (
            <Section
              title="Bills"
              accent="bills"
              testID="search-suggestions-bills"
            >
              <RowList>
                {suggestions.bills.slice(0, 8).map((b) =>
                  cursorRow(
                    `bill:${b.key}`,
                    { kind: 'bill', key: b.key, title: b.title },
                    () => router.push(billRoute(b.key)),
                    (state, onPress) => (
                      <RecordRow
                        key={b.key}
                        {...state}
                        accent="bills"
                        title={b.title}
                        detail={billStatus(b.status)}
                        onPress={onPress}
                      />
                    ),
                  ),
                )}
              </RowList>
              {metadata('bills')}
            </Section>
          ) : null}
          {showSuggestions && richer ? (
            <>
              {richer.parties.length ? (
                <Section
                  title="Parties"
                  accent="people"
                  testID="search-suggestions-parties"
                >
                  <RowList>
                    {richer.parties.map((p) =>
                      cursorRow(
                        `party:${p}`,
                        { kind: 'party', key: p, title: p },
                        () =>
                          void open(() =>
                            openSearchPath(
                              `/subject/party/${encodeURIComponent(p)}`,
                              p,
                            ),
                          ),
                        (state, onPress) => (
                          <RecordRow
                            key={p}
                            {...state}
                            title={p}
                            testID={`search-suggestion-party-${p}`}
                            onPress={onPress}
                          />
                        ),
                      ),
                    )}
                  </RowList>
                  {metadata('people')}
                </Section>
              ) : null}
              {richer.topics.length ? (
                <Section
                  title="Topics"
                  accent="bills"
                  testID="search-suggestions-topics"
                >
                  <RowList>
                    {richer.topics.map((t) =>
                      cursorRow(
                        `topic:${t.slug}`,
                        null,
                        () =>
                          void open(() =>
                            openSearchPath(`/subject/topic/${t.slug}`, t.title),
                          ),
                        (state, onPress) => (
                          <RecordRow
                            key={t.slug}
                            {...state}
                            title={t.title}
                            testID={`search-suggestion-topic-${t.slug}`}
                            onPress={onPress}
                          />
                        ),
                      ),
                    )}
                  </RowList>
                  <SourceLine asOf={null} citation="OPAX topic taxonomy" />
                </Section>
              ) : null}
              {richer.reports.length ? (
                <Section
                  title="Reports"
                  accent="leads"
                  testID="search-suggestions-reports"
                >
                  <RowList>
                    {richer.reports.map((r) =>
                      cursorRow(
                        `report:${r.slug}`,
                        null,
                        () =>
                          void open(() =>
                            openSearchPath(`/reports/${r.slug}`, r.title),
                          ),
                        (state, onPress) => (
                          <RecordRow
                            key={r.slug}
                            {...state}
                            title={r.title}
                            detail={[r.blurb, updatedText(r.updated)]
                              .filter(Boolean)
                              .join('\n')}
                            testID={`search-suggestion-report-${r.slug}`}
                            onPress={onPress}
                          />
                        ),
                      ),
                    )}
                  </RowList>
                  <SourceLine
                    asOf={
                      richer.reports
                        .map((r) => r.updated)
                        .sort()
                        .at(-1) ?? null
                    }
                    citation="OPAX reports index"
                  />
                </Section>
              ) : null}
              {extraSources?.manifest.stale || extraSources?.reports.stale ? (
                <SavedCopyNotice
                  reason={
                    extraSources.manifest.staleReason ??
                    extraSources.reports.staleReason
                  }
                />
              ) : null}
            </>
          ) : null}
          {showSuggestions && extraError ? (
            <ErrorState
              message="Party, topic and report suggestions are temporarily unavailable."
              onRetry={() => void loadSources(true)}
            />
          ) : null}
          {showSuggestions ? (
            <Button
              label="Refresh suggestions"
              variant="quiet"
              size="compact"
              icon="arrow.clockwise"
              testID="search-refresh"
              onPress={() => void loadSources(true)}
              loading={refreshing}
            />
          ) : null}
        </>
      ) : null}
      {submitted && !extended ? (
        <Section accent="people" testID="search-results">
          {busy && !result ? (
            <LoadingState
              label={`Searching ${kindLabel(kind).toLowerCase()}`}
              shape="people"
              testID="search-loading"
            />
          ) : null}
          {result ? (
            <Group>
              <CountLine
                label={countLabel(
                  result.data.total,
                  catalogNouns[kind as CatalogKind],
                )}
                testID="search-count"
              />
              {kind === 'pay' ? (
                <Text variant="metadata" testID="search-pay-caveat">
                  These are entitlements set by instrument, not payslips.
                </Text>
              ) : null}
              {!resultRows.length ? (
                <Group>
                  <EmptyState
                    testID="search-empty"
                    message={`No results for “${result.data.query}” in ${kindLabel(kind).toLowerCase()}. Choose another kind to search.`}
                  />
                  {searchKinds
                    .filter((option) => option.value !== kind)
                    .map((option) => (
                      <Button
                        key={option.value}
                        label={`Search ${option.label.toLowerCase()}`}
                        testID={`search-empty-${option.value}`}
                        disabled={busy}
                        onPress={() => void search(1, option.value)}
                      />
                    ))}
                </Group>
              ) : (
                <RowList>
                  {resultRows.map((row) =>
                    row.personSlug ? (
                      <Group key={row.slug} gap={rhythm.tight}>
                        {cursorRow(
                          `search-person:${row.personSlug}`,
                          {
                            kind: 'search-person',
                            key: row.personSlug,
                            title: row.title,
                          },
                          () =>
                            void open(() => openSearchPerson(row.personSlug!)),
                          (state, onPress) => (
                            <PersonRow
                              {...personRowContext(
                                sources
                                  ? searchPersonFor(row.personSlug!, sources)
                                  : null,
                              )}
                              {...state}
                              name={row.title}
                              portrait={
                                <CachedPortrait
                                  name={row.title}
                                  slug={row.personSlug}
                                />
                              }
                              testID={`search-result-${row.personSlug}`}
                              onPress={onPress}
                            />
                          ),
                        )}
                        <Excerpt
                          snippet={row.snippet}
                          resource={row.resource}
                          query={result.data.query}
                        />
                      </Group>
                    ) : (
                      <ResultRow
                        key={row.slug}
                        title={row.title}
                        meta={resultKindLabel(row.kind)}
                        accent="people"
                        testID={`search-result-${row.slug}`}
                        onPress={() =>
                          void open(() => openSearchPath(row.href, row.title))
                        }
                      >
                        <Excerpt
                          snippet={row.snippet}
                          resource={row.resource}
                          query={result.data.query}
                        />
                      </ResultRow>
                    ),
                  )}
                </RowList>
              )}
              <SourceLine
                title="About these results"
                asOf={result.asOf}
                citation={[
                  ...new Set(
                    resultRows
                      .map((row) => row.source)
                      .filter((s): s is string => !!s),
                  ),
                ]}
                savedAt={result.stale ? result.savedAt : null}
                state={
                  result.partial
                    ? 'partial'
                    : savedCopy(result.stale, result.staleReason).state
                }
                originals={resultRows.flatMap((row) =>
                  row.url
                    ? [
                        {
                          label: row.source || 'Original source',
                          url: row.url,
                          record: row.title,
                        },
                      ]
                    : [],
                )}
                notes={[
                  result.partial
                    ? 'Some rows in this export could not be read.'
                    : null,
                  savedCopy(result.stale, result.staleReason).note,
                  ...result.data.warnings,
                  result.data.coverage,
                ]}
                testID="search-as-at"
              />
              {result.data.page > 1 ? (
                <Button
                  label="Previous results"
                  variant="quiet"
                  icon="chevron.up"
                  onPress={() => void search(result.data.page - 1)}
                  disabled={busy}
                />
              ) : null}
              {result.data.page * result.data.per_page < result.data.total ? (
                <Button
                  label="More results"
                  variant="quiet"
                  icon="chevron.down"
                  onPress={() => void search(result.data.page + 1)}
                  disabled={busy}
                />
              ) : null}
            </Group>
          ) : null}
        </Section>
      ) : null}
    </KeyboardStableScreen>
  );
  if (!isPad) return screen;
  const keys = [...openers.keys()];
  return (
    <>
      {/* The list column keeps an inline title; large titles over two
          panes would collapse with whichever scrolls first. */}
      <Stack.Screen options={{ headerLargeTitleEnabled: !split }} />
      <SplitLayout<RecordEntry>
        id="search"
        testID="search-split"
        list={screen}
        selected={selected}
        onSelect={select}
        entryKey={encodeEntry}
        entryTitle={entryLabel}
        renderDetail={(entry) => <RecordDetail entry={entry} />}
        detailActions={(entry) => <RecordShare entry={entry} />}
        // RecordSearchForm owns its loaded result order and keyboard cursor.
        // The outer split must not reclaim those keys when the tab refocuses.
        keys={extended ? undefined : keys}
        onOpenKey={(key) => openers.get(key)?.()}
        onCursor={cursor.reveal}
        empty={
          <EmptyState
            size="pane"
            icon="magnifyingglass"
            title="Nothing open"
            testID="search-split-empty"
          />
        }
      />
    </>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
});
