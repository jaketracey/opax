import { useEffect, useRef, useState } from 'react';
import { Keyboard, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { catalogs } from '../api/runtime';
import { suggestionsFor } from '../api/catalogs';
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
  Screen,
  Section,
  SegmentedControl,
  SourceLink,
  StaleNotice,
  Text,
  errorMessage,
} from '../design/primitives';
import { RecordRow } from './RecordRow';
import { isOffline } from './CatalogState';
import { groupSuggestions, kindLabel, searchKinds } from './search/model';
import { openSearchPerson, openSuggestedPerson } from './search/navigation';
import { openOnWeb } from '../navigation/external';

type Sources = Awaited<ReturnType<typeof catalogs.suggestionSources>>;
type Results = Awaited<ReturnType<typeof catalogs.search>>;
export default function Search() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<CatalogKind>('person');
  const [sources, setSources] = useState<Sources | null>(null);
  const [sourceError, setSourceError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [result, setResult] = useState<Results | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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
  }
  useEffect(() => {
    let active = true;
    void catalogs
      .suggestionSources()
      .then((data) => {
        if (active) setSources(data);
      })
      .catch((e) => {
        if (active) setSourceError(e);
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, []);
  function change(nextQuery: string, nextKind = kind) {
    request.current++;
    setQuery(nextQuery);
    setKind(nextKind);
    setSubmitted(false);
    setResult(null);
    setError(null);
    setBusy(false);
  }
  async function search(page = 1) {
    if (!query.trim() || busy) return;
    Keyboard.dismiss();
    const token = ++request.current;
    setBusy(true);
    setError(null);
    setSubmitted(true);
    try {
      const data = await catalogs.search(query.trim(), kind, page);
      if (token === request.current) setResult(data);
    } catch (e) {
      if (token === request.current) setError(e);
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  async function open(action: () => Promise<void>) {
    try {
      await action();
    } catch (e) {
      setError(e);
    }
  }
  const suggestions = sources
    ? suggestionsFor(query, sources.roster, sources.electorates, sources.bills)
    : null;
  const showSuggestions = query.trim().length >= 2 && !submitted;
  const resultRows = result?.data.results ?? [];
  const metadata = (group: keyof Sources['provenance']) =>
    sources ? (
      <Group>
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
    <Screen
      testID="search-screen"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadSources(true)}
        />
      }
    >
      <Group>
        <Field
          label="Search people, places and bills"
          testID="search-input"
          value={query}
          onChangeText={(text) => change(text)}
          onSubmitEditing={() => void search()}
          returnKeyType="search"
          autoCorrect={false}
        />
        <SegmentedControl
          segments={searchKinds}
          value={kind}
          onChange={(value) => change(query, value)}
          testID="search-kinds"
        />
        <Button
          label={`Search ${kindLabel(kind).toLowerCase()}`}
          variant="primary"
          testID="search-submit"
          onPress={() => void search()}
          loading={busy}
          disabled={!query.trim()}
        />
      </Group>
      {error ? (
        <Group>
          {isOffline(error) && !result ? (
            <OfflineBanner cached={false} />
          ) : null}
          <ErrorState
            message={errorMessage(error, 'search')}
            onRetry={() => void search()}
            testID="search-error"
          />
        </Group>
      ) : null}
      {!submitted ? (
        <>
          <Section title={showSuggestions ? 'Suggestions' : 'Browse'}>
            <Button
              label="Refresh suggestions"
              size="compact"
              testID="search-refresh"
              onPress={() => void loadSources(true)}
              loading={refreshing}
            />
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
            {sources &&
            Object.values(sources.provenance).some((b) => b.stale) ? (
              <OfflineBanner testID="search-suggestions-offline" />
            ) : null}
            {showSuggestions &&
            suggestions &&
            groupSuggestions(suggestions).every(
              (group) => group.rows.length === 0,
            ) ? (
              <EmptyState
                message={`No suggestions for “${query.trim()}”. Search the available catalogs using the selected kind.`}
                testID="search-suggestions-empty"
              />
            ) : null}
            {!showSuggestions ? (
              <>
                <OpaxWebLink label="Parliamentarians" path="/subject/person" />
                <OpaxWebLink label="Electorates" path="/subject/electorate" />
                <Text variant="fine">
                  Bill searches use the saved bill titles in Bills.
                </Text>
              </>
            ) : null}
          </Section>
          {showSuggestions && suggestions?.people.length ? (
            <Section title="People" testID="search-suggestions-people">
              <RowList>
                {suggestions.people.slice(0, 8).map((p) => (
                  <PersonRow
                    key={p.name}
                    name={p.name}
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
                    onPress={() => void open(() => openOnWeb(s.url, s.name))}
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
                    detail={b.status}
                    onPress={() =>
                      router.push({
                        pathname: '/recent-bill/[key]',
                        params: { key: b.key },
                      })
                    }
                  />
                ))}
              </RowList>
              {metadata('bills')}
            </Section>
          ) : null}
        </>
      ) : null}
      {submitted ? (
        <Section
          title={`Results for “${result?.data.query ?? query.trim()}” · ${kindLabel(kind)}`}
        >
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
                  <OfflineBanner testID="search-offline" />
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
              {!resultRows.length ? (
                <EmptyState
                  testID="search-empty"
                  message={`No results for “${result.data.query}” in ${kindLabel(kind).toLowerCase()}. Choose another kind to search.`}
                />
              ) : (
                <RowList>
                  {resultRows.map((row) => (
                    <Group key={row.slug}>
                      {row.personSlug ? (
                        <PersonRow
                          name={row.title}
                          detail={row.snippet}
                          testID={`search-result-${row.personSlug}`}
                          onPress={() =>
                            void open(() => openSearchPerson(row.personSlug!))
                          }
                        />
                      ) : (
                        <Text variant="strong">{row.title}</Text>
                      )}
                      {!row.personSlug && row.snippet ? (
                        <Text>{row.snippet}</Text>
                      ) : null}
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
    </Screen>
  );
}
