import { PartialNotice, SavedCopyNotice } from './CatalogNotice';
import { CachedPortrait } from './CachedPortrait';
import { useCallback, useRef, useState } from 'react';
import { Keyboard, RefreshControl, type View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
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
  AsAtLine,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Group,
  LoadingState,
  OfflineBanner,
  OpaxWebLink,
  PersonRow,
  RowList,
  KeyboardStableScreen,
  Section,
  SourceLink,
  StaleNotice,
  Text,
  errorMessage,
} from '../design/primitives';
import { billStatus } from '../design/parliament';
import { RecordRow } from './RecordRow';
import { Excerpt } from './search/Excerpt';
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
type Results = Awaited<ReturnType<typeof catalogs.search>>;
export default function Search({
  initialQuery = '',
  initialFilters,
  initialSort,
  initialPage,
}: {
  initialQuery?: string;
  initialFilters?: SearchFilters;
  initialSort?: SearchSort;
  initialPage?: number;
} = {}) {
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
  const metadata = (group: keyof Sources['provenance']) =>
    sources ? (
      <Group>
        {sources.provenance[group].partial ? <PartialNotice /> : null}
        {sources.provenance[group].stale &&
        sources.provenance[group].savedAt !== null ? (
          <StaleNotice
            savedAt={sources.provenance[group].savedAt!}
            refreshing={refreshing}
          />
        ) : null}
        <AsAtLine
          asOf={sources.provenance[group].asAt}
          citation={sources.provenance[group].sources.map((s) => s.label)}
          savedAt={
            sources.provenance[group].stale
              ? sources.provenance[group].savedAt
              : null
          }
        />
      </Group>
    ) : null;
  return (
    <KeyboardStableScreen
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
            <Section title={showSuggestions ? undefined : 'Browse'}>
              {!showSuggestions ? (
                <Button
                  label="Refresh suggestions"
                  size="compact"
                  testID="search-refresh"
                  onPress={() => void loadSources(true)}
                  loading={refreshing}
                />
              ) : null}
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
                  <OpaxWebLink
                    label="Parliamentarians"
                    path="/subject/person"
                  />
                  <OpaxWebLink label="Electorates" path="/subject/electorate" />
                  <Text variant="fine">
                    Bill searches use the saved bill titles in Bills.
                  </Text>
                </>
              ) : null}
            </Section>
          ) : null}
          {showSuggestions && suggestions?.people.length ? (
            <Section title="People" testID="search-suggestions-people">
              <RowList>
                {suggestions.people.slice(0, 8).map((p) => (
                  <PersonRow
                    key={p.name}
                    {...personRowContext(rosterIdentityFor(p, sources!))}
                    name={p.name}
                    portrait={<CachedPortrait name={p.name} />}
                    testID={`search-suggestion-person-${p.pid ?? p.name}`}
                    onPress={() => void open(() => openSuggestedPerson(p.name))}
                  />
                ))}
              </RowList>
              {metadata('people')}
            </Section>
          ) : null}
          {showSuggestions && suggestions?.electorates.length ? (
            <Section
              title="Electorates"
              testID="search-suggestions-electorates"
            >
              <RowList>
                {suggestions.electorates.slice(0, 8).map((s) => (
                  <RecordRow
                    key={s.electorate_id}
                    title={s.name}
                    detail={s.representatives
                      .map((r) => r.person.name)
                      .join('; ')}
                    testID={`search-suggestion-electorate-${s.electorate_id}`}
                    onPress={() =>
                      router.push(electorateRoute(s.electorate_id))
                    }
                  />
                ))}
              </RowList>
              {metadata('electorates')}
            </Section>
          ) : null}
          {showSuggestions && suggestions?.bills.length ? (
            <Section title="Bills" testID="search-suggestions-bills">
              <RowList>
                {suggestions.bills.slice(0, 8).map((b) => (
                  <RecordRow
                    key={b.key}
                    title={b.title}
                    detail={billStatus(b.status)}
                    onPress={() => router.push(billRoute(b.key))}
                  />
                ))}
              </RowList>
              {metadata('bills')}
            </Section>
          ) : null}
          {showSuggestions && richer ? (
            <>
              {richer.parties.length ? (
                <Section title="Parties" testID="search-suggestions-parties">
                  <RowList>
                    {richer.parties.map((p) => (
                      <RecordRow
                        key={p}
                        title={p}
                        testID={`search-suggestion-party-${p}`}
                        onPress={() =>
                          void open(() =>
                            openSearchPath(
                              `/subject/party/${encodeURIComponent(p)}`,
                              p,
                            ),
                          )
                        }
                      />
                    ))}
                  </RowList>
                  {metadata('people')}
                </Section>
              ) : null}
              {richer.topics.length ? (
                <Section title="Topics" testID="search-suggestions-topics">
                  <RowList>
                    {richer.topics.map((t) => (
                      <RecordRow
                        key={t.slug}
                        title={t.title}
                        testID={`search-suggestion-topic-${t.slug}`}
                        onPress={() =>
                          void open(() =>
                            openSearchPath(`/subject/topic/${t.slug}`, t.title),
                          )
                        }
                      />
                    ))}
                  </RowList>
                  <AsAtLine asOf={null} citation="OPAX topic taxonomy" />
                </Section>
              ) : null}
              {richer.reports.length ? (
                <Section title="Reports" testID="search-suggestions-reports">
                  <RowList>
                    {richer.reports.map((r) => (
                      <Group key={r.slug}>
                        <RecordRow
                          title={r.title}
                          detail={r.blurb}
                          testID={`search-suggestion-report-${r.slug}`}
                          onPress={() =>
                            void open(() =>
                              openSearchPath(`/reports/${r.slug}`, r.title),
                            )
                          }
                        />
                        <AsAtLine
                          asOf={r.updated}
                          citation="OPAX reports index"
                        />
                      </Group>
                    ))}
                  </RowList>
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
            <Section>
              <Button
                label="Refresh suggestions"
                size="compact"
                testID="search-refresh"
                onPress={() => void loadSources(true)}
                loading={refreshing}
              />
            </Section>
          ) : null}
        </>
      ) : null}
      {submitted && !extended ? (
        <Section
          title={`Results for “${result?.data.query ?? query.trim()}” · ${kindLabel(kind)}`}
        >
          {kind === 'pay' ? (
            <Text variant="metadata" testID="search-pay-caveat">
              These are entitlements set by instrument, not payslips.
            </Text>
          ) : null}
          {busy && !result ? (
            <LoadingState
              label={`Searching ${kindLabel(kind).toLowerCase()}`}
              shape="people"
              testID="search-loading"
            />
          ) : null}
          {result ? (
            <Group>
              {result.stale ? (
                <>
                  <SavedCopyNotice
                    reason={result.staleReason}
                    testID={
                      result.staleReason
                        ? 'search-saved-copy'
                        : 'search-offline'
                    }
                  />
                  <StaleNotice
                    savedAt={result.savedAt}
                    refreshing={busy}
                    testID="search-cache-state"
                  />
                </>
              ) : (
                <Text variant="fine" testID="search-cache-state">
                  Public catalog results
                </Text>
              )}
              {result.partial ? (
                <PartialNotice testID="search-partial" />
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
                  {resultRows.map((row) => (
                    <Group key={row.slug}>
                      {row.personSlug ? (
                        <PersonRow
                          {...personRowContext(
                            sources
                              ? searchPersonFor(row.personSlug, sources)
                              : null,
                          )}
                          name={row.title}
                          portrait={
                            <CachedPortrait
                              name={row.title}
                              slug={row.personSlug}
                            />
                          }
                          testID={`search-result-${row.personSlug}`}
                          onPress={() =>
                            void open(() => openSearchPerson(row.personSlug!))
                          }
                        />
                      ) : (
                        <Text wordSafe variant="strong">
                          {row.title}
                        </Text>
                      )}
                      <Excerpt snippet={row.snippet} />
                      {row.url ? (
                        <SourceLink
                          citation={row.source || 'Original source'}
                          url={row.url}
                          kind="record"
                          testID={`search-source-${row.slug}`}
                        />
                      ) : !row.personSlug ? (
                        <OpaxWebLink
                          label="Open the record"
                          path={row.href}
                          testID={`search-source-${row.slug}`}
                        />
                      ) : null}
                    </Group>
                  ))}
                </RowList>
              )}
              {result.data.warnings.map((warning) => (
                <Text key={warning} variant="fine">
                  {warning}
                </Text>
              ))}
              {result.data.coverage ? (
                <Text variant="fine">{result.data.coverage}</Text>
              ) : null}
              <AsAtLine
                asOf={result.asOf}
                citation={[
                  ...new Set(
                    resultRows
                      .map((row) => row.source)
                      .filter((s): s is string => !!s),
                  ),
                ]}
                savedAt={result.stale ? result.savedAt : null}
                testID="search-as-at"
              />
              {result.data.page > 1 ? (
                <Button
                  label="Previous results"
                  onPress={() => void search(result.data.page - 1)}
                  disabled={busy}
                />
              ) : null}
              {result.data.page * result.data.per_page < result.data.total ? (
                <Button
                  label="More results"
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
}
