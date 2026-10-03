import { useState } from 'react';
import { router } from 'expo-router';
import { catalogs } from '../api/runtime';
import type { SearchPage } from '../api/catalogs';
import type { RecordResult } from '../api/client';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Group,
  OfflineBanner,
  PersonRow,
  RowList,
  Screen,
  StaleNotice,
  Text,
  errorMessage,
} from '../design/primitives';
import { personRoute } from '../navigation/routes';
export default function Search() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<RecordResult<SearchPage> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function search() {
    if (!query.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await catalogs.search(query.trim(), 'person'));
    } catch (error) {
      setError(errorMessage(error, 'search'));
    } finally {
      setBusy(false);
    }
  }
  const people =
    result?.data.results.filter((row) => row.kind === 'person') ?? [];
  return (
    <Screen testID="search-screen">
      <Text variant="lede">
        The full search screen is not built yet. This directory searches people
        in the public parliamentary record.
      </Text>
      <Group>
        <Field
          label="Find a parliamentarian"
          testID="search-input"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
          autoCorrect={false}
        />
        <Button
          label="Search people"
          variant="primary"
          testID="search-submit"
          onPress={search}
          loading={busy}
          disabled={!query.trim()}
        />
      </Group>
      {error ? (
        <ErrorState message={error} onRetry={search} testID="search-error" />
      ) : null}
      {result ? (
        <Group>
          {result.stale ? (
            <>
              <OfflineBanner testID="search-offline" />
              <StaleNotice
                savedAt={result.savedAt}
                testID="search-cache-state"
              />
            </>
          ) : (
            <Text variant="fine" testID="search-cache-state">
              Public catalog results
            </Text>
          )}
          {people.length === 0 ? (
            <EmptyState
              testID="search-empty"
              message="No people found in the available directory."
            />
          ) : (
            <RowList>
              {people.map((row) => (
                <PersonRow
                  key={row.slug}
                  testID={`search-result-${row.personSlug ?? row.slug}`}
                  name={row.title}
                  detail={row.snippet}
                  onPress={
                    row.personSlug
                      ? () => router.push(personRoute(row.personSlug!))
                      : undefined
                  }
                />
              ))}
            </RowList>
          )}
        </Group>
      ) : null}
    </Screen>
  );
}
